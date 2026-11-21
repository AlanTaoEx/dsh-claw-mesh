#!/usr/bin/env node
/**
 * Build a release archive into version/.
 *
 * The archive contains only files tracked by git, is named after the package
 * name and version, and never includes version/ itself. Nothing inside
 * version/ is committed (see .gitignore).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const outDir = join(root, 'version');
const name = `${pkg.name}-${pkg.version}`;
const outFile = join(outDir, `${name}.zip`);

mkdirSync(outDir, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

try {
  // Tracked files only: no .git, no version/, no local junk.
  run('git', ['archive', '--format=zip', `--prefix=${name}/`, '-o', outFile, 'HEAD']);
  console.log(`\npacked ${outFile}`);
  console.log('version/ is git-ignored; the archive stays local.');
} catch (error) {
  console.error('\npack failed: git archive needs at least one commit and a clean tree.');
  console.error(String(error?.message ?? error));
  process.exitCode = 1;
}

if (!existsSync(outFile)) process.exitCode = 1;
