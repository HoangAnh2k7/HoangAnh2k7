import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/core/store.js';
import { startApi } from '../src/core/api.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-workspace-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store(dir);
}

test('save/reload preserves identities, independent snapshots, and backup', t => {
  const store = fixture(t);
  const group = store.saveCollection({ collection: 'groups', item: { name: 'Nghiên cứu' } });
  const proxy = store.saveCollection({ collection: 'proxies', item: { name: 'Proxy', server: 'http://127.0.0.1:8080', username: 'u', password: 'p' } });
  const profile = store.saveProfile({ name: 'Hồ sơ Việt', groupId: group.id, proxyId: proxy.id, startUrls: ['https://example.com/path?q=1'] });
  const next = store.saveProfile({ id: profile.id, notes: 'Đã cập nhật' });
  assert.equal(next.id, profile.id); assert.equal(next.createdAt, profile.createdAt);
  const copy = store.snapshot(); copy.profiles[0].name = 'changed';
  assert.equal(store.snapshot().profiles[0].name, 'Hồ sơ Việt');
  const reloaded = new Store(store.directory);
  assert.deepEqual(reloaded.snapshot(), store.snapshot());
  assert.equal(JSON.parse(fs.readFileSync(`${store.file}.bak`, 'utf8')).profiles[0].notes, '');
  if (process.platform !== 'win32') assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
});

test('validation rejects unsafe navigation, bad relations, dimensions, and prototype keys without writes', t => {
  const store = fixture(t); const before = fs.readFileSync(store.file, 'utf8');
  for (const input of [
    { name: 'Bad', startUrls: ['file:///etc/passwd'] },
    { name: 'Bad', startUrls: ['javascript:alert(1)'] },
    { name: 'Bad', groupId: 'missing' },
    { name: 'Bad', tagIds: ['missing'] },
    { name: 'Bad', width: 10 },
    { name: 'Bad', timezone: 'imaginary/timezone' },
    JSON.parse('{"name":"Bad","__proto__":{"polluted":true}}'),
  ]) assert.throws(() => store.saveProfile(input));
  assert.equal(fs.readFileSync(store.file, 'utf8'), before); assert.equal(store.snapshot().profiles.length, 0);
  assert.equal({}.polluted, undefined);
  assert.throws(() => store.saveCollection({ collection: '__proto__', item: {} }));
  assert.throws(() => store.saveCollection({ collection: 'proxies', item: { name: 'Bad', server: 'http://user:secret@127.0.0.1:8080' } }));
  assert.throws(() => store.saveCollection({ collection: 'workflows', item: { name: 'Bad', steps: [{ type: 'eval', code: 'process.exit()' }] } }));
});

test('clone/import allocate fresh IDs and detach foreign references atomically', t => {
  const store = fixture(t);
  const tag = store.saveCollection({ collection: 'tags', item: { name: 'Alpha' } });
  const profile = store.saveProfile({ name: 'One', tagIds: [tag.id], notes: 'retain' });
  const clone = store.cloneProfile({ id: profile.id });
  assert.notEqual(clone.id, profile.id); assert.equal(clone.notes, 'retain'); assert.deepEqual(clone.tagIds, [tag.id]);
  const [imported] = store.importProfiles({ profiles: [{ ...profile, groupId: 'foreign', tagIds: [tag.id, 'foreign'], proxyId: 'foreign' }] });
  assert.notEqual(imported.id, profile.id); assert.equal(imported.groupId, ''); assert.equal(imported.proxyId, ''); assert.deepEqual(imported.tagIds, [tag.id]);
  const count = store.snapshot().profiles.length;
  assert.throws(() => store.importProfiles({ profiles: [{ name: 'Good' }, { name: 'Bad', startUrls: ['javascript:bad'] }] }));
  assert.equal(store.snapshot().profiles.length, count);
  const created = store.bulkCreate({ count: 3, prefix: 'Bulk', template: { tagIds: [tag.id] } });
  assert.equal(new Set(created.map(item => item.id)).size, 3); assert.equal(created[2].name, 'Bulk 3');
});

test('deletion updates profile references and extension targeting', t => {
  const store = fixture(t);
  const group = store.saveCollection({ collection: 'groups', item: { name: 'Group' } });
  const tag = store.saveCollection({ collection: 'tags', item: { name: 'Tag' } });
  const proxy = store.saveCollection({ collection: 'proxies', item: { name: 'Proxy', server: 'socks5://127.0.0.1:1080' } });
  store.saveCollection({ collection: 'extensions', item: { name: 'Extension', path: '/tmp/my-extension', groupIds: [group.id] } });
  const profile = store.saveProfile({ name: 'P', groupId: group.id, tagIds: [tag.id], proxyId: proxy.id });
  store.saveProfile({ id: profile.id, groupId: '' });
  for (const [collection, item] of [['groups', group], ['tags', tag], ['proxies', proxy]]) store.deleteCollection({ collection, id: item.id });
  const snapshot = store.snapshot(); assert.equal(snapshot.profiles[0].groupId, ''); assert.equal(snapshot.profiles[0].proxyId, ''); assert.deepEqual(snapshot.profiles[0].tagIds, []); assert.deepEqual(snapshot.extensions[0].groupIds, []);
});

test('nonempty groups cannot be deleted, including archived profiles, without changing saved data', t => {
  const store = fixture(t);
  const group = store.saveCollection({ collection: 'groups', item: { name: 'Keep profiles' } });
  const profile = store.saveProfile({ name: 'Keep session', groupId: group.id });
  const rejectDeletion = () => {
    const before = store.snapshot(), bytes = fs.readFileSync(store.file, 'utf8');
    assert.throws(() => store.deleteCollection({ collection: 'groups', id: group.id }), /trong nhóm.*thùng rác/);
    assert.deepEqual(store.snapshot(), before);
    assert.equal(fs.readFileSync(store.file, 'utf8'), bytes);
    assert.deepEqual(new Store(store.directory).snapshot(), before);
  };
  rejectDeletion();
  store.archiveProfiles({ ids: [profile.id] });
  rejectDeletion();
  store.restoreProfiles({ ids: [profile.id] });
  store.saveProfile({ id: profile.id, groupId: '' });
  store.deleteCollection({ collection: 'groups', id: group.id });
  assert.equal(store.snapshot().groups.length, 0);
  assert.equal(store.snapshot().profiles[0].id, profile.id);
});

test('failed persistence leaves in-memory state and saved file unchanged', t => {
  const store = fixture(t); const before = store.snapshot(); const bytes = fs.readFileSync(store.file, 'utf8');
  const originalPersist = store.persist;
  store.persist = () => { throw new Error('disk full'); };
  assert.throws(() => store.saveProfile({ name: 'Unsaved' }), /disk full/);
  assert.deepEqual(store.snapshot(), before); assert.equal(fs.readFileSync(store.file, 'utf8'), bytes);
  store.persist = originalPersist;
  store.saveProfile({ name: 'Saved' }); assert.equal(store.snapshot().profiles.length, 1);
});

test('corrupted persisted state is reported without overwriting bytes', t => {
  const store = fixture(t); fs.writeFileSync(store.file, '{broken');
  assert.throws(() => new Store(store.directory), /workspace.json/); assert.equal(fs.readFileSync(store.file, 'utf8'), '{broken');
});

test('localhost API authenticates, denies browser origins, routes operations, redacts state', async t => {
  const token = 'a'.repeat(64); const calls = [];
  const server = await startApi({ port: 0, token, dispatch: async (method, args) => {
    calls.push({ method, args });
    return method === 'state' ? { profiles: [], settings: { apiToken: token, apiEnabled: true }, proxies: [{ name: 'Proxy', username: 'u', password: 'secret', server: 'http://127.0.0.1:8080' }] } : { id: args.id || 'created' };
  } });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  assert.equal(server.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`; const headers = { authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${base}/v1/state`)).status, 401);
  assert.equal((await fetch(`${base}/v1/state`, { headers: { authorization: 'Bearer bad' } })).status, 401);
  assert.equal((await fetch(`${base}/v1/state`, { headers: { ...headers, origin: 'https://evil.example' } })).status, 403);
  const response = await fetch(`${base}/v1/state`, { headers }); assert.equal(response.status, 200);
  const state = (await response.json()).data; assert.equal(state.settings.apiToken, undefined); assert.equal(state.proxies[0].password, undefined); assert.equal(state.proxies[0].username, undefined);
  assert.equal((await fetch(`${base}/v1/profiles`, { method: 'POST', headers, body: JSON.stringify({ name: 'API profile' }) })).status, 200);
  assert.deepEqual(calls.at(-1), { method: 'profile.save', args: { name: 'API profile' } });
  await fetch(`${base}/v1/profiles/abc/start`, { method: 'POST', headers, body: '{}' }); assert.deepEqual(calls.at(-1), { method: 'profile.start', args: { id: 'abc' } });
  await fetch(`${base}/v1/workflows/wf/run`, { method: 'POST', headers, body: '{"profileIds":["abc"]}' }); assert.deepEqual(calls.at(-1), { method: 'workflow.run', args: { id: 'wf', profileIds: ['abc'] } });
  assert.equal((await fetch(`${base}/v1/profiles`, { method: 'POST', headers, body: '{broken' })).status, 400);
  assert.equal((await fetch(`${base}/v1/profiles`, { method: 'POST', headers, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
  assert.equal((await fetch(`${base}/missing`, { headers })).status, 404);
});

test('bundle roundtrip remaps references, reuses groups, and omits secrets by default', t => {
  const source = fixture(t); const destination = fixture(t);
  const group = source.saveCollection({ collection: 'groups', item: { name: 'Shared group', color: '#123456' } });
  const tag = source.saveCollection({ collection: 'tags', item: { name: 'Important' } });
  const proxy = source.saveCollection({ collection: 'proxies', item: { name: 'Gateway', server: 'http://gateway.example:80', username: 'alice', password: 'private' } });
  const profile = source.saveProfile({ name: 'Roundtrip', groupId: group.id, tagIds: [tag.id], proxyId: proxy.id, startUrls: ['https://example.com'], notes: 'kept' });
  source.saveProfile({ name: 'Excluded' });
  const existingGroup = destination.saveCollection({ collection: 'groups', item: { name: 'Shared group', color: '#654321' } });
  const safe = source.exportBundle({ ids: [profile.id] });
  assert.equal(safe.profiles.length, 1); assert.equal(safe.groups.length, 1); assert.equal(safe.proxies[0].username, undefined); assert.equal(safe.proxies[0].password, undefined);
  const [imported] = destination.importBundle(safe);
  assert.notEqual(imported.id, profile.id); assert.equal(imported.groupId, existingGroup.id); assert.notEqual(imported.tagIds[0], tag.id); assert.notEqual(imported.proxyId, proxy.id); assert.equal(imported.notes, 'kept');
  const snapshot = destination.snapshot(); assert.equal(snapshot.groups.length, 1); assert.equal(snapshot.groups[0].color, '#654321'); assert.equal(snapshot.proxies[0].password, '');
  const secretBundle = source.exportBundle({ ids: [profile.id], includeSecrets: true });
  assert.equal(secretBundle.proxies[0].username, 'alice'); assert.equal(secretBundle.proxies[0].password, 'private');
  const [withSecrets] = destination.importBundle(secretBundle);
  assert.equal(destination.snapshot().proxies.find(row => row.id === withSecrets.proxyId).password, 'private');
  assert.equal(new Set(destination.snapshot().proxies.map(row => row.id)).size, 2);
  assert.equal(source.exportBundle().profiles.length, 2); assert.equal(source.exportBundle({ ids: [] }).profiles.length, 0);
});

test('invalid bundles roll back collections and profiles, simple formats remain supported', t => {
  const store = fixture(t);
  const bundle = { format: 'profile-workspace', version: 1, groups: [{ id: 'oldgroup', name: 'New group' }], tags: [], proxies: [], profiles: [{ id: 'oldprofile', name: 'Broken', groupId: 'oldgroup', proxyId: 'missing' }] };
  const before = store.snapshot(); const bytes = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.importBundle(bundle), /Tham chiếu/);
  assert.deepEqual(store.snapshot(), before); assert.equal(fs.readFileSync(store.file, 'utf8'), bytes);
  assert.throws(() => store.importBundle({ ...bundle, groups: [...bundle.groups, bundle.groups[0]] }), /ID bị trùng/);
  assert.equal(store.importBundle([{ name: 'Array' }])[0].name, 'Array');
  assert.equal(store.importBundle({ profiles: [{ name: 'Plain object' }] })[0].name, 'Plain object');
});

test('proxy standard default ports accepted, socks5 requires explicit port', t => {
  const store = fixture(t);
  for (const server of ['http://localhost:80', 'https://localhost:443', 'http://localhost', 'https://localhost']) assert.equal(store.saveCollection({ collection: 'proxies', item: { name: server, server } }).server, server);
  assert.throws(() => store.saveCollection({ collection: 'proxies', item: { name: 'Missing socks port', server: 'socks5://localhost' } }));
});

test('loading supported schema drops unknown persisted fields', t => {
  const store = fixture(t); store.saveProfile({ name: 'P' });
  const stored = JSON.parse(fs.readFileSync(store.file, 'utf8')); stored.unknown = { arbitrary: true }; stored.profiles[0].unknown = 'discard';
  fs.writeFileSync(store.file, JSON.stringify(stored));
  const loaded = new Store(store.directory).snapshot(); assert.equal(loaded.unknown, undefined); assert.equal(loaded.profiles[0].unknown, undefined);
});

test('archive state persists, default export omits archived, restore keeps profile identity', t => {
  const store = fixture(t);
  const one = store.saveProfile({ name: 'Active' });
  const two = store.saveProfile({ name: 'Archive', pinned: true });
  assert.equal(one.archived, false); assert.equal(one.pinned, false); assert.equal(one.lastRun, '');
  const [archived] = store.archiveProfiles({ ids: [two.id] });
  assert.equal(archived.archived, true); assert.equal(archived.pinned, true);
  assert.equal(store.snapshot().profiles.length, 2);
  assert.deepEqual(store.exportBundle().profiles.map(profile => profile.id), [one.id]);
  assert.equal(store.exportBundle({ ids: [two.id] }).profiles[0].id, two.id);
  const restoredStore = new Store(store.directory);
  assert.equal(restoredStore.snapshot().profiles.find(profile => profile.id === two.id).archived, true);
  const [restored] = restoredStore.restoreProfiles({ ids: [two.id] });
  assert.equal(restored.id, two.id); assert.equal(restored.createdAt, two.createdAt); assert.equal(restored.archived, false); assert.equal(restored.pinned, true);
  assert.equal(restoredStore.exportBundle().profiles.length, 2);
  const before = restoredStore.snapshot();
  assert.throws(() => restoredStore.archiveProfiles({ ids: [one.id, 'missing'] }), /không tồn tại/);
  assert.deepEqual(restoredStore.snapshot(), before);
});

test('bulk edit validates all fields and references atomically', t => {
  const store = fixture(t);
  const one = store.saveProfile({ name: 'First' }); const two = store.saveProfile({ name: 'Second' });
  const group = store.saveCollection({ collection: 'groups', item: { name: 'Bulk group' } });
  const tag = store.saveCollection({ collection: 'tags', item: { name: 'Bulk tag' } });
  const edited = store.bulkEditProfiles({ ids: [one.id, two.id], patch: { groupId: group.id, tagIds: [tag.id], language: 'en-US', timezone: 'America/New_York', notes: 'shared notes', color: '#abcdef' } });
  assert.equal(edited.length, 2);
  for (const profile of edited) { assert.equal(profile.groupId, group.id); assert.deepEqual(profile.tagIds, [tag.id]); assert.equal(profile.language, 'en-US'); assert.equal(profile.timezone, 'America/New_York'); }
  assert.deepEqual(edited.map(profile => profile.name), ['First', 'Second']);
  const before = store.snapshot(); const bytes = fs.readFileSync(store.file, 'utf8');
  for (const payload of [
    { ids: [one.id, two.id], patch: { groupId: 'missing', notes: 'bad' } },
    { ids: [one.id, 'missing'], patch: { notes: 'bad' } },
    { ids: [one.id, two.id], patch: { name: 'not allowed' } },
    { ids: [one.id, two.id], patch: { archived: true } },
    { ids: [one.id, two.id], patch: { language: '../invalid' } },
  ]) assert.throws(() => store.bulkEditProfiles(payload));
  assert.deepEqual(store.snapshot(), before); assert.equal(fs.readFileSync(store.file, 'utf8'), bytes);
});

test('lastRun is validated and markRun persists an ISO timestamp', t => {
  const store = fixture(t); const profile = store.saveProfile({ name: 'Run' });
  const marked = store.markRun(profile.id);
  assert.ok(Number.isFinite(Date.parse(marked.lastRun))); assert.equal(new Date(marked.lastRun).toISOString(), marked.lastRun);
  assert.equal(new Store(store.directory).snapshot().profiles[0].lastRun, marked.lastRun);
  assert.equal(store.saveProfile({ id: profile.id, lastRun: '2026-10-26T12:34:56+07:00' }).lastRun, '2026-10-26T05:34:56.000Z');
  for (const lastRun of ['today', '2026-02-30T00:00:00Z', '2026-10-26', 123]) assert.throws(() => store.saveProfile({ id: profile.id, lastRun }));
  for (const changes of [{ pinned: 'true' }, { archived: 1 }]) assert.throws(() => store.saveProfile({ id: profile.id, ...changes }));
});


test('clone resets lifecycle and simple imports discard foreign run/archive state', t => {
  const store = fixture(t);
  const original = store.saveProfile({ name: 'Source', pinned: true, archived: true, lastRun: '2026-10-26T00:00:00.000Z' });
  const clone = store.cloneProfile({ id: original.id });
  assert.equal(clone.archived, false); assert.equal(clone.pinned, false); assert.equal(clone.lastRun, '');
  const [plain] = store.importProfiles({ profiles: [original] });
  assert.equal(plain.archived, false); assert.equal(plain.lastRun, ''); assert.equal(plain.pinned, true);
  const [bundled] = store.importBundle(store.exportBundle({ ids: [original.id] }));
  assert.equal(bundled.archived, true); assert.equal(bundled.pinned, true); assert.equal(bundled.lastRun, original.lastRun);
});
