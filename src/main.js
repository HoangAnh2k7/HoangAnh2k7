import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { readFile, writeFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { Store } from './core/store.js';
import { startApi } from './core/api.js';
import { Browsers } from './core/browser.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataOverride = process.env.PROFILE_STUDIO_DATA;
if (dataOverride) app.setPath('userData', dataOverride);
let control, store, browsers, api;
const tasks = []; let quitting = false;
const managerUrl = pathToFileURL(join(here, 'renderer/index.html')).href;
const snapshot = () => ({ ...store.snapshot(), running: browsers.running(), tasks: structuredClone(tasks),
  platform: process.platform, version: app.getVersion(), sync: browsers.sync ? { leaderId: browsers.sync.leaderId, followerIds: browsers.sync.followerIds } : null,
  api: { running: Boolean(api), port: api?.address()?.port || null }, dataDirectory: app.getPath('userData') });
function changed() { if (control && !control.isDestroyed() && store && browsers) control.webContents.send('desktop:state', snapshot()); }
async function task(name, action) {
  const item = { id: randomUUID(), name, status: 'running', detail: '', startedAt: new Date().toISOString() };
  tasks.unshift(item); if (tasks.length > 100) tasks.pop(); changed();
  try { const result = await action(detail => { item.detail = detail; changed(); }); item.status = 'done'; item.result = result; return result; }
  catch (e) { item.status = 'error'; item.detail = e.message; throw e; }
  finally { item.finishedAt = new Date().toISOString(); changed(); }
}
function safeRows(profiles) {
  return profiles.map(p => ({ name: p.name, groupId: p.groupId, tagIds: JSON.stringify(p.tagIds), proxyId: p.proxyId,
    startUrls: JSON.stringify(p.startUrls), userAgent: p.userAgent, language: p.language, timezone: p.timezone,
    width: p.width, height: p.height, notes: p.notes, color: p.color }));
}
const columns = ['name','groupId','tagIds','proxyId','startUrls','userAgent','language','timezone','width','height','notes','color'];
async function importProfiles() {
  const pick = await dialog.showOpenDialog(control, { title: 'Nhập cấu hình hồ sơ', properties: ['openFile'], filters: [{ name: 'Hồ sơ', extensions: ['json','csv','xlsx'] }] });
  if (pick.canceled) return { canceled: true };
  const file = pick.filePaths[0]; if ((await stat(file)).size > 25 * 1024 * 1024) throw new Error('Tệp nhập tối đa 25 MB.');
  if (extname(file).toLowerCase() === '.json') {
    const input = JSON.parse(await readFile(file, 'utf8'));
    return store.importBundle(input);
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = extname(file).toLowerCase() === '.csv' ? await workbook.csv.readFile(file) : (await workbook.xlsx.readFile(file)).worksheets[0];
  if (!sheet || sheet.rowCount > 5001 || sheet.columnCount > 50) throw new Error('Bảng tối đa 5000 hồ sơ và 50 cột.');
  const headers = sheet.getRow(1).values.slice(1).map(String);
  const profiles = [];
  const cellText = value => value == null ? '' : typeof value === 'object' ? (value.text ?? value.result ?? '') : value;
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const entry = {}; headers.forEach((header, i) => { if (columns.includes(header)) entry[header] = cellText(row.getCell(i + 1).value); });
    for (const key of ['width','height']) if (entry[key] !== undefined && entry[key] !== '') entry[key] = Number(entry[key]); else delete entry[key];
    for (const key of ['tagIds','startUrls']) { if (entry[key]) entry[key] = JSON.parse(String(entry[key])); else delete entry[key]; }
    profiles.push(entry);
  });
  return store.importProfiles({ profiles });
}
async function exportProfiles({ ids, format = 'json' }) {
  if (!['json','csv','xlsx'].includes(format)) throw new Error('Định dạng xuất không hợp lệ.');
  const state = store.snapshot(); if (Array.isArray(ids) && !ids.length) ids = undefined; const profiles = state.profiles.filter(p => ids ? ids.includes(p.id) : !p.archived);
  const pick = await dialog.showSaveDialog(control, { title: 'Xuất cấu hình (không gồm cookie và mật khẩu proxy)', defaultPath: `profile-studio.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (pick.canceled) return { canceled: true };
  if (format === 'json') await writeFile(pick.filePath, JSON.stringify(store.exportBundle({ ids, includeSecrets: false }), null, 2), { mode: 0o600 });
  else {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Profiles'); ws.columns = columns.map(key => ({ header: key, key, width: 24 }));
    for (const row of safeRows(profiles)) {
      // Spreadsheet formula prefixes remain literal in CSV readers.
      if (format === 'csv') for (const k of Object.keys(row)) if (typeof row[k] === 'string' && /^[=+@\-\t\r]/.test(row[k])) row[k] = `'${row[k]}`;
      ws.addRow(row);
    }
    if (format === 'csv') await wb.csv.writeFile(pick.filePath); else await wb.xlsx.writeFile(pick.filePath);
  }
  return { exported: profiles.length, file: pick.filePath };
}
async function cookieDialog(id, mode) {
  if (mode === 'export') {
    const pick = await dialog.showSaveDialog(control, { title: 'Xuất cookie chứa dữ liệu đăng nhập — giữ tệp riêng tư', defaultPath: 'cookies.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (pick.canceled) return { canceled: true };
    const cookies = await browsers.cookies(id); await writeFile(pick.filePath, JSON.stringify(cookies, null, 2), { mode: 0o600 }); return { exported: cookies.length };
  }
  const pick = await dialog.showOpenDialog(control, { title: 'Nhập cookie JSON', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (pick.canceled) return { canceled: true };
  if ((await stat(pick.filePaths[0])).size > 10 * 1024 * 1024) throw new Error('Tệp cookie quá lớn.');
  return browsers.cookies(id, JSON.parse(await readFile(pick.filePaths[0], 'utf8')));
}
async function configureApi() {
  if (api) { await new Promise(resolve => { api.close(resolve); api.closeAllConnections(); }); api = null; }
  const s = store.snapshot().settings;
  if (s.apiEnabled) api = await startApi({ port: s.apiPort, token: s.apiToken, dispatch });
}
async function dispatch(method, args = {}) {
  if (typeof method !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Yêu cầu không hợp lệ.');
  let result;
  switch (method) {
    case 'state': return snapshot();
    case 'profile.save': result = store.saveProfile(args); break;
    case 'profile.bulkCreate': result = store.bulkCreate(args); break;
    case 'profile.clone': result = store.cloneProfile(args); break;
    case 'profile.import': result = store.importProfiles(args); break;
    case 'profile.delete':
      if (!Array.isArray(args.ids)) throw new Error('Cần danh sách ID.');
      if (args.ids.some(id => browsers.windows.has(id) || browsers.starting.has(id))) throw new Error('Đóng các hồ sơ trước khi chuyển vào thùng rác.');
      result = store.archiveProfiles(args); break;
    case 'profile.restore': result = store.restoreProfiles(args); break;
    case 'profile.bulkEdit': result = store.bulkEditProfiles(args); break;
    case 'profile.purge': {
      if (!Array.isArray(args.ids) || !args.ids.length) throw new Error('Chọn hồ sơ trong thùng rác.');
      for (const id of args.ids) {
        const p = browsers.profile(id);
        if (!p.archived) throw new Error('Chỉ xóa vĩnh viễn hồ sơ trong thùng rác.');
        if (browsers.windows.has(id) || browsers.starting.has(id)) throw new Error('Đóng hồ sơ trước khi xóa.');
      }
      const answer = await dialog.showMessageBox(control, { type: 'warning', message: `Xóa vĩnh viễn ${args.ids.length} hồ sơ và dữ liệu trình duyệt? Không thể hoàn tác.`, buttons: ['Hủy', 'Xóa vĩnh viễn'], defaultId: 0, cancelId: 0 });
      if (answer.response !== 1) return { canceled: true };
      for (const id of args.ids) await browsers.clear(id);
      result = store.deleteProfiles(args); break;
    }
    case 'collection.save': result = store.saveCollection(args); break;
    case 'collection.delete': result = store.deleteCollection(args); break;
    case 'settings.save': {
      const old = store.snapshot().settings; store.saveSettings(args);
      try { await configureApi(); }
      catch (e) { store.saveSettings(old); await configureApi().catch(() => {}); throw new Error(`Không bật được API: ${e.message}`); }
      result = store.snapshot().settings; break;
    }
    case 'profile.start': return task('Mở hồ sơ', () => browsers.start(args.id));
    case 'profile.startMany': return task('Mở nhiều hồ sơ', () => browsers.startMany(args.ids));
    case 'profile.stop': result = browsers.stop(args.id); break;
    case 'profile.stopAll': result = browsers.stopAll(); break;
    case 'profile.clearCache': result = await browsers.clearCache(args.id); break;
    case 'profile.clearData': {
      const p = browsers.profile(args.id);
      const answer = await dialog.showMessageBox(control, { type: 'warning', message: `Xóa cookie, cache và dữ liệu web của “${p.name}”?`, buttons: ['Hủy', 'Xóa dữ liệu'], defaultId: 0, cancelId: 0 });
      result = answer.response === 1 ? await browsers.clear(args.id) : { canceled: true }; break;
    }
    case 'profile.cookies.export': result = await cookieDialog(args.id, 'export'); break;
    case 'profile.cookies.import': result = await cookieDialog(args.id, 'import'); break;
    case 'dialog.importProfiles': result = await importProfiles(); break;
    case 'dialog.exportProfiles': result = await exportProfiles(args); break;
    case 'extension.add': {
      const pick = await dialog.showOpenDialog(control, { title: 'Chọn thư mục tiện ích Chromium đã giải nén', properties: ['openDirectory'] });
      if (pick.canceled) return { canceled: true };
      const path = pick.filePaths[0]; const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
      result = store.saveCollection({ collection: 'extensions', item: { name: String(manifest.name || 'Tiện ích').slice(0, 200), path, groupIds: [] } }); break;
    }
    case 'proxy.check': return task('Kiểm tra proxy', async () => {
      const proxy = store.snapshot().proxies.find(p => p.id === args.id); if (!proxy) throw new Error('Không tìm thấy proxy.');
      if (proxy.server.startsWith('socks5:') && (proxy.username || proxy.password)) throw new Error('Chromium chưa hỗ trợ xác thực SOCKS5.');
      const partition = session.fromPartition(`proxy-check-${randomUUID()}`); await partition.setProxy({ proxyRules: proxy.server, proxyBypassRules: '<-loopback>' });
      // session.fetch auth uses a transient, sandboxed webContents so proxy credentials remain scoped.
      const win = new BrowserWindow({ show: false, webPreferences: { session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      win.webContents.on('login', (event, _details, auth, callback) => { if (auth.isProxy) { event.preventDefault(); callback(proxy.username, proxy.password); } });
      try {
        await Promise.race([win.loadURL('https://api.ipify.org?format=json'), new Promise((_, reject) => setTimeout(() => reject(new Error('Proxy không phản hồi trong 15 giây.')), 15000))]);
        const text = await win.webContents.executeJavaScript('document.body.innerText'); const data = JSON.parse(text); if (typeof data.ip !== 'string') throw new Error('Phản hồi IP không hợp lệ.'); return { ip: data.ip };
      } finally { win.destroy(); await partition.closeAllConnections(); }
    });
    case 'windows.arrange': result = browsers.arrange(args.columns); break;
    case 'sync.start': {
      const answer = await dialog.showMessageBox(control, { type: 'warning', message: 'Đồng bộ click, cuộn và nội dung nhập sang các hồ sơ đã chọn, kể cả nội dung nhạy cảm. Chỉ bật khi các cửa sổ đang ở cùng trang.', buttons: ['Hủy', 'Bật đồng bộ'], defaultId: 0, cancelId: 0 });
      return answer.response === 1 ? browsers.startSync(args) : { canceled: true };
    }
    case 'sync.stop': return browsers.stopSync();
    case 'workflow.run': return task('Chạy tự động hóa', progress => browsers.runWorkflow(args.id, args.profileIds, progress));
    case 'data.openFolder': await shell.openPath(app.getPath('userData')); return { ok: true };
    default: throw new Error('Chức năng không được hỗ trợ.');
  }
  changed(); return result ?? { ok: true };
}
function makeControl() {
  control = new BrowserWindow({ width: 1440, height: 920, minWidth: 1000, minHeight: 640, title: 'Profile Studio',
    backgroundColor: '#0b1020', webPreferences: { preload: join(here, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  control.removeMenu(); control.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  control.webContents.on('will-navigate', (e, url) => { if (url !== managerUrl) e.preventDefault(); });
  void control.loadURL(managerUrl);
  control.on('close', event => {
    if (quitting || !browsers.running().length) return;
    event.preventDefault();
    void dialog.showMessageBox(control, { type: 'question', message: 'Đóng ứng dụng và tất cả hồ sơ đang mở?', buttons: ['Hủy', 'Đóng tất cả'], defaultId: 0, cancelId: 0 }).then(({ response }) => { if (response === 1) { quitting = true; app.quit(); } });
  });
  control.on('closed', () => { control = null; });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (control) { if (control.isMinimized()) control.restore(); control.focus(); } });
  ipcMain.handle('desktop:call', async (event, method, args) => {
    if (!control || event.sender !== control.webContents || event.senderFrame?.url !== managerUrl) throw new Error('Nguồn yêu cầu không được phép.');
    return dispatch(method, args);
  });
  app.whenReady().then(async () => {
    try { store = new Store(join(app.getPath('userData'), 'workspace')); browsers = new Browsers(store, changed); await configureApi(); makeControl(); }
    catch (error) { dialog.showErrorBox('Không khởi động được Profile Studio', error.message); app.quit(); }
  });
  app.on('activate', () => { if (!control && store) makeControl(); });
  app.on('before-quit', () => { quitting = true; browsers?.stopAll(); api?.close(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
