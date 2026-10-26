import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const COLLECTIONS = ['profiles', 'groups', 'tags', 'proxies', 'extensions', 'workflows'];
const EDITABLE_COLLECTIONS = COLLECTIONS.filter(name => name !== 'profiles');
const MAX_ITEMS = 10000;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const DEFAULTS = { apiEnabled: false, apiPort: 32187, launchDelayMs: 500, maxParallel: 3 };

function fail(message) { throw new Error(message); }
function object(value, label = 'Dữ liệu') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} phải là đối tượng`);
  for (const key of Object.keys(value)) if (FORBIDDEN.has(key)) fail('Khóa dữ liệu không hợp lệ');
  return value;
}
function text(value, label, maximum = 4096, required = false) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) fail(`${label} không hợp lệ`);
  if (required && !value.trim()) fail(`${label} không được để trống`);
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} phải nằm trong ${min}–${max}`);
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail('ID không hợp lệ');
  return value;
}
function array(value, label, max = 1000) {
  if (!Array.isArray(value) || value.length > max) fail(`${label} phải là danh sách tối đa ${max} mục`);
  return value;
}
function url(value) {
  text(value, 'URL', 8192, true);
  let parsed;
  try { parsed = new URL(value); } catch { fail('URL không hợp lệ'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('Chỉ hỗ trợ URL http/https không chứa mật khẩu');
  return value;
}
function color(value = '#6366f1') {
  if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) fail('Màu phải có dạng #RRGGBB');
  return value;
}
function related(state, collection, value, label) {
  if (value === '' || value === null || value === undefined) return '';
  id(value);
  if (!state[collection].some(row => row.id === value)) fail(`${label} không tồn tại`);
  return value;
}
function relatedMany(state, collection, values, label) {
  return [...new Set(array(values, label, 100).map(value => related(state, collection, value, label)).filter(Boolean))];
}
function settings(input, previous) {
  object(input, 'Cài đặt');
  const next = { ...previous };
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case 'apiEnabled': if (typeof value !== 'boolean') fail('apiEnabled phải là boolean'); next[key] = value; break;
      case 'apiPort': next[key] = integer(value, 'Cổng API', 1024, 65535); break;
      case 'apiToken': next[key] = text(value, 'API token', 256, true); if (value.length < 32) fail('API token cần ít nhất 32 ký tự'); break;
      case 'launchDelayMs': next[key] = integer(value, 'Độ trễ khởi chạy', 0, 60000); break;
      case 'maxParallel': next[key] = integer(value, 'Số phiên song song', 1, 20); break;
      default: fail(`Cài đặt không hỗ trợ: ${key}`);
    }
  }
  return next;
}
function timestamps(previous) {
  const now = new Date().toISOString();
  return { createdAt: previous?.createdAt || now, updatedAt: now };
}
function boolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} phải là boolean`);
  return value;
}
function isoTime(value) {
  text(value, 'Lần mở gần nhất', 40);
  if (value === '') return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) fail('Lần mở gần nhất phải là thời điểm ISO có múi giờ');
  const [, year, month, day, hour, minute, second, , zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) fail('Thời điểm ISO không hợp lệ');
  return new Date(value).toISOString();
}
function normalizeProfile(input, state, previous) {
  object(input, 'Hồ sơ');
  const value = { name: 'Hồ sơ mới', groupId: '', tagIds: [], proxyId: '', startUrls: ['https://example.com'], userAgent: '', language: 'vi-VN', timezone: '', width: 1280, height: 800, notes: '', color: '#6366f1', pinned: false, archived: false, lastRun: '', ...previous, ...input };
  const name = text(value.name, 'Tên hồ sơ', 200, true);
  const language = text(value.language, 'Ngôn ngữ', 80);
  if (language && !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(language)) fail('Mã ngôn ngữ không hợp lệ');
  const timezone = text(value.timezone, 'Múi giờ', 100);
  if (timezone) { try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { fail('Múi giờ IANA không hợp lệ'); } }
  return { id: previous?.id || randomUUID(), name, groupId: related(state, 'groups', value.groupId, 'Nhóm'), tagIds: relatedMany(state, 'tags', value.tagIds, 'Thẻ'), proxyId: related(state, 'proxies', value.proxyId, 'Proxy'), startUrls: array(value.startUrls, 'Trang khởi động', 30).map(url), userAgent: text(value.userAgent, 'User agent', 2048), language, timezone, width: integer(value.width, 'Chiều rộng', 320, 7680), height: integer(value.height, 'Chiều cao', 240, 4320), notes: text(value.notes, 'Ghi chú', 50000), color: color(value.color), pinned: boolean(value.pinned, 'Ghim hồ sơ'), archived: boolean(value.archived, 'Lưu trữ hồ sơ'), lastRun: isoTime(value.lastRun), ...timestamps(previous) };
}
function workflowSteps(steps) {
  return array(steps, 'Các bước', 200).map(raw => {
    const step = object(raw, 'Bước tự động hóa');
    switch (step.type) {
      case 'goto': return { type: 'goto', url: url(step.url) };
      case 'wait': return { type: 'wait', ms: integer(step.ms, 'Thời gian chờ', 0, 60000) };
      case 'click': return { type: 'click', selector: text(step.selector, 'CSS selector', 2048, true) };
      case 'type': return { type: 'type', selector: text(step.selector, 'CSS selector', 2048, true), text: text(step.text, 'Nội dung nhập', 50000) };
      case 'screenshot': return { type: 'screenshot', name: text(step.name ?? 'screenshot', 'Tên ảnh', 100, true).replace(/[^\p{L}\p{N}_-]/gu, '_') };
      default: fail('Bước chỉ hỗ trợ goto, wait, click, type, screenshot');
    }
  });
}
function normalizeItem(collection, input, state, previous) {
  object(input, 'Mục dữ liệu');
  const value = { ...previous, ...input };
  const base = { id: previous?.id || randomUUID(), name: text(value.name, 'Tên', 200, true), ...timestamps(previous) };
  if (collection === 'groups' || collection === 'tags') return { ...base, color: color(value.color) };
  if (collection === 'proxies') {
    const server = text(value.server, 'Địa chỉ proxy', 2048, true);
    let parsed; try { parsed = new URL(server); } catch { fail('Địa chỉ proxy không hợp lệ'); }
    if (!['http:', 'https:', 'socks5:'].includes(parsed.protocol) || !parsed.hostname || (parsed.protocol === 'socks5:' && !parsed.port) || parsed.username || parsed.password || parsed.pathname && parsed.pathname !== '/' || parsed.search || parsed.hash) fail('Proxy phải có dạng http(s)://host:port hoặc socks5://host:port, không nhúng thông tin đăng nhập');
    return { ...base, server, username: text(value.username ?? '', 'Tên đăng nhập', 500), password: text(value.password ?? '', 'Mật khẩu', 2000) };
  }
  if (collection === 'extensions') return { ...base, path: text(value.path, 'Đường dẫn tiện ích', 4096, true), groupIds: relatedMany(state, 'groups', value.groupIds ?? [], 'Nhóm tiện ích') };
  if (collection === 'workflows') return { ...base, steps: workflowSteps(value.steps ?? []) };
  fail('Bộ sưu tập không được hỗ trợ');
}

export class Store {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'workspace.json');
    const initial = { version: 1, ...Object.fromEntries(COLLECTIONS.map(name => [name, []])), settings: { ...DEFAULTS, apiToken: randomBytes(32).toString('hex') } };
    this.data = initial;
    if (fs.existsSync(this.file)) {
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { fail('Không đọc được workspace.json; dữ liệu được giữ nguyên. Khôi phục từ workspace.json.bak nếu cần.'); }
      object(parsed);
      if (parsed.version !== 1) fail('Phiên bản dữ liệu không được hỗ trợ');
      for (const name of COLLECTIONS) array(parsed[name], name, MAX_ITEMS);
      this.data = { version: 1, ...Object.fromEntries(COLLECTIONS.map(name => [name, parsed[name]])), settings: settings(parsed.settings, initial.settings) };
      const ids = new Set();
      for (const collection of COLLECTIONS) for (const item of this.data[collection]) { object(item); id(item.id); if (ids.has(item.id)) fail('ID bị trùng trong dữ liệu'); ids.add(item.id); }
      // Admit only supported fields from disk; keep stable IDs and timestamps.
      for (const collection of EDITABLE_COLLECTIONS) this.data[collection] = this.data[collection].map(item => ({ ...normalizeItem(collection, item, this.data, item), createdAt: item.createdAt, updatedAt: item.updatedAt }));
      this.data.profiles = this.data.profiles.map(item => ({ ...normalizeProfile(item, this.data, item), createdAt: item.createdAt, updatedAt: item.updatedAt }));
    } else this.persist(initial);
  }

  snapshot() { return structuredClone(this.data); }

  persist(next) {
    const temporary = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(next, null, 2));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor); descriptor = undefined;
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`);
      fs.renameSync(temporary, this.file);
      // Persist directory entries where the operating system supports fsync on directories.
      try { const dir = fs.openSync(this.directory, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } } catch { /* Windows may reject directory fsync. */ }
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  mutate(operation) {
    const next = this.snapshot();
    const result = operation(next);
    for (const name of COLLECTIONS) if (next[name].length > MAX_ITEMS) fail(`Tối đa ${MAX_ITEMS} mục trong ${name}`);
    this.persist(next);
    this.data = next;
    return structuredClone(result);
  }

  saveProfile(input) {
    object(input);
    return this.mutate(state => {
      const previous = input.id ? state.profiles.find(row => row.id === id(input.id)) : undefined;
      if (input.id && !previous) fail('Hồ sơ không tồn tại');
      const profile = normalizeProfile(input, state, previous);
      if (previous) state.profiles[state.profiles.indexOf(previous)] = profile; else state.profiles.push(profile);
      return profile;
    });
  }

  bulkCreate({ count, prefix = 'Hồ sơ', template = {} }) {
    integer(count, 'Số hồ sơ', 1, 500); text(prefix, 'Tiền tố', 180, true); object(template);
    return this.mutate(state => {
      const created = [];
      for (let index = 1; index <= count; index++) { const profile = normalizeProfile({ ...template, name: `${prefix} ${index}` }, state); state.profiles.push(profile); created.push(profile); }
      return created;
    });
  }

  deleteProfiles({ ids }) {
    const selected = new Set(array(ids, 'IDs', MAX_ITEMS).map(id));
    return this.mutate(state => { const removed = state.profiles.filter(row => selected.has(row.id)); state.profiles = state.profiles.filter(row => !selected.has(row.id)); return removed; });
  }

  setArchived({ ids }, archived) {
    const selected = new Set(array(ids, 'IDs', MAX_ITEMS).map(id));
    return this.mutate(state => {
      for (const value of selected) if (!state.profiles.some(row => row.id === value)) fail('Hồ sơ không tồn tại');
      const updated = [];
      state.profiles = state.profiles.map(previous => {
        if (!selected.has(previous.id)) return previous;
        const profile = normalizeProfile({ archived }, state, previous);
        updated.push(profile);
        return profile;
      });
      return updated;
    });
  }

  archiveProfiles(input) { return this.setArchived(input, true); }

  restoreProfiles(input) { return this.setArchived(input, false); }

  bulkEditProfiles({ ids, patch }) {
    const selected = new Set(array(ids, 'IDs', MAX_ITEMS).map(id));
    object(patch, 'Thay đổi hàng loạt');
    const allowed = new Set(['groupId', 'tagIds', 'proxyId', 'language', 'timezone', 'notes', 'color']);
    for (const key of Object.keys(patch)) if (!allowed.has(key)) fail(`Không hỗ trợ thay đổi hàng loạt: ${key}`);
    return this.mutate(state => {
      for (const value of selected) if (!state.profiles.some(row => row.id === value)) fail('Hồ sơ không tồn tại');
      const updated = [];
      state.profiles = state.profiles.map(previous => {
        if (!selected.has(previous.id)) return previous;
        const profile = normalizeProfile(patch, state, previous);
        updated.push(profile);
        return profile;
      });
      return updated;
    });
  }

  markRun(selected) { return this.saveProfile({ id: id(selected), lastRun: new Date().toISOString() }); }

  cloneProfile({ id: selected }) {
    const existing = this.data.profiles.find(row => row.id === id(selected));
    if (!existing) fail('Hồ sơ không tồn tại');
    const { id: _id, createdAt: _created, updatedAt: _updated, ...input } = existing;
    return this.saveProfile({ ...input, name: `${existing.name.slice(0, 185)} (bản sao)`, archived: false, pinned: false, lastRun: '' });
  }

  importProfiles({ profiles }) {
    array(profiles, 'Hồ sơ nhập', 5000);
    return this.mutate(state => {
      const imported = profiles.map(raw => {
        const input = object(raw);
        // References from another installation are not IDs in this workspace.
        return normalizeProfile({ ...input, groupId: state.groups.some(row => row.id === input.groupId) ? input.groupId : '', proxyId: state.proxies.some(row => row.id === input.proxyId) ? input.proxyId : '', tagIds: Array.isArray(input.tagIds) ? input.tagIds.filter(value => state.tags.some(row => row.id === value)) : [], archived: false, lastRun: '' }, state);
      });
      state.profiles.push(...imported); return imported;
    });
  }

  exportBundle({ ids, includeSecrets = false } = {}) {
    if (typeof includeSecrets !== 'boolean') fail('includeSecrets phải là boolean');
    const state = this.snapshot();
    const selected = ids === undefined ? null : new Set(array(ids, 'IDs xuất', MAX_ITEMS).map(id));
    if (selected) for (const value of selected) if (!state.profiles.some(row => row.id === value)) fail('Hồ sơ xuất không tồn tại');
    const profiles = state.profiles.filter(row => selected === null ? !row.archived : selected.has(row.id));
    const groupIds = new Set(profiles.map(row => row.groupId).filter(Boolean));
    const tagIds = new Set(profiles.flatMap(row => row.tagIds));
    const proxyIds = new Set(profiles.map(row => row.proxyId).filter(Boolean));
    const proxies = state.proxies.filter(row => proxyIds.has(row.id)).map(row => {
      if (includeSecrets) return row;
      const { username: _username, password: _password, ...safe } = row;
      return safe;
    });
    return { format: 'profile-workspace', version: 1, exportedAt: new Date().toISOString(), profiles, groups: state.groups.filter(row => groupIds.has(row.id)), tags: state.tags.filter(row => tagIds.has(row.id)), proxies };
  }

  importBundle(bundle) {
    if (Array.isArray(bundle)) return this.importProfiles({ profiles: bundle });
    object(bundle, 'Gói nhập');
    if (!('groups' in bundle) && !('tags' in bundle) && !('proxies' in bundle) && !('format' in bundle)) return this.importProfiles({ profiles: bundle.profiles });
    if (bundle.format !== 'profile-workspace' || bundle.version !== 1) fail('Định dạng gói hồ sơ không được hỗ trợ');
    array(bundle.profiles, 'Hồ sơ nhập', 5000);
    for (const name of ['groups', 'tags', 'proxies']) array(bundle[name] ?? [], name, MAX_ITEMS);
    return this.mutate(state => {
      const maps = { groups: new Map(), tags: new Map(), proxies: new Map() };
      for (const collection of ['groups', 'tags', 'proxies']) {
        for (const raw of bundle[collection] ?? []) {
          const input = object(raw, collection);
          const sourceId = id(input.id);
          if (maps[collection].has(sourceId)) fail(`ID bị trùng trong ${collection}`);
          const item = normalizeItem(collection, input, state);
          const reusable = collection !== 'proxies' && state[collection].find(row => row.name === item.name);
          if (!reusable) state[collection].push(item);
          maps[collection].set(sourceId, (reusable || item).id);
        }
      }
      const remap = (collection, value) => {
        if (value === '' || value === null || value === undefined) return '';
        id(value);
        const mapped = maps[collection].get(value);
        if (!mapped) fail(`Tham chiếu ${collection} không có trong gói nhập`);
        return mapped;
      };
      const profileIds = new Set();
      const profiles = bundle.profiles.map(raw => {
        const input = object(raw, 'Hồ sơ nhập');
        if (input.id !== undefined) {
          id(input.id);
          if (profileIds.has(input.id)) fail('ID hồ sơ bị trùng trong gói nhập');
          profileIds.add(input.id);
        }
        return normalizeProfile({ ...input, groupId: remap('groups', input.groupId), proxyId: remap('proxies', input.proxyId), tagIds: array(input.tagIds ?? [], 'Thẻ nhập', 100).map(value => remap('tags', value)) }, state);
      });
      state.profiles.push(...profiles);
      return profiles;
    });
  }

  saveCollection({ collection, item }) {
    if (!EDITABLE_COLLECTIONS.includes(collection)) fail('Bộ sưu tập không được hỗ trợ');
    object(item);
    return this.mutate(state => {
      const previous = item.id ? state[collection].find(row => row.id === id(item.id)) : undefined;
      if (item.id && !previous) fail('Mục dữ liệu không tồn tại');
      const normalized = normalizeItem(collection, item, state, previous);
      if (previous) state[collection][state[collection].indexOf(previous)] = normalized; else state[collection].push(normalized);
      return normalized;
    });
  }

  deleteCollection({ collection, id: selected }) {
    if (!EDITABLE_COLLECTIONS.includes(collection)) fail('Bộ sưu tập không được hỗ trợ'); id(selected);
    return this.mutate(state => {
      const previous = state[collection].find(row => row.id === selected);
      if (!previous) fail('Mục dữ liệu không tồn tại');
      state[collection] = state[collection].filter(row => row.id !== selected);
      for (const profile of state.profiles) {
        if (collection === 'groups' && profile.groupId === selected) profile.groupId = '';
        if (collection === 'proxies' && profile.proxyId === selected) profile.proxyId = '';
        if (collection === 'tags') profile.tagIds = profile.tagIds.filter(value => value !== selected);
      }
      if (collection === 'groups') for (const extension of state.extensions) extension.groupIds = extension.groupIds.filter(value => value !== selected);
      return previous;
    });
  }

  saveSettings(input) { return this.mutate(state => { state.settings = settings(input, state.settings); return state.settings; }); }
}
