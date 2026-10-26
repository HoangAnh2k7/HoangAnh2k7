import { packager } from '@electron/packager';
import { mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const selected = process.argv[2] || 'all';
const targets = selected === 'all' ? ['win32', 'darwin'] : [selected];
if (targets.some(t => !['win32','darwin'].includes(t))) throw new Error('Target must be win32, darwin or all');
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const info = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
for (const platform of targets) {
  const paths = await packager({ dir: root, out: resolve(root, 'dist'), name: 'Profile Studio', executableName: 'profile-studio',
    platform, arch: 'x64', electronVersion: info.devDependencies.electron, overwrite: true, asar: true,
    appBundleId: 'local.profilestudio.app', appCategoryType: 'public.app-category.productivity',
    appVersion: info.version, prune: true,
    ignore: [/^\/artifacts(?:\/|$)/, /^\/dist(?:\/|$)/, /^\/test(?:\/|$)/, /^\/scripts(?:\/|$)/, /^\/docs(?:\/|$)/, /^\/\.git(?:\/|$)/, /^\/\.profile-studio(?:\/|$)/],
    download: { cacheRoot: process.env.electron_config_cache || '/tmp/electron-cache' }
  });
  for (const output of paths) {
    await copyFile(resolve(root, 'README.md'), resolve(output, 'README-vi.md'));
    await copyFile(resolve(root, 'docs/IMPLEMENTATION_STATUS.md'), resolve(output, 'IMPLEMENTATION_STATUS.md'));
    await copyFile(resolve(root, 'docs/FEATURE_MATRIX.md'), resolve(output, 'FEATURE_MATRIX.md'));
    const archive = resolve(root, 'artifacts', `Profile-Studio-${info.version}-${platform}-x64.zip`);
    await rm(archive, { force: true });
    await new Promise((ok, fail) => {
      const command = process.platform === 'win32' ? 'powershell.exe' : 'zip';
      const args = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', 'Get-ChildItem -LiteralPath $env:PROFILE_ZIP_SOURCE -Force | Compress-Archive -DestinationPath $env:PROFILE_ZIP_TARGET -CompressionLevel Optimal'] : ['-qr', '-y', archive, '.'];
      const p = spawn(command, args, { cwd: output, stdio: 'inherit', env: { ...process.env, PROFILE_ZIP_SOURCE: output, PROFILE_ZIP_TARGET: archive } });
      p.on('error', fail); p.on('exit', code => code === 0 ? ok() : fail(new Error(`zip exited ${code}`)));
    });
    const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
    await writeFile(`${archive}.sha256`, `${hash}  ${archive.split('/').pop()}\n`);
    console.log(`Built unsigned x64 package: ${archive}`);
  }
}
