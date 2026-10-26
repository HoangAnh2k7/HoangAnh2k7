// Verify the actual release ZIP, not a rebuilt executable. Run on its target OS.
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archive = resolve(process.argv[2] || '');
assert.ok(process.argv[2], 'Specify a release ZIP path');
assert.ok(['win32', 'darwin'].includes(process.platform), 'Run on Windows or macOS');
const [expected, filename] = (await readFile(`${archive}.sha256`, 'utf8')).trim().split(/\s+/);
assert.equal(filename, basename(archive));
assert.match(expected, /^[a-f0-9]{64}$/);
assert.equal(createHash('sha256').update(await readFile(archive)).digest('hex'), expected, 'ZIP checksum');
const directory = await mkdtemp(join(tmpdir(), 'profile-studio-package-'));
function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
try {
  if (process.platform === 'win32') {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:PROFILE_VERIFY_ZIP -DestinationPath $env:PROFILE_VERIFY_DIRECTORY'], { PROFILE_VERIFY_ZIP: archive, PROFILE_VERIFY_DIRECTORY: directory });
  } else {
    await run('unzip', ['-q', archive, '-d', directory]);
  }
  const executable = process.platform === 'win32' ? join(directory, 'profile-studio.exe') : join(directory, 'Profile Studio.app', 'Contents', 'MacOS', 'profile-studio');
  assert.ok((await stat(executable)).isFile());
  await run(process.execPath, ['scripts/smoke.mjs'], { PROFILE_STUDIO_EXECUTABLE: executable });
  console.log(`PASS: extracted ${basename(archive)} runs the packaged browser engine.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
