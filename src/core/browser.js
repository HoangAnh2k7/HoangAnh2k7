import { BrowserWindow, session, screen, app } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const trace = stage => { if (process.env.PROFILE_STUDIO_DIAGNOSTICS === '1') console.log(`Browser startup: ${stage}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export class Browsers {
  constructor(store, changed) { this.store = store; this.changed = changed; this.windows = new Map(); this.sync = null; this.starting = new Map(); }
  profile(id) {
    const p = this.store.snapshot().profiles.find(p => p.id === id);
    if (!p) throw new Error('Không tìm thấy hồ sơ.');
    return p;
  }
  getSession(id) { this.profile(id); return session.fromPartition(`persist:profile-${id}`); }
  running() { return [...this.windows.keys()]; }
  async cdp(win, method, params = {}) {
    if (!win || win.isDestroyed()) throw new Error('Cửa sổ hồ sơ đã đóng.');
    if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3');
    trace(`CDP ${method}`);
    let timer;
    try { return await Promise.race([win.webContents.debugger.sendCommand(method, params), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Browser command timed out: ${method}`)), 10000); })]); }
    finally { clearTimeout(timer); }
  }
  async start(id) {
    if (this.windows.has(id)) { this.windows.get(id).focus(); return { id }; }
    if (this.starting.has(id)) return this.starting.get(id);
    const promise = this._start(id).finally(() => this.starting.delete(id));
    this.starting.set(id, promise); return promise;
  }
  async _start(id) {
    const p = this.profile(id); if (p.archived) throw new Error('Khôi phục hồ sơ từ thùng rác trước khi mở.');
    const state = this.store.snapshot(); const ses = this.getSession(id);
    const proxy = state.proxies.find(x => x.id === p.proxyId);
    if (proxy?.server.startsWith('socks5:') && (proxy.username || proxy.password)) throw new Error('Engine Chromium chưa hỗ trợ xác thực SOCKS5. Dùng HTTP proxy có xác thực hoặc SOCKS5 không xác thực.');
    trace('configure proxy');
    await ses.setProxy(proxy ? { proxyRules: proxy.server, proxyBypassRules: '<-loopback>' } : { mode: 'direct' });
    trace('close previous connections');
    await ses.closeAllConnections();
    trace('configure session');
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    const ua = p.userAgent || ses.getUserAgent();
    ses.setUserAgent(ua, p.language || 'en-US');
    const extensions = state.extensions.filter(e => !e.groupIds?.length || e.groupIds.includes(p.groupId));
    for (const installed of ses.extensions.getAllExtensions()) if (!extensions.some(e => e.path === installed.path)) await ses.extensions.removeExtension(installed.id);
    for (const ext of extensions) {
      if (!ses.extensions.getAllExtensions().some(e => e.path === ext.path)) await ses.extensions.loadExtension(ext.path);
    }
    trace('create window');
    const win = new BrowserWindow({ width: p.width || 1280, height: p.height || 800, title: p.name,
      backgroundColor: '#ffffff', autoHideMenuBar: false,
      webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
    });
    win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    this.windows.set(id, win);
    const auth = (event, _details, info, callback) => {
      if (info.isProxy && proxy) { event.preventDefault(); callback(proxy.username || '', proxy.password || ''); }
    };
    win.webContents.on('login', auth);
    win.webContents.on('page-title-updated', event => { event.preventDefault(); win.setTitle(p.name); });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void win.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => { if (!/^https?:\/\//i.test(url) && url !== 'about:blank') event.preventDefault(); });
    win.on('closed', () => { this.windows.delete(id); if (this.sync?.leaderId === id || this.sync?.followerIds.includes(id)) void this.stopSync(); this.changed(); });
    try {
      // Emulation commands require a live renderer. Initialize only about:blank
      // before overrides so the first real page receives the profile settings.
      trace('initialize blank renderer');
      await win.loadURL('about:blank');
      trace('apply overrides');
      await this.applyOverrides(win, p, ua);
      const urls = p.startUrls || [];
      trace('load startup URL');
      await win.loadURL(urls[0] || 'about:blank');
      trace('startup URL loaded');
      // Each startup URL gets its own isolated window sharing this profile's session.
      // The primary window is the lifecycle owner; auxiliary windows close with it.
      for (const url of urls.slice(1)) {
        const child = new BrowserWindow({ parent: win, width: p.width || 1280, height: p.height || 800,
          webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
        child.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
        child.webContents.on('login', auth);
        child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        child.webContents.on('will-navigate', (e, u) => { if (!/^https?:\/\//i.test(u)) e.preventDefault(); });
        win.once('closed', () => { if (!child.isDestroyed()) child.destroy(); });
        await child.loadURL('about:blank');
        await this.applyOverrides(child, p, ua);
        await child.loadURL(url);
      }
      this.store.markRun(id); this.changed(); return { id };
    } catch (error) { if (!win.isDestroyed()) win.destroy(); throw error; }
  }
  async applyOverrides(win, profile, userAgent) {
    if (profile.timezone) await this.cdp(win, 'Emulation.setTimezoneOverride', { timezoneId: profile.timezone });
    await this.cdp(win, 'Emulation.setLocaleOverride', { locale: profile.language || 'en-US' });
    await this.cdp(win, 'Network.setUserAgentOverride', { userAgent, acceptLanguage: profile.language || 'en-US' });
  }
  async startMany(ids) {
    if (!Array.isArray(ids) || ids.length > 500) throw new Error('Danh sách hồ sơ không hợp lệ.');
    const { maxParallel = 3, launchDelayMs = 500 } = this.store.snapshot().settings;
    const queue = [...new Set(ids)], results = [];
    await Promise.all(Array.from({ length: Math.min(maxParallel, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift();
        try { await this.start(id); results.push({ id, ok: true }); } catch (e) { results.push({ id, ok: false, error: e.message }); }
        if (queue.length) await delay(launchDelayMs);
      }
    }));
    return results;
  }
  stop(id) { const win = this.windows.get(id); if (win && !win.isDestroyed()) win.destroy(); return { id }; }
  stopAll() { for (const id of this.running()) this.stop(id); }
  async clear(id) {
    if (this.windows.has(id) || this.starting.has(id)) throw new Error('Đóng hồ sơ trước khi xóa dữ liệu duyệt web.');
    const ses = this.getSession(id); await ses.clearStorageData(); await ses.clearCache(); return { ok: true };
  }
  async cookies(id, input) {
    const ses = this.getSession(id);
    if (input === undefined) return ses.cookies.get({});
    if (!Array.isArray(input) || input.length > 10000) throw new Error('Cookie phải là một mảng, tối đa 10000 mục.');
    // Validate all records before mutating the session.
    const cookies = input.map(c => {
      if (!c || typeof c.name !== 'string' || typeof c.value !== 'string' || typeof c.domain !== 'string' || !/^\.?[a-zA-Z0-9.-]+$/.test(c.domain)) throw new Error('Cookie không hợp lệ.');
      const path = typeof c.path === 'string' && c.path.startsWith('/') ? c.path : '/';
      const clean = { url: `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${path}`, name: c.name, value: c.value, path, secure: Boolean(c.secure), httpOnly: Boolean(c.httpOnly) };
      if (!c.hostOnly) clean.domain = c.domain;
      if (Number.isFinite(c.expirationDate)) clean.expirationDate = c.expirationDate;
      if (['unspecified','no_restriction','lax','strict'].includes(c.sameSite)) clean.sameSite = c.sameSite;
      return clean;
    });
    for (const c of cookies) await ses.cookies.set(c);
    await ses.cookies.flushStore(); return { imported: cookies.length };
  }
  arrange(columns = 3) {
    columns = Math.max(1, Math.min(8, Number(columns) || 3));
    const wins = [...this.windows.values()]; if (!wins.length) return;
    const area = screen.getPrimaryDisplay().workArea; const rows = Math.ceil(wins.length / columns);
    const width = Math.floor(area.width / columns), height = Math.floor(area.height / rows);
    wins.forEach((w, i) => { if (w.isMaximized()) w.unmaximize(); w.setBounds({ x: area.x + i % columns * width, y: area.y + Math.floor(i / columns) * height, width, height }); });
  }
  async runWorkflow(id, profileIds, progress) {
    const workflow = this.store.snapshot().workflows.find(w => w.id === id);
    if (!workflow) throw new Error('Không tìm thấy quy trình.');
    if (!Array.isArray(profileIds) || !profileIds.length || profileIds.length > 100) throw new Error('Chọn từ 1 đến 100 hồ sơ.');
    const results = [];
    for (const profileId of [...new Set(profileIds)]) {
      try {
        await this.start(profileId); const win = this.windows.get(profileId);
        for (const [index, step] of workflow.steps.entries()) {
          if (win.isDestroyed()) throw new Error('Hồ sơ đã đóng; quy trình dừng.');
          progress(`${this.profile(profileId).name}: ${index + 1}/${workflow.steps.length}`);
          if (step.type === 'goto') await win.loadURL(step.url);
          else if (step.type === 'wait') {
            for (let remaining = step.ms; remaining > 0; remaining -= 100) { if (win.isDestroyed()) throw new Error('Quy trình đã dừng.'); await delay(Math.min(100, remaining)); }
          } else if (step.type === 'click' || step.type === 'type') {
            const code = `(() => {const e=document.querySelector(${JSON.stringify(step.selector)}); if(!e)throw new Error('Không tìm thấy phần tử'); ${step.type === 'click' ? 'e.click();' : `if (!(e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement)) throw new Error('Phần tử không phải ô nhập'); const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value')?.set; if(setter)setter.call(e,${JSON.stringify(step.text)});else e.value=${JSON.stringify(step.text)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));`} return true;})()`;
            await win.webContents.executeJavaScript(code, true);
          } else if (step.type === 'screenshot') {
            const dir = join(app.getPath('userData'), 'screenshots'); await mkdir(dir, { recursive: true });
            const file = join(dir, `${profileId}-${Date.now()}-${index}.png`); await writeFile(file, (await win.webContents.capturePage()).toPNG());
          }
        }
        results.push({ profileId, ok: true });
      } catch (e) { results.push({ profileId, ok: false, error: e.message }); }
    }
    return results;
  }
  async startSync({ leaderId, followerIds }) {
    await this.stopSync();
    if (!this.windows.has(leaderId) || !Array.isArray(followerIds) || !followerIds.length || followerIds.length > 100) throw new Error('Cần một hồ sơ chính và các hồ sơ phụ đang mở.');
    followerIds = [...new Set(followerIds)].filter(id => id !== leaderId);
    if (!followerIds.length || followerIds.some(id => !this.windows.has(id))) throw new Error('Các hồ sơ đồng bộ phải đang mở.');
    const leader = this.windows.get(leaderId), binding = '__profileStudioSync';
    const source = `(() => {if(window.__psSyncInstalled)return;window.__psSyncInstalled=true;
      const emit=o=>{if(typeof window.${binding}==='function')window.${binding}(JSON.stringify(o))};
      const selector=e=>{if(e.id)return '#'+CSS.escape(e.id);const a=[];while(e&&e.nodeType===1&&a.length<12){const t=e.tagName.toLowerCase();const s=Array.from(e.parentElement?.children||[]).filter(x=>x.tagName===e.tagName);a.unshift(t+(s.length>1?':nth-of-type('+(s.indexOf(e)+1)+')':''));e=e.parentElement;}return a.join(' > ')};
      document.addEventListener('click',e=>emit({type:'click',x:e.clientX/innerWidth,y:e.clientY/innerHeight,button:e.button}),true);
      document.addEventListener('input',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)emit({type:'input',selector:selector(e.target),value:e.target.value})},true);
      let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>emit({type:'scroll',x:scrollX,y:scrollY}),80)},true);
    })()`;
    const handler = (_event, method, params) => {
      if (method !== 'Runtime.bindingCalled' || params.name !== binding || typeof params.payload !== 'string' || params.payload.length > 100000) return;
      let data; try { data = JSON.parse(params.payload); } catch { return; }
      for (const id of followerIds) {
        const win = this.windows.get(id); if (!win || win.isDestroyed()) continue;
        let code;
        if (data.type === 'click' && Number.isFinite(data.x) && Number.isFinite(data.y) && data.x >= 0 && data.x <= 1 && data.y >= 0 && data.y <= 1) code = `document.elementFromPoint(${data.x}*innerWidth,${data.y}*innerHeight)?.click()`;
        if (data.type === 'scroll' && Number.isFinite(data.x) && Number.isFinite(data.y)) code = `scrollTo(${data.x},${data.y})`;
        if (data.type === 'input' && typeof data.selector === 'string' && data.selector.length < 4000 && typeof data.value === 'string' && data.value.length < 50000) code = `(()=>{const e=document.querySelector(${JSON.stringify(data.selector)});if(!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement))return;const s=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value')?.set;if(s)s.call(e,${JSON.stringify(data.value)});else e.value=${JSON.stringify(data.value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`;
        if (code) void win.webContents.executeJavaScript(code).catch(() => {});
      }
    };
    await this.cdp(leader, 'Runtime.enable'); await this.cdp(leader, 'Runtime.addBinding', { name: binding });
    const script = await this.cdp(leader, 'Page.addScriptToEvaluateOnNewDocument', { source });
    leader.webContents.debugger.on('message', handler);
    this.sync = { leaderId, followerIds, handler, scriptId: script.identifier };
    await leader.webContents.executeJavaScript(source); this.changed(); return { leaderId, followerIds };
  }
  async stopSync() {
    const sync = this.sync; this.sync = null;
    if (sync) {
      const w = this.windows.get(sync.leaderId);
      if (w && !w.isDestroyed()) {
        w.webContents.debugger.removeListener('message', sync.handler);
        await this.cdp(w, 'Runtime.removeBinding', { name: '__profileStudioSync' }).catch(() => {});
        await this.cdp(w, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: sync.scriptId }).catch(() => {});
      }
    }
    this.changed(); return { ok: true };
  }
}
