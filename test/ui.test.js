import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Store } from '../src/core/store.js';

const renderer = fileURLToPath(new URL('../src/renderer/', import.meta.url));
async function until(check) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('DOM condition did not become true');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
async function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-studio-ui-'));
  const store = new Store(directory);
  const calls = [];
  const errors = [];
  let failNext = '';
  let subscriber;
  let copiedText = '';
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(renderer, 'index.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://renderer.invalid/', virtualConsole });
  const { window } = dom;
  Object.defineProperties(window.HTMLDialogElement.prototype, {
    showModal: { value() { this.open = true; } },
    close: { value() { this.open = false; } },
  });
  Object.defineProperty(window.navigator, 'clipboard', { value: { async writeText(text) { copiedText = text; } } });
  window.desktop = {
    onState(callback) { subscriber = callback; return () => { subscriber = null; }; },
    async call(method, args = {}) {
      const copied = JSON.parse(JSON.stringify(args));
      calls.push({ method, args: copied });
      if (method === failNext) { failNext = ''; throw new Error('Lỗi thử nghiệm có kiểm soát'); }
      switch (method) {
        case 'state': return { ...store.snapshot(), running: [], tasks: [], platform: 'win32', version: '0.1.0' };
        case 'profile.save': return store.saveProfile(copied);
        case 'profile.bulkCreate': return store.bulkCreate(copied);
        case 'profile.clone': return store.cloneProfile(copied);
        case 'profile.delete': return store.archiveProfiles(copied);
        case 'profile.restore': return store.restoreProfiles(copied);
        case 'profile.purge': return store.deleteProfiles(copied);
        case 'profile.bulkEdit': return store.bulkEditProfiles(copied);
        case 'collection.save': return store.saveCollection(copied);
        case 'collection.delete': return store.deleteCollection(copied);
        case 'settings.save': return store.saveSettings(copied);
        default: return { ok: true };
      }
    },
  };
  window.eval(fs.readFileSync(path.join(renderer, 'app.js'), 'utf8'));
  await until(() => window.document.querySelector('#profiles-table'));
  t.after(() => { window.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const document = window.document;
  const q = selector => document.querySelector(selector);
  const buttons = (text, scope = document) => [...scope.querySelectorAll('button')].filter(el => el.textContent === text);
  const click = (text, scope) => { const b = buttons(text, scope)[0]; assert.ok(b, `Button exists: ${text}`); b.click(); return b; };
  const value = (name, data) => { const input = q(`#edit-form [name="${name}"]`); assert.ok(input, `Field exists: ${name}`); input.value = data; };
  const submit = async () => {
    q('#edit-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => !q('#edit-dialog').open || Boolean(q('#dialog-error').textContent));
    if (!q('#edit-dialog').open) await until(() => !q('#dialog-submit').disabled);
  };
  const navigate = id => q(`[data-page="${id}"]`).click();
  return { window, document, q, store, calls, errors, click, value, submit, navigate, refresh: () => subscriber?.({ ...store.snapshot(), running: [], tasks: [], platform: 'win32', version: '0.1.0' }), setFailure: method => { failNext = method; }, copied: () => copiedText };
}

test('renderer creates profiles, escapes names, filters, serializes import/export selection, and archives/restores/purges with confirmation', async t => {
  const ui = await workspace(t);
  assert.match(ui.q('#page-content').textContent, /Bắt đầu bằng một hồ sơ mới/);
  ui.click('+ Tạo hồ sơ');
  const literalName = '<img src=x onerror="window.compromised=true">';
  ui.value('name', literalName);
  ui.value('startUrls', 'https://example.com/one\nhttps://example.com/two');
  ui.value('width', '1440');
  ui.value('height', '900');
  await ui.submit();
  assert.equal(ui.store.snapshot().profiles.length, 1);
  assert.deepEqual(ui.store.snapshot().profiles[0].startUrls, ['https://example.com/one', 'https://example.com/two']);
  assert.equal(ui.store.snapshot().profiles[0].width, 1440);
  assert.equal(ui.q('#profiles-table strong').textContent, literalName);
  assert.equal(ui.q('#profiles-table img'), null);
  assert.equal(ui.window.compromised, undefined);
  const search = ui.q('input[type="search"]');
  search.value = 'không tồn tại'; search.dispatchEvent(new ui.window.Event('input'));
  assert.match(ui.q('#profiles-table').textContent, /Không tìm thấy hồ sơ/);
  search.value = ''; search.dispatchEvent(new ui.window.Event('input'));
  ui.click('↑ Xuất');
  await until(() => ui.calls.some(c => c.method === 'dialog.exportProfiles'));
  assert.equal(Object.hasOwn(ui.calls.find(c => c.method === 'dialog.exportProfiles').args, 'ids'), false, 'No selection means export all, not an empty list');
  await until(() => ui.q('#profiles-table strong') && ![...ui.document.querySelectorAll('button')].find(b => b.textContent === '↑ Xuất').disabled);
  ui.q('#profiles-table tbody input[type="checkbox"]').click();
  ui.click('↑ Xuất');
  await until(() => ui.calls.filter(c => c.method === 'dialog.exportProfiles').length === 2);
  assert.deepEqual(ui.calls.filter(c => c.method === 'dialog.exportProfiles')[1].args.ids, [ui.store.snapshot().profiles[0].id]);
  await until(() => ui.q('#profiles-table tbody tr') && ![...ui.document.querySelectorAll('button')].find(b => b.textContent === '↑ Xuất').disabled);
  ui.q('#profiles-table tbody input[type="checkbox"]').checked || ui.q('#profiles-table tbody input[type="checkbox"]').click();
  ui.click('Chuyển vào thùng rác', ui.q('.table-footer'));
  assert.equal(ui.q('#confirm-dialog').open, true);
  ui.q('#confirm-cancel').click();
  assert.equal(ui.store.snapshot().profiles.length, 1);
  ui.click('Chuyển vào thùng rác', ui.q('.table-footer')); ui.q('#confirm-ok').click();
  await until(() => ui.store.snapshot().profiles[0].archived === true);
  await until(() => !ui.q('#profiles-table tbody tr'));
  assert.equal(ui.q('#profile-count').textContent, '0', 'Archived profiles excluded from active counts');
  let archiveSelect = ui.q('select[aria-label="Vùng hồ sơ"]');
  archiveSelect.value = 'trash'; archiveSelect.dispatchEvent(new ui.window.Event('change'));
  assert.equal(ui.q('#profiles-table strong').textContent, literalName);
  assert.equal(ui.q('#profiles-table button[title="Ghim hồ sơ"]'), null, 'Trash rows cannot start or pin profiles');
  ui.click('↶ Khôi phục');
  await until(() => ui.store.snapshot().profiles[0].archived === false);
  await until(() => ui.q('#profiles-table').textContent.includes('Thùng rác trống'));
  assert.equal(ui.q('#profile-count').textContent, '1');
  archiveSelect = ui.q('select[aria-label="Vùng hồ sơ"]'); archiveSelect.value = 'active'; archiveSelect.dispatchEvent(new ui.window.Event('change'));
  assert.equal(ui.q('#profiles-table strong').textContent, literalName);
  ui.q('#profiles-table tbody input[type="checkbox"]').click();
  ui.click('Chuyển vào thùng rác', ui.q('.table-footer')); ui.q('#confirm-ok').click();
  await until(() => ui.store.snapshot().profiles[0].archived === true);
  await until(() => !ui.q('#profiles-table tbody tr'));
  archiveSelect = ui.q('select[aria-label="Vùng hồ sơ"]'); archiveSelect.value = 'trash'; archiveSelect.dispatchEvent(new ui.window.Event('change'));
  ui.click('Xóa vĩnh viễn'); await until(() => ui.store.snapshot().profiles.length === 0);
  assert.equal(ui.errors.length, 0, ui.errors.map(String).join('\n'));
});

test('renderer manages groups, tags, proxy credentials, workflows and API settings with recoverable errors', async t => {
  const ui = await workspace(t);
  ui.navigate('organize');
  ui.click('+ Thêm'); ui.value('name', 'Nhóm kiểm thử'); await ui.submit();
  assert.equal(ui.store.snapshot().groups[0].name, 'Nhóm kiểm thử');
  const panels = [...ui.document.querySelectorAll('.split-panels > section')];
  ui.click('+ Thêm', panels[1]); ui.value('name', 'Công việc'); await ui.submit();
  assert.equal(ui.store.snapshot().tags[0].name, 'Công việc');
  ui.navigate('proxies'); ui.click('+ Thêm proxy');
  ui.value('name', 'Proxy thử nghiệm'); ui.value('server', 'http://127.0.0.1:8080'); ui.value('username', 'test-user'); ui.value('password', 'local-test-password');
  await ui.submit();
  assert.equal(ui.store.snapshot().proxies[0].password, 'local-test-password');
  assert.ok(!ui.q('#page-content').textContent.includes('local-test-password'), 'Credentials absent from proxy cards');
  ui.navigate('profiles'); ui.click('+ Tạo hồ sơ');
  ui.value('name', 'Hồ sơ có nhóm'); ui.value('groupId', ui.store.snapshot().groups[0].id); ui.value('proxyId', ui.store.snapshot().proxies[0].id);
  ui.q('#edit-form [name="tagIds"]').checked = true;
  await ui.submit();
  assert.equal(ui.store.snapshot().profiles[0].tagIds.length, 1);
  ui.navigate('workflows'); ui.click('+ Tạo quy trình'); ui.value('name', 'Quy trình thử'); ui.value('steps', 'not JSON');
  await ui.submit();
  assert.equal(ui.q('#edit-dialog').open, true); assert.match(ui.q('#dialog-error').textContent, /JSON/);
  ui.value('steps', '[{"type":"goto","url":"https://example.com"},{"type":"wait","ms":10},{"type":"screenshot"}]');
  await ui.submit();
  assert.equal(ui.store.snapshot().workflows[0].steps.length, 3);
  ui.click('▶ Chạy quy trình'); ui.q('#edit-form [name="profileIds"]').checked = true; await ui.submit();
  assert.equal(ui.calls.find(c => c.method === 'workflow.run').args.profileIds.length, 1);
  ui.navigate('settings');
  const token = ui.q('input[aria-label="Token API"]'); assert.equal(token.type, 'password');
  ui.q('button[title="Hiện hoặc ẩn token"]').click(); assert.equal(token.type, 'text');
  ui.click('Sao chép'); await until(() => ui.copied().length > 0); assert.equal(ui.copied(), ui.store.snapshot().settings.apiToken);
  ui.q('input[name="apiEnabled"]').checked = true;
  ui.click('Lưu cài đặt API'); await until(() => ui.store.snapshot().settings.apiEnabled === true);
  ui.navigate('profiles'); ui.click('+ Tạo hồ sơ'); ui.value('name', 'Lỗi có thể sửa');
  ui.setFailure('profile.save'); await ui.submit();
  assert.match(ui.q('#dialog-error').textContent, /Lỗi thử nghiệm/);
  assert.equal(ui.q('#dialog-submit').disabled, false);
  await ui.submit(); assert.equal(ui.store.snapshot().profiles.length, 2);
  for (const target of ['extensions', 'workflows', 'settings', 'organize', 'proxies', 'profiles']) ui.navigate(target);
  assert.equal(ui.errors.length, 0, ui.errors.map(String).join('\n'));
});

test('renderer pins profiles ahead of sort and bulk assigns group/proxy without changing unrelated fields', async t => {
  const ui = await workspace(t);
  const first = ui.store.saveProfile({ name: 'Alpha', notes: 'Giữ ghi chú' });
  const second = ui.store.saveProfile({ name: 'Zulu' });
  const group = ui.store.saveCollection({ collection: 'groups', item: { name: 'Dự án', color: '#123456' } });
  const proxy = ui.store.saveCollection({ collection: 'proxies', item: { name: 'Proxy', server: 'http://127.0.0.1:8080' } });
  ui.refresh();
  ui.click('Tên hồ sơ');
  assert.equal(ui.q('#profiles-table tbody tr strong').textContent, 'Alpha');
  const zuluRow = [...ui.document.querySelectorAll('#profiles-table tbody tr')].find(tr => tr.textContent.includes('Zulu'));
  zuluRow.querySelector('button[title="Ghim hồ sơ"]').click();
  await until(() => ui.store.snapshot().profiles.find(p => p.id === second.id).pinned === true);
  await until(() => ui.q('#profiles-table tbody tr strong').textContent === 'Zulu');
  ui.q('#profiles-table thead input[type="checkbox"]').click();
  ui.click('Sửa hàng loạt');
  await ui.submit();
  assert.match(ui.q('#dialog-error').textContent, /ít nhất một thiết lập/);
  ui.value('groupId', group.id); ui.value('proxyId', proxy.id); await ui.submit();
  assert.ok(ui.store.snapshot().profiles.every(p => p.groupId === group.id && p.proxyId === proxy.id));
  assert.equal(ui.store.snapshot().profiles.find(p => p.id === first.id).notes, 'Giữ ghi chú');
  assert.equal(ui.calls.filter(c => c.method === 'profile.bulkEdit').length, 1);
  assert.deepEqual(ui.calls.find(c => c.method === 'profile.bulkEdit').args.patch, { groupId: group.id, proxyId: proxy.id });
  assert.equal(ui.errors.length, 0, ui.errors.map(String).join('\n'));
});

test('cache-only action requires confirmation and dispatches separately from full data removal', async t => {
  const ui = await workspace(t);
  const profile = ui.store.saveProfile({ name: 'Keep login' });
  ui.refresh();
  ui.click('Chỉ xóa cache');
  assert.equal(ui.q('#confirm-dialog').open, true);
  assert.match(ui.q('#confirm-dialog').textContent, /Cookie và dữ liệu trang được giữ lại/);
  ui.q('#confirm-cancel').click();
  assert.equal(ui.calls.filter(c => c.method === 'profile.clearCache').length, 0);
  ui.click('Chỉ xóa cache'); ui.q('#confirm-ok').click();
  await until(() => ui.calls.some(c => c.method === 'profile.clearCache'));
  assert.deepEqual(ui.calls.find(c => c.method === 'profile.clearCache').args, { id: profile.id });
  assert.equal(ui.calls.filter(c => c.method === 'profile.clearData').length, 0);
  assert.equal(ui.store.snapshot().profiles[0].name, 'Keep login');
  assert.equal(ui.errors.length, 0, ui.errors.map(String).join('\n'));
});

test('group deletion explains active and trashed profiles before allowing deletion of an empty group', async t => {
  const ui = await workspace(t);
  const group = ui.store.saveCollection({ collection: 'groups', item: { name: 'Keep group' } });
  const profile = ui.store.saveProfile({ name: 'Grouped', groupId: group.id });
  ui.refresh(); ui.navigate('organize');
  ui.q('button[title="Xóa"]').click();
  assert.equal(ui.q('#confirm-dialog').open, false);
  assert.match(ui.q('#toast').textContent, /Chuyển hoặc xóa vĩnh viễn/);
  assert.equal(ui.calls.filter(c => c.method === 'collection.delete').length, 0);
  ui.store.archiveProfiles({ ids: [profile.id] }); ui.refresh();
  assert.match(ui.q('.list-row').textContent, /0 hồ sơ · 1 trong thùng rác/);
  ui.q('button[title="Xóa"]').click();
  assert.equal(ui.q('#confirm-dialog').open, false);
  assert.equal(ui.calls.filter(c => c.method === 'collection.delete').length, 0);
  ui.store.restoreProfiles({ ids: [profile.id] });
  ui.store.saveProfile({ id: profile.id, groupId: '' }); ui.refresh();
  ui.q('button[title="Xóa"]').click();
  assert.equal(ui.q('#confirm-dialog').open, true);
  ui.q('#confirm-ok').click();
  await until(() => ui.store.snapshot().groups.length === 0);
  assert.equal(ui.store.snapshot().profiles[0].id, profile.id);
  assert.equal(ui.errors.length, 0, ui.errors.map(String).join('\n'));
});
