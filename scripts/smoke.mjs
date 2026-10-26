// Real Electron smoke test. Requires a host with a working Chromium sandbox and desktop.
// Uses only a local fixture; never runs GPM's executable or calls its services.
import { _electron } from 'playwright-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = await mkdtemp(join(tmpdir(), 'profile-studio-smoke-'));
const server = http.createServer((req, res) => {
  if (req.url === '/cache-fixture.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(`window.fixtureLoaded=true;/*${'cache fixture '.repeat(20000)}*/`);
    return;
  }
  res.setHeader('Content-Type','text/html');
  res.setHeader('Cache-Control','no-store');
  res.end('<!doctype html><title>Local fixture</title><script src="/cache-fixture.js"></script><input id="name"><button id="set" onclick="document.cookie=\'isolation=yes;path=/\'">Set</button>');
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let electron;
let stage = 'launch';
const deadline = setTimeout(() => {
  console.error(`FAIL: native smoke exceeded 90 seconds at ${stage}`);
  electron?.process()?.kill();
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 1000).unref();
}, 90000);
deadline.unref();
const checkpoint = name => { stage = name; console.log(`Smoke: ${name}`); };
try {
  electron = await _electron.launch({ cwd: root, args: ['.'], env: { ...process.env, PROFILE_STUDIO_DATA: data, PROFILE_STUDIO_DIAGNOSTICS: '1' }, timeout: 30000 });
  electron.process().stdout?.on('data', chunk => process.stdout.write(chunk));
  electron.process().stderr?.on('data', chunk => process.stderr.write(chunk));
  checkpoint('manager window');
  const page = await electron.firstWindow(); await page.waitForFunction(() => Boolean(window.desktop));
  const call = (method,args={}) => page.evaluate(({method,args}) => window.desktop.call(method,args), {method,args});
  const url = `http://127.0.0.1:${server.address().port}/`;
  checkpoint('create profiles');
  const one = await call('profile.save',{name:'One',startUrls:[url],timezone:'Asia/Ho_Chi_Minh'});
  const two = await call('profile.save',{name:'Two',startUrls:[url]});
  checkpoint('start first profile');
  await call('profile.start',{id:one.id}); checkpoint('start second profile'); await call('profile.start',{id:two.id});
  let state = await call('state'); assert.equal(state.running.length,2);
  checkpoint('cookie isolation');
  await electron.evaluate(async ({session},id) => session.fromPartition(`persist:profile-${id}`).cookies.set({url:'http://127.0.0.1',name:'isolation',value:'one'}),one.id);
  const cookiesTwo = await electron.evaluate(async ({session},id) => session.fromPartition(`persist:profile-${id}`).cookies.get({name:'isolation'}),two.id);
  assert.equal(cookiesTwo.length,0,'cookies must not leak between profiles');
  checkpoint('close and reopen');
  await call('profile.stop',{id:one.id}); await call('profile.start',{id:one.id});
  const cookieOne = await electron.evaluate(async ({session},id) => session.fromPartition(`persist:profile-${id}`).cookies.get({name:'isolation'}),one.id);
  assert.equal(cookieOne[0]?.value,'one','profile cookie persists across close/reopen');
  checkpoint('cache-only clearing');
  await assert.rejects(call('profile.clearCache',{id:one.id}), /Đóng hồ sơ/);
  await electron.evaluate(async ({BrowserWindow,session},id) => {
    const ses = session.fromPartition(`persist:profile-${id}`);
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === ses);
    await win.webContents.executeJavaScript('localStorage.setItem("cache-check", "keep-local-storage")');
  },one.id);
  const cacheBefore = await electron.evaluate(({session},id) => session.fromPartition(`persist:profile-${id}`).getCacheSize(),one.id);
  assert.ok(cacheBefore > 0,'local fixture must populate HTTP cache before clearing');
  const otherCacheBefore = await electron.evaluate(({session},id) => session.fromPartition(`persist:profile-${id}`).getCacheSize(),two.id);
  assert.ok(otherCacheBefore > 0,'second profile has independent cached fixture');
  await call('profile.stop',{id:one.id});
  const profilesBeforeClear = (await call('state')).profiles;
  await call('profile.clearCache',{id:one.id});
  assert.deepEqual((await call('state')).profiles,profilesBeforeClear,'cache clearing preserves profile metadata');
  const afterClear = await electron.evaluate(async ({session},id) => {
    const ses = session.fromPartition(`persist:profile-${id}`);
    return {size:await ses.getCacheSize(),cookies:await ses.cookies.get({name:'isolation'})};
  },one.id);
  assert.equal(afterClear.size,0,'HTTP cache is removed');
  assert.equal(afterClear.cookies[0]?.value,'one','cache-only clearing preserves cookie');
  assert.ok(await electron.evaluate(({session},id) => session.fromPartition(`persist:profile-${id}`).getCacheSize(),two.id) > 0,'other profile cache is preserved');
  await call('profile.start',{id:one.id});
  const keptStorage = await electron.evaluate(async ({BrowserWindow,session},id) => {
    const ses = session.fromPartition(`persist:profile-${id}`);
    return BrowserWindow.getAllWindows().find(w => w.webContents.session === ses).webContents.executeJavaScript('localStorage.getItem("cache-check")');
  },one.id);
  assert.equal(keptStorage,'keep-local-storage','cache-only clearing preserves localStorage after reopen');
  checkpoint('automation');
  const workflow = await call('collection.save',{collection:'workflows',item:{name:'Local smoke',steps:[{type:'goto',url},{type:'type',selector:'#name',text:'hello'},{type:'click',selector:'#set'},{type:'screenshot'}]}});
  const result = await call('workflow.run',{id:workflow.id,profileIds:[one.id]}); assert.equal(result[0].ok,true);
  checkpoint('stop all');
  await call('profile.stopAll');
  state=await call('state'); assert.equal(state.running.length,0); assert.equal(state.profiles.length,2);
  assert.equal(await page.locator('body').innerText().then(t=>t.includes('Profile Studio')),true);
  console.log('PASS: Electron startup, IPC, separate cookies, reopen persistence, cache-only removal preserving cookie/localStorage and other profile cache, local workflow, screenshot, clean stop.');
} finally {
  checkpoint('cleanup');
  if (electron) { await electron.evaluate(({app}) => app.exit(0)).catch(() => {}); await electron.close(); }
  clearTimeout(deadline);
  await new Promise(resolve=>server.close(resolve)); await rm(data,{recursive:true,force:true});
}
