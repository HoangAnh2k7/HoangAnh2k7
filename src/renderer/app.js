'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let state = { profiles: [], groups: [], tags: [], proxies: [], extensions: [], workflows: [], settings: {}, running: [], tasks: [] };
let page = 'profiles';
let selected = new Set();
let search = '';
let groupFilter = '';
let statusFilter = '';
let archiveFilter = 'active';
let sortKey = 'createdAt';
let sortDirection = -1;
let toastTimer;
let editorSubmit;
let busy = false;
const pages = {
  profiles: ['Hồ sơ', 'Hồ sơ trình duyệt', 'Một không gian riêng cho mỗi công việc.'],
  proxies: ['Proxy', 'Kết nối theo cách của bạn', 'Quản lý và gán proxy riêng cho từng hồ sơ.'],
  organize: ['Nhóm & nhãn', 'Sắp xếp không gian làm việc', 'Nhóm công việc, gắn nhãn và tìm đúng hồ sơ nhanh hơn.'],
  extensions: ['Tiện ích', 'Bộ công cụ của bạn', 'Quản lý tiện ích Chromium dạng thư mục trên máy.'],
  workflows: ['Tự động hóa', 'Để những việc lặp lại tự chạy', 'Tạo chuỗi thao tác rõ ràng và chạy trên các hồ sơ đã chọn.'],
  settings: ['Cài đặt', 'Thiết lập không gian làm việc', 'Kiểm soát hiệu năng, API và dữ liệu trên thiết bị.'],
};

function node(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = String(value ?? '');
    else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key === 'checked' || key === 'disabled' || key === 'required' || key === 'multiple' || key === 'readOnly') element[key] = value;
    else if (key === 'value') element.value = value ?? '';
    else if (value !== null && value !== undefined) element.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child !== null && child !== undefined) element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}
function button(text, handler, style = 'secondary', small = false) {
  const result = node('button', { class: `button ${style}${small ? ' small' : ''}`, type: 'button', text });
  result.addEventListener('click', () => handler(result));
  return result;
}
function iconButton(text, label, handler, className = '') {
  return node('button', { class: `icon-button ${className}`, type: 'button', title: label, 'aria-label': label, text, onclick: handler });
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast visible${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => el.classList.remove('visible'), error ? 8000 : 4000);
}
function errorMessage(error) { return error?.message || String(error || 'Thao tác không thành công'); }
async function call(method, args = {}) {
  if (!window.desktop?.call) throw new Error('Cần mở ứng dụng bằng Electron. Giao diện này không chạy độc lập trên trình duyệt web.');
  return window.desktop.call(method, args);
}
async function loadState() { applyState(await call('state')); }
function applyState(next) {
  if (!next || typeof next !== 'object') return;
  state = { ...state, ...next };
  for (const key of ['profiles', 'groups', 'tags', 'proxies', 'extensions', 'workflows', 'running', 'tasks']) if (!Array.isArray(state[key])) state[key] = [];
  const ids = new Set(state.profiles.filter(p => Boolean(p.archived) === (archiveFilter === 'trash')).map(p => p.id));
  selected = new Set([...selected].filter(id => ids.has(id)));
  $('#profile-count').textContent = state.profiles.filter(p => !p.archived).length;
  $('#version-label').textContent = `Profile Studio ${state.version ? `v${state.version}` : ''}`;
  $('#platform-label').textContent = state.platform === 'darwin' ? 'macOS · Lưu trữ cục bộ' : state.platform === 'win32' ? 'Windows · Lưu trữ cục bộ' : 'Dữ liệu thuộc về bạn';
  const tasks = state.tasks.filter(t => ['running', 'pending', 'queued'].includes(t.status));
  $('#activity-label').textContent = tasks.length ? `${tasks.length} công việc đang chạy` : `${runningIds().size} hồ sơ đang mở`;
  renderPage();
  if ($('#activity-dialog').open) renderActivity();
}
function runningIds() { return new Set(state.running.map(item => typeof item === 'string' ? item : item.id || item.profileId)); }
async function perform(method, args, options = {}) {
  const { trigger, message, refresh = true } = options;
  if (trigger) trigger.disabled = true;
  try {
    const result = await call(method, args);
    if (refresh) await loadState();
    if (message && result?.cancelled !== true && result?.canceled !== true) toast(message);
    return result;
  } catch (error) {
    toast(errorMessage(error), true);
    return undefined;
  } finally { if (trigger?.isConnected) trigger.disabled = false; }
}
async function confirmAction(title, message, action) {
  if ($('#confirm-dialog').open) return;
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-dialog').showModal();
  const confirmed = await new Promise(resolve => {
    const close = result => { $('#confirm-dialog').close(); cleanup(); resolve(result); };
    const yes = () => close(true); const no = () => close(false);
    const cancel = event => { event.preventDefault(); close(false); };
    const cleanup = () => { $('#confirm-ok').removeEventListener('click', yes); $('#confirm-cancel').removeEventListener('click', no); $('#confirm-dialog').removeEventListener('cancel', cancel); };
    $('#confirm-ok').addEventListener('click', yes); $('#confirm-cancel').addEventListener('click', no); $('#confirm-dialog').addEventListener('cancel', cancel);
  });
  if (confirmed) await action();
}
function openEditor(title, build, submit, label = 'Lưu thay đổi') {
  $('#dialog-title').textContent = title;
  $('#dialog-error').textContent = '';
  $('#dialog-fields').replaceChildren();
  $('#dialog-submit').textContent = label;
  $('#dialog-submit').disabled = false;
  build($('#dialog-fields'));
  editorSubmit = submit;
  $('#edit-dialog').showModal();
}
function field(label, name, value = '', options = {}) {
  const { type = 'text', help, required = false, min, max, placeholder, readOnly = false } = options;
  const wrap = node('div', { class: 'field' });
  const id = `field-${name}`;
  wrap.append(node('label', { for: id, text: label }));
  let input;
  if (type === 'textarea') input = node('textarea', { id, name, value, required, placeholder, rows: options.rows || 3 });
  else if (type === 'select') {
    input = node('select', { id, name, required });
    for (const item of options.items || []) input.append(node('option', { value: item.value, text: item.label }));
    input.value = value ?? '';
  } else input = node('input', { id, name, value, type, required, min, max, placeholder, readOnly, autocomplete: type === 'password' ? 'new-password' : 'off' });
  if (options.step) input.step = options.step;
  wrap.append(input);
  if (help) wrap.append(node('small', { text: help }));
  return wrap;
}
function row(...fields) { return node('div', { class: `field-row${fields.length === 3 ? ' three' : ''}` }, fields); }
function readForm(form) { return Object.fromEntries(new FormData(form)); }
function selectField(label, name, current, collection, empty = 'Không chọn') {
  return field(label, name, current || '', { type: 'select', items: [{ value: '', label: empty }, ...collection.map(v => ({ value: v.id, label: v.name }))] });
}
function checkboxList(label, name, values, items) {
  const outer = node('div', { class: 'field' }, node('span', { class: 'field-label', text: label }));
  const list = node('div', { class: 'checkbox-group' });
  if (!items.length) list.append(node('small', { text: 'Chưa có mục nào. Bạn có thể tạo trong trang quản lý.' }));
  for (const item of items) list.append(node('label', { class: 'checkbox-label' }, [node('input', { type: 'checkbox', name, value: item.id, checked: values.includes(item.id) }), item.name]));
  outer.append(list); return outer;
}
function emptyState(title, text, actionText, action, icon = '▦') {
  const block = node('div', { class: 'empty-state' }, [node('div', { class: 'empty-icon', text: icon }), node('h3', { text: title }), node('p', { text })]);
  if (action) block.append(button(actionText, action, 'primary'));
  return block;
}
function collectionName(collection, id, fallback = '—') { return state[collection]?.find(x => x.id === id)?.name || fallback; }
function displayDate(value) {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function selectedIds() { return [...selected]; }
function requireSelection() { if (!selected.size) { toast('Hãy chọn ít nhất một hồ sơ.', true); return false; } return true; }

function navigate(target) {
  page = target;
  $$('.nav-item').forEach(item => { const active = item.dataset.page === page; item.classList.toggle('active', active); item.setAttribute('aria-current', active ? 'page' : 'false'); });
  renderPage();
}
function renderPage() {
  const [name, title, description] = pages[page] || pages.profiles;
  $('#breadcrumb-page').textContent = name; $('#page-title').textContent = title; $('#page-description').textContent = description;
  $('#heading-actions').replaceChildren(); $('#page-content').replaceChildren();
  ({ profiles: renderProfiles, proxies: renderProxies, organize: renderOrganize, extensions: renderExtensions, workflows: renderWorkflows, settings: renderSettings }[page] || renderProfiles)();
}
function renderProfiles() {
  const actions = $('#heading-actions');
  actions.append(button('↓ Nhập hồ sơ', b => perform('dialog.importProfiles', {}, { trigger: b, message: 'Đã nhập hồ sơ.' })), button('+ Tạo hồ sơ', () => editProfile(), 'primary'));
  const stats = [
    ['▦', state.profiles.filter(p => !p.archived).length, 'HỒ SƠ HIỆN CÓ'], ['◉', runningIds().size, 'ĐANG HOẠT ĐỘNG'], ['◇', state.groups.length, 'NHÓM LÀM VIỆC'], ['⇄', state.proxies.length, 'PROXY ĐÃ LƯU'],
  ];
  const content = $('#page-content');
  content.append(node('div', { class: 'stats-grid' }, stats.map(([icon, value, label]) => node('div', { class: 'stat-card' }, [node('div', { class: 'stat-icon', text: icon }), node('div', {}, [node('div', { class: 'stat-value', text: value }), node('div', { class: 'stat-label', text: label })])]))));
  const panel = node('section', { class: 'panel' });
  const topButtons = node('div', { class: 'button-row' }, [button('Tạo hàng loạt', () => bulkCreate(), 'secondary', true), button('▦ Xếp cửa sổ', b => perform('windows.arrange', { columns: 3 }, { trigger: b, message: 'Đã sắp xếp cửa sổ.' }), 'secondary', true), button('⇆ Đồng bộ', () => editSync(), 'secondary', true)]);
  panel.append(node('div', { class: 'panel-heading' }, [node('div', {}, [node('h3', { text: archiveFilter === 'trash' ? 'Thùng rác' : 'Tất cả hồ sơ' }), node('p', { text: archiveFilter === 'trash' ? 'Khôi phục hồ sơ hoặc xóa vĩnh viễn khi không còn cần.' : 'Quản lý phiên trình duyệt và kết nối của bạn.' })]), archiveFilter === 'trash' ? node('span', { class: 'badge', text: `${state.profiles.filter(p => p.archived).length} hồ sơ đã lưu trữ` }) : topButtons]));
  const searchInput = node('input', { type: 'search', placeholder: 'Tìm tên, ghi chú, nhóm hoặc nhãn…', value: search, 'aria-label': 'Tìm hồ sơ' });
  searchInput.addEventListener('input', () => { search = searchInput.value; renderProfileRows(); });
  const groupSelect = node('select', { 'aria-label': 'Lọc nhóm' }, [node('option', { value: '', text: 'Tất cả nhóm' }), ...state.groups.map(g => node('option', { value: g.id, text: g.name }))]);
  groupSelect.value = groupFilter; groupSelect.addEventListener('change', () => { groupFilter = groupSelect.value; renderProfileRows(); });
  const statusSelect = node('select', { 'aria-label': 'Lọc trạng thái' }, [node('option', { value: '', text: 'Mọi trạng thái' }), node('option', { value: 'running', text: 'Đang mở' }), node('option', { value: 'stopped', text: 'Đã đóng' })]);
  statusSelect.value = statusFilter; statusSelect.addEventListener('change', () => { statusFilter = statusSelect.value; renderProfileRows(); });
  const archiveSelect = node('select', { 'aria-label': 'Vùng hồ sơ' }, [node('option', { value: 'active', text: 'Hồ sơ hiện có' }), node('option', { value: 'trash', text: 'Thùng rác' })]);
  archiveSelect.value = archiveFilter;
  archiveSelect.addEventListener('change', () => { archiveFilter = archiveSelect.value; selected.clear(); statusFilter = ''; renderPage(); });
  const selectionActions = archiveFilter === 'trash' ? [button('↶ Khôi phục đã chọn', b => requireSelection() && perform('profile.restore', { ids: selectedIds() }, { trigger: b, message: 'Đã khôi phục hồ sơ.' }), 'ghost', true)] : [button('Sửa hàng loạt', () => bulkEdit(), 'secondary', true), button('▶ Mở đã chọn', b => requireSelection() && perform('profile.startMany', { ids: selectedIds() }, { trigger: b, message: 'Đã gửi yêu cầu mở hồ sơ.' }), 'ghost', true)];
  panel.append(node('div', { class: 'table-toolbar' }, [archiveSelect, node('div', { class: 'search-box' }, searchInput), groupSelect, statusSelect, node('div', { class: 'toolbar-spacer' }), ...selectionActions]));
  panel.append(node('div', { id: 'profiles-table', class: 'table-wrapper' }));
  const exportSelect = node('select', { id: 'export-format', 'aria-label': 'Định dạng xuất' }, ['json', 'csv', 'xlsx'].map(v => node('option', { value: v, text: v.toUpperCase() })));
  panel.append(node('div', { class: 'table-footer' }, [node('span', { id: 'selection-label' }), node('div', { class: 'button-row' }, [exportSelect, button('↑ Xuất', b => perform('dialog.exportProfiles', { ...(selected.size ? { ids: selectedIds() } : archiveFilter === 'trash' ? { ids: visibleProfiles().map(p => p.id) } : {}), format: exportSelect.value }, { trigger: b, message: 'Đã xuất hồ sơ.' }), 'secondary', true), button('Đóng tất cả', b => perform('profile.stopAll', {}, { trigger: b, message: 'Đã đóng các hồ sơ.' }), 'secondary', true), button(archiveFilter === 'trash' ? 'Xóa vĩnh viễn đã chọn' : 'Chuyển vào thùng rác', () => deleteSelected(), 'danger', true)])]));
  content.append(panel); renderProfileRows();
}
function profileMatches(profile) {
  if (Boolean(profile.archived) !== (archiveFilter === 'trash')) return false;
  const running = runningIds().has(profile.id);
  if (groupFilter && profile.groupId !== groupFilter) return false;
  if ((statusFilter === 'running' && !running) || (statusFilter === 'stopped' && running)) return false;
  const haystack = [profile.name, profile.notes, collectionName('groups', profile.groupId, ''), ...(profile.tagIds || []).map(id => collectionName('tags', id, ''))].join(' ').toLocaleLowerCase('vi');
  return haystack.includes(search.toLocaleLowerCase('vi'));
}
function visibleProfiles() {
  return state.profiles.filter(profileMatches).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'vi', { numeric: true }) * sortDirection);
}
function renderProfileRows() {
  const holder = $('#profiles-table'); if (!holder) return;
  holder.replaceChildren();
  const visible = visibleProfiles();
  $('#selection-label').textContent = `${visible.length} / ${state.profiles.filter(p => Boolean(p.archived) === (archiveFilter === 'trash')).length} hồ sơ · Đã chọn ${selected.size}`;
  if (!visible.length) {
    const available = state.profiles.filter(profile => Boolean(profile.archived) === (archiveFilter === 'trash'));
    if (!available.length) holder.append(archiveFilter === 'trash' ? emptyState('Thùng rác trống', 'Hồ sơ chuyển vào thùng rác sẽ xuất hiện ở đây và có thể khôi phục.', null, null, '↶') : emptyState('Bắt đầu bằng một hồ sơ mới', 'Tạo không gian trình duyệt riêng, giữ cookie và dữ liệu tách biệt cho từng hồ sơ.', '+ Tạo hồ sơ đầu tiên', () => editProfile()));
    else holder.append(emptyState('Không tìm thấy hồ sơ', 'Thử đổi từ khóa hoặc bộ lọc để xem các hồ sơ khác.', 'Xóa bộ lọc', () => { search = ''; groupFilter = ''; statusFilter = ''; renderPage(); }, '⌕'));
    return;
  }
  const table = node('table'); const header = node('tr');
  const selectAll = node('input', { type: 'checkbox', 'aria-label': 'Chọn tất cả hồ sơ đang hiển thị', checked: visible.every(p => selected.has(p.id)) });
  selectAll.indeterminate = visible.some(p => selected.has(p.id)) && !selectAll.checked;
  selectAll.addEventListener('change', () => { visible.forEach(p => selectAll.checked ? selected.add(p.id) : selected.delete(p.id)); renderProfileRows(); });
  header.append(node('th', {}, selectAll));
  for (const [label, key] of [['Tên hồ sơ', 'name'], ['Trạng thái', null], ['Nhóm / nhãn', 'groupId'], ['Proxy', null], ['Cập nhật', 'updatedAt'], ['Thao tác', null]]) {
    const th = node('th');
    if (key) th.append(node('button', { type: 'button', text: `${label}${sortKey === key ? sortDirection > 0 ? ' ↑' : ' ↓' : ''}`, onclick: () => { sortDirection = sortKey === key ? -sortDirection : 1; sortKey = key; renderProfileRows(); } }));
    else th.textContent = label;
    header.append(th);
  }
  table.append(node('thead', {}, header)); const body = node('tbody'); const running = runningIds();
  for (const profile of visible) {
    const tr = node('tr', { class: selected.has(profile.id) ? 'selected' : '' });
    const check = node('input', { type: 'checkbox', checked: selected.has(profile.id), 'aria-label': `Chọn ${profile.name}` });
    check.addEventListener('change', () => { check.checked ? selected.add(profile.id) : selected.delete(profile.id); renderProfileRows(); });
    tr.append(node('td', {}, check));
    const avatar = node('div', { class: 'avatar', text: profile.name?.slice(0, 2).toLocaleUpperCase('vi') || 'P' });
    tr.append(node('td', {}, node('div', { class: 'profile-name' }, [avatar, node('div', {}, [node('strong', { text: profile.name }), node('small', { text: `#${profile.id?.slice(0, 8) || ''} · ${profile.language || 'vi-VN'}${profile.lastRun ? ` · Mở ${displayDate(profile.lastRun)}` : ''}` })])])));
    tr.append(node('td', {}, node('span', { class: `badge ${running.has(profile.id) ? 'running' : 'neutral'}`, text: profile.archived ? 'Thùng rác' : running.has(profile.id) ? 'Đang mở' : 'Đã đóng' })));
    const tags = node('div', { class: 'tag-list' }, (profile.tagIds || []).slice(0, 3).map(id => node('span', { class: 'tag', text: collectionName('tags', id, '') })));
    tr.append(node('td', {}, [node('div', { text: collectionName('groups', profile.groupId, 'Chưa phân nhóm') }), tags]));
    tr.append(node('td', {}, node('span', { text: collectionName('proxies', profile.proxyId, 'Kết nối trực tiếp') })));
    tr.append(node('td', {}, node('span', { text: displayDate(profile.updatedAt || profile.createdAt) })));
    const menu = node('details', { class: 'row-menu' }, [node('summary', { class: 'icon-button', 'aria-label': `Thao tác với ${profile.name}`, text: '⋯' })]);
    const dropdown = node('div', { class: 'row-dropdown' });
    const menuAction = (text, action) => { const b = node('button', { type: 'button', text, onclick: () => { menu.open = false; action(b); } }); dropdown.append(b); };
    menuAction('Nhân bản hồ sơ', b => perform('profile.clone', { id: profile.id }, { trigger: b, message: 'Đã nhân bản cấu hình hồ sơ.' }));
    menuAction('Nhập cookie từ tệp', b => perform('profile.cookies.import', { id: profile.id }, { trigger: b, message: 'Đã nhập cookie.' }));
    menuAction('Xuất cookie ra tệp', b => perform('profile.cookies.export', { id: profile.id }, { trigger: b, message: 'Đã xuất cookie.' }));
    menuAction('Chỉ xóa cache', () => confirmAction('Chỉ xóa cache?', `Đóng hồ sơ “${profile.name}” trước khi thực hiện. Cookie và dữ liệu trang được giữ lại.`, () => perform('profile.clearCache', { id: profile.id }, { message: 'Đã xóa cache, giữ cookie và dữ liệu trang.' })));
    menuAction('Xóa dữ liệu trình duyệt', () => confirmAction('Xóa dữ liệu trình duyệt?', `Cookie, cache và dữ liệu trang của “${profile.name}” sẽ bị xóa. Cấu hình hồ sơ được giữ lại.`, () => perform('profile.clearData', { id: profile.id }, { message: 'Đã xóa dữ liệu trình duyệt.' })));
    menuAction('Chuyển vào thùng rác', () => confirmAction('Chuyển hồ sơ vào thùng rác?', `“${profile.name}” sẽ được ẩn khỏi danh sách. Bạn có thể khôi phục hồ sơ trong thùng rác.`, () => perform('profile.delete', { ids: [profile.id] }, { message: 'Đã chuyển hồ sơ vào thùng rác.' })));
    menu.append(dropdown);
    const rowActions = profile.archived ? [button('↶ Khôi phục', b => perform('profile.restore', { ids: [profile.id] }, { trigger: b, message: 'Đã khôi phục hồ sơ.' }), 'ghost', true), button('Xóa vĩnh viễn', b => perform('profile.purge', { ids: [profile.id] }, { trigger: b, message: 'Đã xóa vĩnh viễn hồ sơ.' }), 'danger', true)] : [iconButton(profile.pinned ? '★' : '☆', profile.pinned ? 'Bỏ ghim hồ sơ' : 'Ghim hồ sơ', event => perform('profile.save', { id: profile.id, pinned: !profile.pinned }, { trigger: event.currentTarget })), button(running.has(profile.id) ? '■ Đóng' : '▶ Mở', b => perform(running.has(profile.id) ? 'profile.stop' : 'profile.start', { id: profile.id }, { trigger: b }), running.has(profile.id) ? 'secondary' : 'ghost', true), iconButton('✎', `Sửa ${profile.name}`, () => editProfile(profile)), menu];
    tr.append(node('td', {}, node('div', { class: 'row-actions' }, rowActions)));
    body.append(tr);
  }
  table.append(body); holder.append(table);
}
function editProfile(profile = {}) {
  openEditor(profile.id ? 'Chỉnh sửa hồ sơ' : 'Tạo hồ sơ trình duyệt', holder => {
    holder.append(field('Tên hồ sơ', 'name', profile.name || '', { required: true, placeholder: 'Ví dụ: Công việc · Nhóm thiết kế' }));
    holder.append(row(selectField('Nhóm', 'groupId', profile.groupId, state.groups), selectField('Proxy', 'proxyId', profile.proxyId, state.proxies, 'Kết nối trực tiếp')));
    holder.append(checkboxList('Nhãn', 'tagIds', profile.tagIds || [], state.tags));
    holder.append(field('Trang mở khi khởi động', 'startUrls', (profile.startUrls || []).join('\n'), { type: 'textarea', rows: 2, placeholder: 'https://example.com', help: 'Mỗi dòng một địa chỉ HTTP hoặc HTTPS. Bỏ trống để mở trang mới.' }));
    holder.append(row(field('Ngôn ngữ', 'language', profile.language || 'vi-VN', { required: true }), field('Múi giờ', 'timezone', profile.timezone || 'Asia/Ho_Chi_Minh', { placeholder: 'Asia/Ho_Chi_Minh' })));
    holder.append(row(field('Chiều rộng cửa sổ', 'width', profile.width || 1280, { type: 'number', min: 400, max: 7680 }), field('Chiều cao cửa sổ', 'height', profile.height || 800, { type: 'number', min: 300, max: 4320 })));
    holder.append(field('User-Agent', 'userAgent', profile.userAgent || '', { placeholder: 'Dùng mặc định của trình duyệt nếu để trống', help: 'Thay User-Agent không tương đương thay đổi toàn bộ fingerprint.' }));
    holder.append(field('Ghi chú', 'notes', profile.notes || '', { type: 'textarea', rows: 2 }));
    holder.append(field('Màu đánh dấu', 'color', profile.color || '#8b7be6', { type: 'color' }));
  }, async form => {
    const data = readForm(form);
    const tagIds = new FormData(form).getAll('tagIds');
    await call('profile.save', { ...data, id: profile.id, tagIds, startUrls: data.startUrls.split(/\r?\n/).map(x => x.trim()).filter(Boolean), width: Number(data.width), height: Number(data.height) });
  }, profile.id ? 'Lưu hồ sơ' : 'Tạo hồ sơ');
}
function bulkCreate() {
  openEditor('Tạo nhiều hồ sơ', holder => {
    holder.append(row(field('Số hồ sơ', 'count', 5, { type: 'number', min: 1, max: 100, required: true }), field('Tiền tố tên', 'prefix', 'Hồ sơ', { required: true })));
    holder.append(selectField('Sao chép cấu hình từ', 'templateId', '', state.profiles.filter(p => !p.archived), 'Cấu hình mặc định'));
    holder.append(node('div', { class: 'help-box', text: 'Mỗi hồ sơ mới có vùng lưu trữ trình duyệt riêng. Việc sao chép chỉ áp dụng cấu hình, không sao chép cookie hay phiên đăng nhập.' }));
  }, async form => {
    const data = readForm(form); const source = state.profiles.find(p => p.id === data.templateId);
    const template = source ? { ...source } : {}; delete template.id; delete template.createdAt; delete template.updatedAt; delete template.archived; delete template.pinned; delete template.lastRun;
    await call('profile.bulkCreate', { count: Number(data.count), prefix: data.prefix, template });
  }, 'Tạo hồ sơ');
}
function deleteSelected() {
  if (!requireSelection()) return;
  const ids = selectedIds();
  if (archiveFilter === 'trash') {
    perform('profile.purge', { ids }, { message: 'Đã xóa vĩnh viễn các hồ sơ đã chọn.' });
    return;
  }
  confirmAction(`Chuyển ${ids.length} hồ sơ vào thùng rác?`, 'Đóng các hồ sơ đang chạy trước khi chuyển. Cấu hình và dữ liệu được giữ lại để bạn có thể khôi phục.', () => perform('profile.delete', { ids }, { message: 'Đã chuyển các hồ sơ vào thùng rác.' }));
}
function bulkEdit() {
  if (!requireSelection()) return;
  const ids = selectedIds();
  openEditor(`Chỉnh sửa ${ids.length} hồ sơ`, holder => {
    const options = (collection, empty) => [{ value: '__unchanged__', label: 'Giữ nguyên' }, { value: '', label: empty }, ...state[collection].map(item => ({ value: item.id, label: item.name }))];
    holder.append(row(field('Nhóm', 'groupId', '__unchanged__', { type: 'select', items: options('groups', 'Bỏ phân nhóm') }), field('Proxy', 'proxyId', '__unchanged__', { type: 'select', items: options('proxies', 'Kết nối trực tiếp') })));
    holder.append(node('div', { class: 'help-box', text: 'Chỉ những mục đổi khỏi “Giữ nguyên” được áp dụng. Cấu hình kết nối mới có hiệu lực khi khởi động lại hồ sơ.' }));
  }, async form => {
    const data = readForm(form); const patch = {};
    for (const key of ['groupId', 'proxyId']) if (data[key] !== '__unchanged__') patch[key] = data[key];
    if (!Object.keys(patch).length) throw new Error('Chọn ít nhất một thiết lập cần thay đổi.');
    await call('profile.bulkEdit', { ids, patch });
  }, 'Áp dụng cho hồ sơ đã chọn');
}
function editSync() {
  const running = state.profiles.filter(p => !p.archived && runningIds().has(p.id));
  if (running.length < 2) { toast('Mở ít nhất hai hồ sơ trước khi đồng bộ thao tác.', true); return; }
  const leader = running.find(p => selected.has(p.id)) || running[0];
  openEditor('Đồng bộ thao tác giữa các cửa sổ', holder => {
    holder.append(selectField('Cửa sổ điều khiển', 'leaderId', leader.id, running));
    holder.append(checkboxList('Cửa sổ nhận thao tác', 'followerIds', running.filter(p => p.id !== leader.id && (selected.size ? selected.has(p.id) : true)).map(p => p.id), running));
    holder.append(node('div', { class: 'help-box', text: 'Các cửa sổ nên có cùng kích thước và trang tương tự. Chỉ những sự kiện được bộ đồng bộ hỗ trợ mới được chuyển tiếp; hãy kiểm tra trên trang thử nghiệm trước.' }));
    holder.append(button('Dừng đồng bộ hiện tại', b => perform('sync.stop', {}, { trigger: b, message: 'Đã dừng đồng bộ.' }), 'secondary'));
  }, async form => {
    const data = readForm(form); const followerIds = new FormData(form).getAll('followerIds').filter(id => id !== data.leaderId);
    if (!followerIds.length) throw new Error('Chọn ít nhất một cửa sổ nhận khác cửa sổ điều khiển.');
    return call('sync.start', { leaderId: data.leaderId, followerIds });
  }, 'Bắt đầu đồng bộ');
}

function renderProxies() {
  $('#heading-actions').append(button('+ Thêm proxy', () => editProxy(), 'primary'));
  const content = $('#page-content');
  if (!state.proxies.length) { content.append(node('div', { class: 'panel' }, emptyState('Chưa có proxy nào', 'Thêm proxy HTTP, HTTPS hoặc SOCKS5 và gán cho từng hồ sơ trong phần chỉnh sửa.', '+ Thêm proxy', () => editProxy(), '⇄'))); return; }
  const grid = node('div', { class: 'collection-grid' });
  for (const proxy of state.proxies) {
    const count = state.profiles.filter(p => !p.archived && p.proxyId === proxy.id).length;
    const card = node('article', { class: 'collection-card' }, [node('div', { class: 'card-top' }, [node('h3', { text: proxy.name }), node('span', { class: 'stat-icon', text: '⇄' })]), node('p', { text: proxy.server }), node('span', { class: 'badge', text: `${count} hồ sơ · ${proxy.username ? 'Có xác thực' : 'Không xác thực'}` })]);
    card.append(node('div', { class: 'card-actions' }, [button('Chỉnh sửa', () => editProxy(proxy), 'secondary', true), button('Kiểm tra IP', async b => { const result = await perform('proxy.check', { id: proxy.id }, { trigger: b, refresh: false }); if (result !== undefined) toast(typeof result === 'string' ? result : result.ip ? `IP: ${result.ip}` : JSON.stringify(result)); }, 'ghost', true), button('Xóa', () => deleteCollection('proxies', proxy), 'danger', true)])); grid.append(card);
  }
  content.append(grid);
}
function editProxy(proxy = {}) {
  openEditor(proxy.id ? 'Chỉnh sửa proxy' : 'Thêm proxy', holder => {
    holder.append(field('Tên nhận diện', 'name', proxy.name || '', { required: true, placeholder: 'Ví dụ: Kết nối công việc' }));
    holder.append(field('Địa chỉ máy chủ', 'server', proxy.server || '', { required: true, placeholder: 'http://127.0.0.1:8080', help: 'Dùng http://, https:// hoặc socks5:// cùng địa chỉ và cổng. Không đặt tài khoản trong URL.' }));
    holder.append(row(field('Tài khoản', 'username', proxy.username || ''), field('Mật khẩu', 'password', proxy.password || '', { type: 'password' })));
    holder.append(node('div', { class: 'help-box', text: 'Proxy SOCKS5 có xác thực phụ thuộc khả năng của trình duyệt. Kiểm tra kết nối trước khi dùng. Thông tin proxy được lưu trong dữ liệu cục bộ của ứng dụng.' }));
  }, async form => { await call('collection.save', { collection: 'proxies', item: { ...readForm(form), id: proxy.id } }); }, 'Lưu proxy');
}
function deleteCollection(collection, item) {
  if (collection === 'groups' && state.profiles.some(profile => profile.groupId === item.id)) {
    toast('Chuyển hoặc xóa vĩnh viễn các hồ sơ trong nhóm trước khi xóa nhóm, kể cả hồ sơ trong thùng rác.', true);
    return;
  }
  confirmAction(`Xóa “${item.name}”?`, 'Các hồ sơ đang sử dụng mục này có thể cần được cập nhật lại. Dữ liệu hồ sơ vẫn được giữ.', () => perform('collection.delete', { collection, id: item.id }, { message: 'Đã xóa.' }));
}
function renderOrganize() {
  const content = $('#page-content');
  const split = node('div', { class: 'split-panels' });
  for (const [collection, title, icon] of [['groups', 'Nhóm hồ sơ', '◇'], ['tags', 'Nhãn', '⌑']]) {
    const panel = node('section', { class: 'panel' });
    panel.append(node('div', { class: 'panel-heading' }, [node('div', {}, [node('h3', { text: title }), node('p', { text: `${state[collection].length} mục trong không gian làm việc` })]), button('+ Thêm', () => editSimple(collection), 'ghost', true)]));
    if (!state[collection].length) panel.append(emptyState(`Chưa có ${collection === 'groups' ? 'nhóm' : 'nhãn'}`, collection === 'groups' ? 'Chia hồ sơ theo dự án hoặc mục đích sử dụng.' : 'Đánh dấu những hồ sơ có cùng đặc điểm.', '+ Thêm mới', () => editSimple(collection), icon));
    for (const item of state[collection]) {
      const count = state.profiles.filter(p => !p.archived && (collection === 'groups' ? p.groupId === item.id : (p.tagIds || []).includes(item.id))).length;
      const archivedCount = collection === 'groups' ? state.profiles.filter(p => p.archived && p.groupId === item.id).length : 0;
      panel.append(node('div', { class: 'list-row' }, [node('div', { class: 'list-title' }, [node('span', { class: 'color-dot' }), node('div', {}, [node('strong', { text: item.name }), node('small', { text: `${count} hồ sơ${archivedCount ? ` · ${archivedCount} trong thùng rác` : ''}` })])]), node('div', { class: 'button-row' }, [iconButton('✎', 'Chỉnh sửa', () => editSimple(collection, item)), iconButton('×', 'Xóa', () => deleteCollection(collection, item), 'delete')])]));
    }
    split.append(panel);
  }
  content.append(split);
}
function editSimple(collection, item = {}) {
  const noun = collection === 'groups' ? 'nhóm' : 'nhãn';
  openEditor(`${item.id ? 'Chỉnh sửa' : 'Thêm'} ${noun}`, holder => { holder.append(field(`Tên ${noun}`, 'name', item.name || '', { required: true })); holder.append(field('Màu đánh dấu', 'color', item.color || '#8b7be6', { type: 'color' })); }, async form => { await call('collection.save', { collection, item: { ...readForm(form), id: item.id } }); });
}
function renderExtensions() {
  $('#heading-actions').append(button('+ Chọn thư mục tiện ích', b => perform('extension.add', {}, { trigger: b, message: 'Đã thêm tiện ích.' }), 'primary'));
  const content = $('#page-content');
  const note = node('div', { class: 'help-box', text: 'Chọn thư mục tiện ích Chromium đã giải nén có manifest.json. Chỉ cài tiện ích bạn tin cậy. Gán nhóm để giới hạn nơi dùng tiện ích; khởi động lại hồ sơ sau khi thay đổi.' });
  content.append(note);
  if (!state.extensions.length) { content.append(node('div', { class: 'panel' }, emptyState('Bổ sung tiện ích cho hồ sơ', 'Tiện ích được tải từ thư mục trên thiết bị này. Đường dẫn tiện ích không tự đồng bộ sang máy khác.', '+ Chọn thư mục', b => perform('extension.add', {}, { trigger: b, message: 'Đã thêm tiện ích.' }), '⊞'))); return; }
  const grid = node('div', { class: 'collection-grid' });
  for (const extension of state.extensions) {
    const groups = (extension.groupIds || []).map(id => collectionName('groups', id, '')).filter(Boolean);
    grid.append(node('article', { class: 'collection-card' }, [node('div', { class: 'card-top' }, [node('h3', { text: extension.name }), node('span', { class: 'stat-icon', text: '⊞' })]), node('p', { text: extension.path }), node('span', { class: 'badge', text: groups.length ? groups.join(', ') : 'Tất cả nhóm' }), node('div', { class: 'card-actions' }, [button('Gán nhóm', () => editExtension(extension), 'secondary', true), button('Gỡ khỏi danh sách', () => deleteCollection('extensions', extension), 'danger', true)])]));
  }
  content.append(grid);
}
function editExtension(extension) {
  openEditor('Nhóm sử dụng tiện ích', holder => {
    holder.append(field('Tên tiện ích', 'name', extension.name, { required: true }));
    holder.append(field('Thư mục', 'path', extension.path, { readOnly: true }));
    holder.append(checkboxList('Nhóm được phép dùng (bỏ trống để dùng cho tất cả)', 'groupIds', extension.groupIds || [], state.groups));
  }, async form => { await call('collection.save', { collection: 'extensions', item: { ...extension, ...readForm(form), groupIds: new FormData(form).getAll('groupIds') } }); });
}
function renderWorkflows() {
  $('#heading-actions').append(button('+ Tạo quy trình', () => editWorkflow(), 'primary'));
  const content = $('#page-content');
  content.append(node('div', { class: 'help-box', text: 'Quy trình hỗ trợ mở trang, chờ, click, nhập văn bản và chụp ảnh. Chỉ chạy trên các trang bạn được phép thao tác. Mỗi bước có thể thất bại nếu cấu trúc trang thay đổi.' }));
  if (!state.workflows.length) { content.append(node('div', { class: 'panel' }, emptyState('Biến thao tác thành một quy trình', 'Bắt đầu với chuỗi bước nhỏ, kiểm tra trên một hồ sơ rồi mới chạy hàng loạt.', '+ Tạo quy trình đầu tiên', () => editWorkflow(), '↳'))); return; }
  const grid = node('div', { class: 'collection-grid' });
  for (const workflow of state.workflows) {
    const steps = workflow.steps || [];
    grid.append(node('article', { class: 'collection-card' }, [node('div', { class: 'card-top' }, [node('h3', { text: workflow.name }), node('span', { class: 'stat-icon', text: '↳' })]), node('span', { class: 'badge', text: `${steps.length} bước` }), node('pre', { text: steps.map((step, i) => `${i + 1}. ${step.type}${step.url ? ` · ${step.url}` : step.selector ? ` · ${step.selector}` : step.ms ? ` · ${step.ms} ms` : ''}`).join('\n') }), node('div', { class: 'card-actions' }, [button('▶ Chạy quy trình', () => runWorkflow(workflow), 'primary', true), button('Sửa', () => editWorkflow(workflow), 'secondary', true), button('Xóa', () => deleteCollection('workflows', workflow), 'danger', true)])]));
  }
  content.append(grid);
}
function editWorkflow(workflow = {}) {
  const defaults = [{ type: 'goto', url: 'https://example.com' }, { type: 'wait', ms: 1000 }, { type: 'screenshot' }];
  openEditor(workflow.id ? 'Chỉnh sửa quy trình' : 'Tạo quy trình tự động hóa', holder => {
    holder.append(field('Tên quy trình', 'name', workflow.name || '', { required: true }));
    holder.append(field('Các bước (JSON)', 'steps', JSON.stringify(workflow.steps || defaults, null, 2), { type: 'textarea', rows: 13, required: true }));
    holder.append(node('div', { class: 'help-box' }, [node('div', { text: 'Các kiểu bước được hỗ trợ:' }), node('code', { text: 'goto: {type, url} · wait: {type, ms} · click: {type, selector} · type: {type, selector, text} · screenshot: {type}' })]));
  }, async form => {
    const data = readForm(form); let steps;
    try { steps = JSON.parse(data.steps); } catch { throw new Error('JSON các bước chưa đúng cú pháp.'); }
    if (!Array.isArray(steps)) throw new Error('Các bước phải là một mảng JSON.');
    await call('collection.save', { collection: 'workflows', item: { id: workflow.id, name: data.name, steps } });
  }, 'Lưu quy trình');
}
function runWorkflow(workflow) {
  if (!state.profiles.some(p => !p.archived)) { toast('Tạo một hồ sơ trước khi chạy quy trình.', true); return; }
  openEditor(`Chạy “${workflow.name}”`, holder => {
    holder.append(checkboxList('Chọn hồ sơ chạy quy trình', 'profileIds', selectedIds(), state.profiles.filter(p => !p.archived)));
    holder.append(node('div', { class: 'help-box', text: 'Ứng dụng sẽ mở hồ sơ nếu cần và thực hiện lần lượt các bước. Kết quả hiển thị trong mục công việc gần đây.' }));
  }, async form => {
    const profileIds = new FormData(form).getAll('profileIds');
    if (!profileIds.length) throw new Error('Chọn ít nhất một hồ sơ.');
    await call('workflow.run', { id: workflow.id, profileIds });
  }, 'Chạy quy trình');
}

function renderSettings() {
  const content = $('#page-content'); const grid = node('div', { class: 'settings-grid' }); const settings = state.settings;
  const generalForm = node('form', { class: 'panel settings-panel' });
  generalForm.append(node('h2', { text: 'Khởi chạy hồ sơ' }), node('p', { text: 'Giới hạn tài nguyên khi mở nhiều cửa sổ cùng lúc.' }));
  generalForm.append(field('Số hồ sơ mở song song tối đa', 'maxParallel', settings.maxParallel ?? 3, { type: 'number', min: 1, max: 20, required: true, help: 'Giới hạn độ song song của các tác vụ mở hàng loạt.' }));
  generalForm.append(field('Khoảng cách giữa hai lần mở (ms)', 'launchDelayMs', settings.launchDelayMs ?? 500, { type: 'number', min: 0, max: 60000, required: true }));
  const saveGeneral = node('button', { type: 'submit', class: 'button primary', text: 'Lưu thiết lập' });
  generalForm.append(saveGeneral, node('p', { class: 'settings-note', text: 'Dữ liệu được lưu trong thư mục người dùng của ứng dụng trên thiết bị này. Bản xuất hồ sơ chứa cấu hình; cookie được xuất riêng theo từng hồ sơ.' }));
  generalForm.addEventListener('submit', event => { event.preventDefault(); const data = readForm(generalForm); perform('settings.save', { maxParallel: Number(data.maxParallel), launchDelayMs: Number(data.launchDelayMs) }, { trigger: saveGeneral, message: 'Đã lưu thiết lập.' }); });
  const apiForm = node('form', { class: 'panel settings-panel' });
  apiForm.append(node('h2', { text: 'API trên thiết bị' }), node('p', { text: 'Điều khiển hồ sơ bằng chương trình trên cùng máy. API tắt theo mặc định.' }));
  const enabled = node('input', { type: 'checkbox', name: 'apiEnabled', checked: Boolean(settings.apiEnabled) });
  apiForm.append(node('label', { class: 'checkbox-label' }, [enabled, 'Bật API cục bộ (127.0.0.1)']));
  apiForm.append(field('Cổng API', 'apiPort', settings.apiPort ?? 32187, { type: 'number', min: 1024, max: 65535, required: true }));
  const token = node('input', { type: 'password', value: settings.apiToken || '', readOnly: true, 'aria-label': 'Token API' });
  const reveal = iconButton('◉', 'Hiện hoặc ẩn token', () => { token.type = token.type === 'password' ? 'text' : 'password'; });
  const copy = button('Sao chép', async () => { try { await navigator.clipboard.writeText(settings.apiToken || ''); toast('Đã sao chép token.'); } catch { toast('Không sao chép được. Hãy hiện và sao chép token thủ công.', true); } }, 'secondary', true);
  apiForm.append(node('div', { class: 'field' }, [node('span', { class: 'field-label', text: 'Token truy cập' }), node('div', { class: 'token-row' }, [token, reveal, copy]), node('small', { text: 'Token cho phép điều khiển hồ sơ. Giữ kín và không đưa vào mã nguồn hoặc ảnh chụp công khai.' })]));
  apiForm.append(node('code', { class: 'code-block', text: `GET http://127.0.0.1:${settings.apiPort || 32187}/v1/state\nAuthorization: Bearer <token>` }));
  const saveApi = node('button', { type: 'submit', class: 'button primary', text: 'Lưu cài đặt API' });
  apiForm.append(node('div', { class: 'card-actions' }, saveApi));
  apiForm.addEventListener('submit', event => { event.preventDefault(); perform('settings.save', { apiEnabled: enabled.checked, apiPort: Number(readForm(apiForm).apiPort) }, { trigger: saveApi, message: 'Đã lưu cài đặt API.' }); });
  if (state.dataDirectory) {
    generalForm.append(field('Thư mục dữ liệu trên thiết bị', 'dataDirectory', state.dataDirectory, { readOnly: true, help: 'Sao lưu thư mục khi ứng dụng đã đóng. Không chỉnh sửa dữ liệu trong lúc hồ sơ đang chạy.' }));
    generalForm.append(button('Mở thư mục dữ liệu', b => perform('data.openFolder', {}, { trigger: b, refresh: false }), 'secondary'));
  }
  apiForm.append(node('p', { class: 'settings-note', text: state.api?.running ? `API đang phục vụ trên cổng ${state.api.port}.` : 'API hiện chưa chạy.' }));
  grid.append(generalForm, apiForm); content.append(grid);
  content.append(node('div', { class: 'help-box', text: 'Phạm vi tương thích: quản lý và tách dữ liệu hồ sơ trên Electron. Không có đăng nhập, cấp phép hay đồng bộ máy chủ GPM. Trình duyệt tùy biến, fingerprint nâng cao và dịch vụ của GPM không được cung cấp kèm ứng dụng này.' }));
}
function renderActivity() {
  const list = $('#activity-list'); list.replaceChildren();
  if (!state.tasks.length) { list.append(emptyState('Chưa có công việc nào', 'Các lần chạy quy trình và tác vụ nền sẽ xuất hiện tại đây.', null, null, '↳')); return; }
  for (const task of [...state.tasks].sort((a, b) => String(b.startedAt || b.createdAt || '').localeCompare(String(a.startedAt || a.createdAt || ''))).slice(0, 100)) {
    const statusNames = { running: 'Đang chạy', completed: 'Hoàn tất', succeeded: 'Hoàn tất', failed: 'Thất bại', error: 'Lỗi', pending: 'Chờ chạy', queued: 'Đang chờ', cancelled: 'Đã hủy', done: 'Hoàn tất' };
    list.append(node('article', { class: 'activity-item' }, [node('span', { class: `badge ${['running', 'completed', 'succeeded', 'done'].includes(task.status) ? 'running' : 'neutral'}`, text: statusNames[task.status] || task.status || 'Thông tin' }), node('div', {}, [node('strong', { text: task.name || task.title || task.type || 'Công việc' }), node('p', { text: task.error || task.message || task.detail || '' }), node('small', { text: displayDate(task.updatedAt || task.finishedAt || task.createdAt || task.startedAt) })])]));
  }
}

$$('.nav-item').forEach(item => item.addEventListener('click', () => navigate(item.dataset.page)));
$$('.close-dialog').forEach(item => item.addEventListener('click', () => { if (!busy) $('#edit-dialog').close(); }));
$('#edit-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
$('#edit-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !editorSubmit) return;
  busy = true; $('#dialog-submit').disabled = true; $('#dialog-error').textContent = '';
  try { const result = await editorSubmit(event.currentTarget); if (result?.canceled === true || result?.cancelled === true) return; $('#edit-dialog').close(); await loadState(); toast('Đã hoàn tất thao tác.'); }
  catch (error) { $('#dialog-error').textContent = errorMessage(error); }
  finally { busy = false; $('#dialog-submit').disabled = false; }
});
$('#activity-button').addEventListener('click', () => { renderActivity(); $('#activity-dialog').showModal(); });
$('#close-activity').addEventListener('click', () => $('#activity-dialog').close());
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !$('#edit-dialog').open && !$('#confirm-dialog').open && !$('#activity-dialog').open) { event.preventDefault(); editProfile(); }
});
$('#page-content').append(node('div', { class: 'loading-state', text: 'Đang mở không gian làm việc…' }));
if (window.desktop?.onState) window.desktop.onState(next => applyState(next));
loadState().catch(error => { $('#page-content').replaceChildren(emptyState('Chưa kết nối được ứng dụng', errorMessage(error), 'Thử lại', () => loadState().catch(e => toast(errorMessage(e), true)), '!')); });
