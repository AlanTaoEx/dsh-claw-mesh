#!/usr/bin/env node
// Offline sanity check for the bundle: manifest, locales, detail document, icons, syntax.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const ok = [];
const read = (p) => readFileSync(join(root, p), 'utf8');
const exists = (p) => existsSync(join(root, p));

function check(condition, message) {
  (condition ? ok : fail).push(message);
}

// package.json
const pkg = JSON.parse(read('package.json'));
check(/^(@local\/)?dsh-claw-mesh$/.test(pkg.name), `package name is ${pkg.name}`);
check(/^0\.1\.\d+$/.test(pkg.version) || /^\d+\.\d+\.\d+/.test(pkg.version), `version ${pkg.version}`);
check(pkg.type === 'module', 'package type is module');
check(pkg.license === 'MIT', 'license is MIT');
check(Boolean(pkg.dsh?.bundle?.patch), 'dsh.bundle.patch declared');
check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform is web');
for (const key of ['.', './client', './locale/*.json', './icon']) {
  check(Boolean(pkg.exports?.[key]), `exports["${key}"] declared`);
}
for (const entry of ['index.js', 'client.js', 'cordis.patch.yml', 'docs', 'icon.svg', 'README.md', 'LICENSE']) {
  check(pkg.files?.includes(entry), `files includes ${entry}`);
}

// cordis patch
const patch = read(pkg.dsh.bundle.patch);
check(patch.includes(`name: '${pkg.name}'`), 'patch references the package name');
check(patch.includes('id: claw-mesh'), 'patch row id is claw-mesh');

// locales
for (const locale of ['en', 'zh']) {
  const path = `locale/${locale}.json`;
  check(exists(path), `${path} exists`);
  if (!exists(path)) continue;
  const data = JSON.parse(read(path));
  check(Boolean(data.meta?.title), `${path} has meta.title`);
  check(Boolean(data.meta?.description), `${path} has meta.description`);
  if (data.meta?.detail) {
    check(exists(data.meta.detail), `${path} meta.detail target exists`);
    const body = read(data.meta.detail).trim();
    check(/^!\[[^\]]*\]\([^)]+\)$/.test(body), `${data.meta.detail} is a single image line`);
    const image = body.slice(body.indexOf('(') + 1, body.lastIndexOf(')'));
    check(exists(join('docs', image)), `${image} exists beside the detail document`);
    if (exists(join('docs', image))) {
      const svg = read(join('docs', image));
      check(svg.includes('width="640"') && svg.includes('height="300"'), `${image} is 640x300`);
      check(!/<text|<style|<script|<foreignObject|<image/.test(svg), `${image} has no text/style/script/image`);
    }
  }
}

// icon
if (exists('icon.svg')) {
  const icon = read('icon.svg');
  check(icon.includes('width="36"') && icon.includes('height="36"'), 'icon.svg is 36x36');
  check(!/<text|<style|<script/.test(icon), 'icon.svg has no text/style/script');
  check(statSync(join(root, 'icon.svg')).size <= 256 * 1024, 'icon.svg within 256 KiB');
}

// host exports + client entry
const host = read('index.js');
check(/export\s+(async\s+)?function\s+apply/.test(host) || /export\s+default/.test(host), 'index.js exports apply');
const client = read('client.js');
check(client.includes('__ModuleLoader__.load'), 'client.js uses the module loader');
check(/sidebar\.panellist/.test(client) && /name: 'main'/.test(client), 'client registers sidebar + main panel');
check(client.includes("sidebar.footer.action") && client.includes('RemoteWorkspaces'), 'client registers remote workspace browser');
check(client.includes("view.kind === 'remoteWorkspaces'") && client.includes('onOpenRemoteWorkspaces'), 'device console exposes remote workspace entry');
check(client.includes('RemoteConversationView') && client.includes('remoteSessionPrompt'), 'client supports direct remote conversations');
check(client.includes('claw-mesh.remote-workspaces.collapsed'), 'remote workspace collapse state persists');

// syntax
for (const file of ['index.js', 'client.js', 'tools/second-node.mjs']) {
  try {
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' });
    ok.push(`${file} parses`);
  } catch (error) {
    fail.push(`${file} failed to parse: ${String(error.stderr ?? error).split('\n')[0]}`);
  }
}

for (const line of ok) console.log(`ok   ${line}`);
for (const line of fail) console.error(`FAIL ${line}`);
console.log(`\n${ok.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
