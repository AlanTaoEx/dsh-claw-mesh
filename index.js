/**
 * Claw-Mesh — Host half.
 *
 * LAN device mesh for DeepSeek Harness:
 *  - UDP broadcast discovery (default 46801) keyed by a DeepSeek account fingerprint
 *  - peer control plane on 0.0.0.0 (default 46800): pair + HMAC-signed control + dispatch
 *  - loopback UI plane (default 46810): the sidebar console, Origin-gated, mirrors the
 *    same service methods the agent tools use
 *  - dispatch runs `dsh --profile headless --json -` on the target device
 */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statfsSync, renameSync, unlinkSync } from 'node:fs';
import { cpus, networkInterfaces, homedir, hostname, platform as osPlatform, release as osRelease, totalmem, uptime as osUptime, userInfo } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-claw-mesh';
export const inject = ['tools', 'systemPrompt'];

const VERSION = '0.1.0';
const MESH_TAG = 'claw-mesh/1';
const PEER_PORT = 46800;
const UI_PORT = 46810;
const DISCOVERY_PORT = 46801;
const SEEN_TTL_MS = 16_000;
const ENDPOINT_PROBE_EVERY_MS = 60_000;
const ANNOUNCE_MS = 4_000;
const SIG_WINDOW_MS = 120_000;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_EVENTS = 400;
const MAX_COMMAND_STDOUT = 64 * 1024;
const MAX_COMMAND_STDERR = 16 * 1024;
const MAX_JOB_LINE = 1024 * 1024;
const SSH_COMMAND_TIMEOUT_MS = 60_000;
const FORCE_KILL_AFTER_MS = 5_000;
const CONTROL_PROTOCOL = 1;
const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REQUEST_RECORDS = 200;
const IDEMPOTENT_ACTIONS = new Set(['dispatch', 'endpoint.run', 'endpoint.task', 'session.create']);
const PERMISSION_MODES = ['read-only', 'workspace-write', 'danger-full-access'];
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
// The Desktop shell renders the Web UI from its own scheme, so that origin is as local as loopback.
const TRUSTED_SCHEMES = new Set(['dsh-app:']);

// Overridable so a second node can run from a scratch directory (dev harness, tooling).
const STATE_DIR = process.env.DSH_MESH_STATE_DIR || join(homedir(), '.dsh', 'claw-mesh');
const STATE_FILE = join(STATE_DIR, 'state.json');
const UI_LOG_FILE = join(STATE_DIR, 'ui.log');
const OVERLAY_FILE = join(STATE_DIR, 'headless-login.patch.yml');

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultState() {
  return {
    version: 1,
    deviceId: randomUUID(),
    displayName: defaultDeviceName(),
    pairs: {},
    settings: {
      port: PEER_PORT,
      uiPort: UI_PORT,
      discoveryPort: DISCOVERY_PORT,
      cliPath: '',
      dispatchCwd: '',
      permissionMode: 'workspace-write',
      approvalPolicy: 'never',
      useLoginOverlay: true,
      discoverable: true,
      jobTimeoutMs: 30 * 60 * 1000,
    },
    jobs: {},
    endpoints: {},
    requests: {},
  };
}

function defaultDeviceName() {
  const host = hostname().replace(/\.local$/i, '');
  return host || 'dsh-device';
}

function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      pairs: parsed.pairs ?? {},
      jobs: parsed.jobs ?? {},
      endpoints: parsed.endpoints ?? {},
      requests: parsed.requests ?? {},
    };
  } catch {
    return defaultState();
  }
}

function persist(state) {
  const temporary = `${STATE_FILE}.${process.pid}.${randomUUID()}.tmp`;
  try {
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
    try {
      chmodSync(STATE_DIR, 0o700);
    } catch {
      /* Windows has limited POSIX permission support. */
    }
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, STATE_FILE);
    try {
      chmodSync(STATE_FILE, 0o600);
    } catch {
      /* The file was still created with the requested mode where supported. */
    }
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      /* The temporary file may not have been created. */
    }
    try {
      console.error(`[claw-mesh] state persist failed: ${String(error?.message ?? error)}`);
    } catch {
      /* ignore */
    }
  }
}

function shortId(id) {
  return typeof id === 'string' && id.length > 8 ? id.slice(0, 8) : String(id ?? '');
}

function accountFingerprint(userId) {
  if (!userId) return null;
  return createHash('sha256').update(`claw-mesh:account:${userId}`).digest('hex').slice(0, 16);
}

function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      const ip = info.address.split('.').map(Number);
      const mask = (info.netmask ?? '255.255.255.0').split('.').map(Number);
      if (ip.length !== 4 || mask.length !== 4) continue;
      out.add(ip.map((n, i) => (n & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return [...out];
}

function localAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

function signature(pairKey, deviceId, ts, body) {
  return createHmac('sha256', pairKey).update(`${deviceId}\n${ts}\n${body}`).digest('hex');
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'hex');
  const bb = Buffer.from(String(b ?? ''), 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

function isTrustedOrigin(origin) {
  if (!origin || origin === 'null') return false;
  try {
    const url = new URL(origin);
    if (TRUSTED_SCHEMES.has(url.protocol)) return true;
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* plugin                                                             */
/* ------------------------------------------------------------------ */

export function apply(ctx, config) {
  const state = loadState();
  if (config && typeof config === 'object') Object.assign(state.settings, config);
  for (const record of Object.values(state.requests)) {
    if (record?.state !== 'running') continue;
    record.state = 'completed';
    record.response = {
      status: 200,
      body: { ok: false, error: { code: 'request-interrupted', message: '节点重启中断了该请求，请使用新的 requestId 重试', retryable: true } },
    };
    record.updatedAt = Date.now();
  }
  persist(state);

  const peers = new Map();
  const recentSignatures = new Map();
  const jobs = new Map();
  const recentJobIds = [];
  const log = (level, message, extra) => {
    const line = `[claw-mesh] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`;
    try {
      if (level === 'error') console.error(line);
      else console.log(line);
    } catch {
      /* ignore */
    }
  };
  const uiLog = (message, extra) => {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      appendFileSync(UI_LOG_FILE, `${new Date().toISOString()} ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}\n`, 'utf8');
    } catch {
      /* ignore */
    }
  };

  let peerServer = null;
  let peerPort = 0;
  let selfCaps = null;
  let selfCapsAt = 0;
  let uiServer = null;
  let uiPort = 0;
  let udpSocket = null;
  let announceTimer = null;
  let sweepTimer = null;
  let probeTimer = null;
  let accountRefreshAt = 0;
  let selfInfo = {
    deviceId: state.deviceId,
    displayName: state.displayName,
    accountFingerprint: null,
    accountUserId: null,
    signedIn: false,
    accountLabel: '',
  };

  /* ---------------- account ---------------- */

  async function refreshAccount(force = false) {
    if (!force && Date.now() - accountRefreshAt < 10_000) return selfInfo;
    accountRefreshAt = Date.now();
    try {
      const account = ctx.get('deepseekAccount');
      if (!account) return selfInfo;
      const view = await account.getState();
      const signedIn = view?.status === 'credential-stored';
      let userId = null;
      let label = '';
      if (signedIn) {
        try {
          userId = (await account.getDeviceIdentity())?.userId ?? null;
        } catch {
          /* best effort */
        }
        try {
          const profile = await account.getProfile({ version: VERSION, locale: 'zh-CN', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 });
          const value = profile?.profile?.value ?? profile?.value ?? null;
          label = value?.name || value?.contact || '';
          if (!userId && value?.id) userId = value.id;
        } catch {
          /* best effort */
        }
      }
      selfInfo = { ...selfInfo, signedIn, accountUserId: userId, accountFingerprint: accountFingerprint(userId), accountLabel: label };
      // Dev harness only: lets tools/second-node.mjs announce itself as the same
      // account as another local node so the same-account UI path can be exercised.
      if (process.env.DSH_MESH_FAKE_ACCOUNT) {
        selfInfo = {
          ...selfInfo,
          signedIn: true,
          accountFingerprint: process.env.DSH_MESH_FAKE_ACCOUNT,
          accountLabel: process.env.DSH_MESH_FAKE_ACCOUNT_LABEL || label || 'dev-account',
        };
      }
    } catch (error) {
      log('error', 'account refresh failed', { message: String(error?.message ?? error) });
    }
    // Peers from a previous account (or from before sign-in) must not linger.
    pruneForeignPeers();
    return selfInfo;
  }

  /* ---------------- discovery ---------------- */

  function announce(kind = 'announce', target) {
    if (!udpSocket) return;
    // The account service can settle a few seconds after app startup. Without a
    // retry here the node keeps announcing account:null / signedIn:false, and
    // every peer treats it as a different account until some UI poll refreshes
    // selfInfo. refreshAccount() throttles itself, so this is cheap per tick.
    if (!selfInfo.signedIn) {
      void refreshAccount().then((info) => {
        if (info.signedIn) announce(kind, target);
      });
    }
    const payload = Buffer.from(
      JSON.stringify({
        tag: MESH_TAG,
        kind,
        deviceId: state.deviceId,
        displayName: state.displayName,
        port: peerPort,
        account: selfInfo.accountFingerprint,
        signedIn: selfInfo.signedIn,
        accountLabel: selfInfo.accountLabel,
        platform: osPlatform(),
        hostname: hostname(),
        sshUser: localUser(),
        addresses: localAddresses(),
        version: VERSION,
        caps: compactCaps(selfCaps),
        endpoints: listOwnedEndpoints().filter((ep) => ep.shared).map(({ endpointId, name, host, port, user, caps, lastProbe, ownerDeviceId, ownerName }) => ({ endpointId, name, host, port, user, caps, lastProbe, ownerDeviceId, ownerName })),
        ts: Date.now(),
      }),
    );
    const send = (address, port) => {
      try {
        udpSocket.send(payload, 0, payload.length, port, address);
      } catch {
        /* a blocked broadcast path is not fatal */
      }
    };
    if (target) {
      send(target.address, target.port ?? DISCOVERY_PORT);
      return;
    }
    for (const address of broadcastAddresses()) send(address, state.settings.discoveryPort ?? DISCOVERY_PORT);
  }

  function sameAccountAs(account) {
    const mine = selfInfo?.accountFingerprint;
    return Boolean(mine) && Boolean(account) && account === mine;
  }

  function pruneForeignPeers() {
    const keep = selfInfo?.accountFingerprint ?? null;
    for (const [deviceId, peer] of peers) {
      if (!keep || !peer.account || peer.account !== keep) peers.delete(deviceId);
    }
  }

  function onDatagram(buffer, rinfo) {
    let message;
    try {
      message = JSON.parse(buffer.toString('utf8'));
    } catch {
      return;
    }
    if (!message || message.tag !== MESH_TAG || typeof message.deviceId !== 'string') return;
    if (message.deviceId === state.deviceId) return;
    if (message.kind === 'bye') {
      peers.delete(message.deviceId);
      return;
    }
    if (!sameAccountAs(message.account)) {
      peers.delete(message.deviceId);
      return;
    }
    if (message.kind === 'probe') announce('announce', { address: rinfo.address, port: rinfo.port });
    const previous = peers.get(message.deviceId);
    peers.set(message.deviceId, {
      deviceId: message.deviceId,
      displayName: typeof message.displayName === 'string' ? message.displayName : shortId(message.deviceId),
      address: rinfo.address,
      port: Number(message.port) || PEER_PORT,
      account: message.account ?? null,
      accountLabel: message.accountLabel ?? '',
      signedIn: Boolean(message.signedIn),
      platform: message.platform ?? 'unknown',
      hostname: message.hostname ?? '',
      addresses: Array.isArray(message.addresses) ? message.addresses : [],
      version: message.version ?? '',
      caps: message.caps ?? previous?.caps ?? null,
      endpoints: Array.isArray(message.endpoints) ? message.endpoints : [],
      lastSeen: Date.now(),
      latencyMs: previous?.latencyMs ?? null,
      lastError: null,
    });
  }

  async function startDiscovery() {
    const port = state.settings.discoveryPort ?? DISCOVERY_PORT;
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    udpSocket = socket;
    socket.on('error', (error) => log('error', 'discovery socket error', { message: String(error?.message ?? error) }));
    socket.on('message', onDatagram);
    await new Promise((resolve) => {
      socket.bind(port, () => {
        try {
          socket.setBroadcast(true);
        } catch {
          /* ignore */
        }
        log('info', `discovery listening on udp/${port}`);
        resolve();
      });
      socket.once('error', () => resolve());
    });
    announce('probe');
    announce('announce');
    announceTimer = setInterval(() => announce('announce'), ANNOUNCE_MS);
    sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [deviceId, peer] of peers) if (now - peer.lastSeen > SEEN_TTL_MS) peers.delete(deviceId);
    }, 5_000);
  }

  function stopDiscovery() {
    if (announceTimer) clearInterval(announceTimer);
    if (sweepTimer) clearInterval(sweepTimer);
    announceTimer = null;
    sweepTimer = null;
    if (udpSocket) {
      try {
        announce('bye');
      } catch {
        /* ignore */
      }
      try {
        udpSocket.close();
      } catch {
        /* ignore */
      }
      udpSocket = null;
    }
  }

  /* ---------------- http plumbing ---------------- */

  function json(res, status, value, extraHeaders) {
    const body = JSON.stringify(value);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      ...extraHeaders,
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error('body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function listen(server, port, host) {
    return new Promise((resolve) => {
      const onError = () => {
        server.removeListener('listening', onListening);
        resolve(0);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  async function bindInRange(server, desired, host, span = 24) {
    for (let offset = 0; offset < span; offset += 1) {
      const port = desired + offset;
      const bound = await listen(server, port, host);
      if (bound) return port;
    }
    return 0;
  }

  /* ---------------- capability scan ---------------- */

  const OS_LABELS = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };

  function runCommand(bin, args, { timeoutMs = 5_000, input = null, env = null } = {}) {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: env ? { ...process.env, ...env } : process.env });
      } catch (error) {
        resolve({ code: -1, stdout: '', stderr: String(error?.message ?? error) });
        return;
      }
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish({ code: -1, stdout, stderr: `${stderr}\ntimeout`.trim() });
      }, timeoutMs);
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout = `${stdout}${chunk}`.slice(-MAX_COMMAND_STDOUT);
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-MAX_COMMAND_STDERR);
      });
      child.on('error', (error) => finish({ code: -1, stdout, stderr: `${stderr}${String(error?.message ?? error)}` }));
      child.on('close', (code) => finish({ code: code ?? -1, stdout, stderr }));
      try {
        child.stdin.end(input ?? '');
      } catch {
        /* ignore */
      }
    });
  }

  function chooseGpu(names) {
    const list = (names ?? []).map((name) => String(name ?? '').trim()).filter(Boolean);
    if (!list.length) return null;
    const wantReal = /(nvidia|geforce|rtx|gtx|quadro|radeon|\brx\s?\d|arc\s?a\d|apple\s+m\d|adreno|mali)/i;
    const virtual = /(virtual|basic display|remote|gameviewer|parsec|sunshine|citrix|vmware|hyper-v|virtualbox|meta|aspeed|matrox|cirrus|bochs|qxl|llvmpipe)/i;
    const real = list.filter((name) => !virtual.test(name));
    const pick = real.find((name) => wantReal.test(name)) ?? real[0] ?? list.find((name) => wantReal.test(name)) ?? list[0];
    return pick ?? null;
  }

  async function collectCapabilities({ force = false } = {}) {
    if (!force && selfCaps && Date.now() - selfCapsAt < 300_000) return selfCaps;
    const os = osPlatform();
    const cpuList = cpus();
    const caps = {
      os,
      osLabel: OS_LABELS[os] ?? os,
      release: osRelease(),
      arch: process.arch,
      cpu: cpuList[0]?.model?.trim() ?? '',
      cores: cpuList.length,
      memGb: Math.round((totalmem() / 2 ** 30) * 10) / 10,
      gpu: null,
      diskFreeGb: null,
      uptimeHours: Math.round(osUptime() / 360) / 10,
      tools: {},
      tags: [],
      scannedAt: Date.now(),
    };
    if (os === 'darwin') {
      const displays = await runCommand('system_profiler', ['SPDisplaysDataType', '-detailLevel', 'mini'], { timeoutMs: 8_000 });
      const chipset = displays.stdout.match(/Chipset Model:\s*(.+)/);
      if (chipset) caps.gpu = chipset[1].trim();
    } else if (os === 'linux') {
      const lspci = await runCommand('bash', ['-lc', "lspci 2>/dev/null | grep -iE 'vga|3d|display' | head -4"], { timeoutMs: 4_000 });
      const adapters = lspci.stdout
        .split(/\r?\n/)
        .map((line) => line.split(': ').slice(1).join(': ').trim() || line.trim())
        .filter(Boolean);
      caps.gpu = chooseGpu(adapters);
    } else if (os === 'win32') {
      const adapters = await runCommand('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'], { timeoutMs: 10_000 });
      caps.gpu = chooseGpu(adapters.stdout.split(/\r?\n/));
    }
    try {
      const stats = statfsSync(homedir());
      const available = Number(stats.bavail) * Number(stats.bsize);
      if (Number.isFinite(available) && available > 0) caps.diskFreeGb = Math.round((available / 1024 / 1024 / 1024) * 10) / 10;
    } catch {
      // statfs is unavailable on some older runtimes; fall back to df on posix.
    }
    if (caps.diskFreeGb === undefined && os !== 'win32') {
      const df = await runCommand('bash', ['-lc', 'df -k . | tail -1'], { timeoutMs: 4_000 });
      const fields = df.stdout.trim().split(/\s+/);
      const available = Number(fields[3]);
      if (Number.isFinite(available) && available > 0) caps.diskFreeGb = Math.round((available / 1024 / 1024) * 10) / 10;
    }
    for (const tool of ['node', 'python3', 'docker', 'git']) caps.tools[tool] = Boolean(whichOnPath(tool));
    caps.tags.push(os);
    if (caps.gpu) caps.tags.push('gpu');
    if (caps.tools.docker) caps.tags.push('docker');
    if (caps.cores >= 8) caps.tags.push('high-core');
    selfCaps = caps;
    selfCapsAt = Date.now();
    return caps;
  }

  function compactCaps(caps) {
    if (!caps) return null;
    return {
      os: caps.os,
      osLabel: caps.osLabel,
      arch: caps.arch,
      cpu: caps.cpu,
      cores: caps.cores,
      memGb: caps.memGb,
      gpu: caps.gpu,
      diskFreeGb: caps.diskFreeGb,
      tags: caps.tags,
    };
  }

  /* ---------------- peer plane (LAN) ---------------- */

  function presenceSummary() {
    const now = Date.now();
    const list = [];
    for (const peer of peers.values()) {
      if (now - peer.lastSeen > SEEN_TTL_MS) continue;
      const pair = state.pairs[peer.deviceId] ?? null;
      list.push({
        deviceId: peer.deviceId,
        shortId: shortId(peer.deviceId),
        displayName: peer.displayName,
        address: peer.address,
        port: peer.port,
        platform: peer.platform,
        hostname: peer.hostname,
        addresses: peer.addresses,
        version: peer.version,
        capabilities: peer.caps ?? null,
        endpoints: peer.endpoints ?? [],
        account: peer.account,
        accountLabel: peer.accountLabel,
        signedIn: peer.signedIn,
        sshUser: peer.sshUser ?? localUser(),
        sshCommand: peer.address ? `ssh ${peer.sshUser ?? localUser()}@${peer.address}` : null,
        sameAccount: Boolean(peer.account) && peer.account === selfInfo.accountFingerprint,
        lastSeen: peer.lastSeen,
        latencyMs: peer.latencyMs,
        lastError: peer.lastError ?? null,
        paired: Boolean(pair?.pairKey),
        allowControl: Boolean(pair?.allowControl),
        canControlPeer: Boolean(pair?.canControlPeer),
        maxPermissionMode: maximumPermission(pair),
      });
    }
    list.sort((a, b) => Number(b.sameAccount) - Number(a.sameAccount) || String(a.displayName).localeCompare(String(b.displayName)));
    return list;
  }

  function peerView() {
    return {
      deviceId: state.deviceId,
      displayName: state.displayName,
      platform: osPlatform(),
      hostname: hostname(),
      version: VERSION,
      protocols: [CONTROL_PROTOCOL],
      features: ['idempotency', 'replay-protection', 'permission-ceiling'],
      capabilities: selfCaps,
      port: peerPort,
      discoveryPort: state.settings.discoveryPort ?? DISCOVERY_PORT,
      addresses: localAddresses(),
      account: selfInfo.accountFingerprint,
      accountLabel: selfInfo.accountLabel,
      signedIn: selfInfo.signedIn,
      actions: ['dispatch', 'job', 'ping', 'cancel', 'capabilities', 'workspace.list', 'session.messages', 'session.create', 'session.prompt', 'session.cancel', 'endpoint.list', 'endpoint.test', 'endpoint.task', 'endpoint.run'],
      cli: cliDescription(),
    };
  }

  async function rawPeerRequest(deviceId, pathname, body) {
    const peer = peers.get(deviceId);
    if (!peer) throw new Error('device not online');
    const response = await fetch(`http://${peer.address}:${peer.port}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) throw new Error(parsed?.error?.message ?? parsed?.error ?? `peer responded ${response.status}`);
    return parsed;
  }

  function maximumPermission(pair) {
    return PERMISSION_MODES.includes(pair?.maxPermissionMode) ? pair.maxPermissionMode : 'workspace-write';
  }

  function remotePermission(pair, requested) {
    const maximum = maximumPermission(pair);
    if (requested === undefined) return { value: maximum };
    if (typeof requested !== 'string' || !PERMISSION_MODES.includes(requested)) {
      return { response: { status: 400, body: { ok: false, error: { code: 'invalid-permission', message: `未知权限模式：${String(requested)}` } } } };
    }
    if (PERMISSION_MODES.indexOf(requested) > PERMISSION_MODES.indexOf(maximum)) {
      return {
        response: {
          status: 403,
          body: { ok: false, error: { code: 'permission-exceeded', message: `目标节点最多允许 ${maximum}，不能请求 ${requested}` } },
        },
      };
    }
    return { value: requested };
  }

  async function pairWithPeer(deviceId, { allowControl, maxPermissionMode } = {}) {
    const peer = peers.get(deviceId);
    if (!peer) throw new Error('设备不在线');
    let pair = state.pairs[deviceId];
    if (!pair?.pairKey) {
      pair = {
        pairKey: randomBytes(32).toString('hex'),
        deviceId,
        displayName: peer.displayName,
        pairedAt: Date.now(),
        allowControl: false,
        canControlPeer: false,
        maxPermissionMode: 'workspace-write',
      };
      state.pairs[deviceId] = pair;
    }
    if (typeof allowControl === 'boolean') pair.allowControl = allowControl;
    if (maxPermissionMode !== undefined) {
      if (!PERMISSION_MODES.includes(maxPermissionMode)) throw new Error(`未知权限模式：${maxPermissionMode}`);
      pair.maxPermissionMode = maxPermissionMode;
    }
    if (!PERMISSION_MODES.includes(pair.maxPermissionMode)) pair.maxPermissionMode = 'workspace-write';
    pair.displayName = peer.displayName;
    persist(state);
    await rawPeerRequest(deviceId, '/mesh/pair', {
      pairKey: pair.pairKey,
      peer: { deviceId: state.deviceId, displayName: state.displayName, platform: osPlatform(), version: VERSION },
      allowControl: pair.allowControl,
    });
    return pair;
  }

  async function signedPeerRequest(deviceId, action, params = {}, { timeoutMs, requestId = randomUUID() } = {}) {
    const peer = peers.get(deviceId);
    if (!peer) throw new Error('设备不在线');
    const pair = state.pairs[deviceId];
    if (!pair?.pairKey) throw new Error('尚未配对：请先在本机信任面板授权该设备');
    const body = JSON.stringify({ v: CONTROL_PROTOCOL, requestId, action, params });
    const ts = String(Date.now());
    const effectiveTimeoutMs = timeoutMs ?? (action === 'endpoint.run' ? SSH_COMMAND_TIMEOUT_MS + 10_000 : action === 'endpoint.test' ? 30_000 : 20_000);
    const response = await fetch(`http://${peer.address}:${peer.port}/mesh/control`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mesh-device': state.deviceId,
        'x-mesh-ts': ts,
        'x-mesh-sig': signature(pair.pairKey, state.deviceId, ts, body),
      },
      body,
      signal: AbortSignal.timeout(effectiveTimeoutMs),
    });
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed?.v === CONTROL_PROTOCOL && typeof parsed?.ok === 'boolean') {
        if (!parsed.ok) return { status: response.status, ok: false, error: parsed.error, v: parsed.v, requestId: parsed.requestId };
        return { status: response.status, ...(parsed.result ?? {}), ok: true, v: parsed.v, requestId: parsed.requestId };
      }
      return { status: response.status, ...parsed };
    } catch {
      return { status: response.status, ok: false, error: { code: 'bad-response', message: text.slice(0, 400) } };
    }
  }

  function pruneRequests() {
    const now = Date.now();
    const entries = Object.entries(state.requests ?? {});
    for (const [key, record] of entries) if (record?.state !== 'running' && (record?.expiresAt ?? 0) <= now) delete state.requests[key];
    const remaining = Object.entries(state.requests ?? {}).sort((a, b) => (a[1]?.updatedAt ?? 0) - (b[1]?.updatedAt ?? 0));
    while (remaining.length > MAX_REQUEST_RECORDS) {
      const index = remaining.findIndex(([, record]) => record?.state !== 'running');
      if (index < 0) break;
      const [[key]] = remaining.splice(index, 1);
      delete state.requests[key];
    }
  }

  function beginRequest(deviceId, requestId, action, params) {
    pruneRequests();
    const key = `${deviceId}:${requestId}`;
    const hash = createHash('sha256').update(JSON.stringify({ action, params })).digest('hex');
    const existing = state.requests[key];
    if (existing && existing.hash !== hash) {
      return { response: { status: 409, body: { ok: false, error: { code: 'request-id-conflict', message: '相同 requestId 对应了不同请求内容' } } } };
    }
    if (existing?.response) return { response: existing.response };
    if (existing?.state === 'running') {
      return { response: { status: 202, body: { ok: false, error: { code: 'duplicate-in-progress', message: '相同 requestId 的请求仍在执行', retryable: true } } } };
    }
    const record = {
      deviceId,
      requestId,
      action,
      hash,
      state: 'running',
      response: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + REQUEST_TTL_MS,
    };
    state.requests[key] = record;
    persist(state);
    return { record };
  }

  function completeRequest(record, status, body) {
    if (!record) return;
    record.state = 'completed';
    record.response = { status, body };
    record.updatedAt = Date.now();
    record.expiresAt = Date.now() + REQUEST_TTL_MS;
    persist(state);
  }

  function beginLocalRequest(payload, action, params) {
    const requestId = String(payload?.requestId ?? '');
    if (!requestId) return { finish: (body) => body };
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) {
      return { response: { ok: false, error: { code: 'bad-request-id', message: 'requestId 格式无效' } } };
    }
    const request = beginRequest(state.deviceId, requestId, action, params);
    return {
      response: request.response?.body,
      finish: (body) => {
        completeRequest(request.record, 200, body);
        return body;
      },
    };
  }

  /** Remote callers may only touch endpoints their owner explicitly shared. */
  function remoteEndpoint(endpointId) {
    const ep = state.endpoints?.[String(endpointId ?? '')];
    if (!ep) return { error: { status: 404, body: { ok: false, error: { code: 'missing', message: '设备不存在' } } } };
    if (!ep.shared) {
      return {
        error: {
          status: 200,
          body: { ok: false, error: { code: 'endpoint-not-shared', message: '该 SSH 设备未共享给其他节点' } },
        },
      };
    }
    return { ep };
  }

  async function handlePeerRequest(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    if (req.method === 'GET' && (path === '/mesh/info' || path === '/health')) {
      json(res, 200, path === '/health' ? { ok: true, service: 'claw-mesh', version: VERSION } : peerView());
      return;
    }
    if (req.method === 'POST' && path === '/mesh/pair') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { ok: false, error: 'invalid json' });
        return;
      }
      if (typeof body?.pairKey !== 'string' || body.pairKey.length < 32 || typeof body?.peer?.deviceId !== 'string') {
        json(res, 400, { ok: false, error: 'invalid pair request' });
        return;
      }
      const existing = state.pairs[body.peer.deviceId] ?? {};
      state.pairs[body.peer.deviceId] = {
        ...existing,
        deviceId: body.peer.deviceId,
        displayName: String(body.peer.displayName ?? existing.displayName ?? shortId(body.peer.deviceId)),
        pairKey: body.pairKey,
        pairedAt: existing.pairedAt ?? Date.now(),
        allowControl: Boolean(existing.allowControl),
        canControlPeer: Boolean(body.allowControl),
        maxPermissionMode: maximumPermission(existing),
      };
      persist(state);
      json(res, 200, { ok: true, deviceId: state.deviceId });
      return;
    }
    if (req.method === 'POST' && path === '/mesh/control') {
      const raw = await readBody(req);
      const deviceId = String(req.headers['x-mesh-device'] ?? '');
      const ts = String(req.headers['x-mesh-ts'] ?? '');
      const sig = String(req.headers['x-mesh-sig'] ?? '');
      const pair = state.pairs[deviceId];
      if (!pair?.pairKey) {
        json(res, 403, { ok: false, error: { code: 'not-paired', message: '设备未配对' } });
        return;
      }
      const timestamp = Number(ts);
      if (!ts || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > SIG_WINDOW_MS) {
        json(res, 403, { ok: false, error: { code: 'stale', message: '请求时间戳超出允许窗口' } });
        return;
      }
      if (!safeEqualHex(signature(pair.pairKey, deviceId, ts, raw), sig)) {
        json(res, 403, { ok: false, error: { code: 'bad-signature', message: '签名校验失败' } });
        return;
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        json(res, 400, { ok: false, error: { code: 'bad-request', message: 'invalid json' } });
        return;
      }
      if (payload?.v !== undefined && payload.v !== CONTROL_PROTOCOL) {
        json(res, 400, { ok: false, error: { code: 'unsupported-version', message: `unsupported control protocol ${payload.v}` } });
        return;
      }
      const isV1 = payload?.v === CONTROL_PROTOCOL;
      const requestId = isV1 ? String(payload.requestId ?? '') : null;
      if (isV1 && !/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) {
        json(res, 400, { ok: false, error: { code: 'bad-request-id', message: 'v1 requests require a valid requestId' } });
        return;
      }
      const action = typeof payload?.action === 'string' ? payload.action : '';
      const params = payload?.params && typeof payload.params === 'object' && !Array.isArray(payload.params) ? payload.params : {};
      const respond = (status, body) => {
        if (!isV1) {
          json(res, status, body);
          return;
        }
        if (body?.ok === false) {
          json(res, status, { v: CONTROL_PROTOCOL, requestId, ok: false, error: body.error });
          return;
        }
        const { ok: ignored, ...result } = body ?? {};
        json(res, status, { v: CONTROL_PROTOCOL, requestId, ok: true, result });
      };
      if (!action || (payload?.params !== undefined && (!payload.params || typeof payload.params !== 'object' || Array.isArray(payload.params)))) {
        respond(400, { ok: false, error: { code: 'bad-request', message: 'action and object params are required' } });
        return;
      }
      const idempotency = isV1 && pair.allowControl && IDEMPOTENT_ACTIONS.has(action) ? beginRequest(deviceId, requestId, action, params) : null;
      if (idempotency?.response) {
        respond(idempotency.response.status, idempotency.response.body);
        return;
      }
      const finish = (status, body) => {
        completeRequest(idempotency?.record, status, body);
        respond(status, body);
      };
      const now = Date.now();
      for (const [key, expiresAt] of recentSignatures) if (expiresAt <= now) recentSignatures.delete(key);
      const replayKey = `${deviceId}:${sig}`;
      if (recentSignatures.has(replayKey)) {
        respond(409, { ok: false, error: { code: 'replayed-request', message: '相同签名请求已经处理过' } });
        return;
      }
      recentSignatures.set(replayKey, now + SIG_WINDOW_MS);
      if (action === 'ping') {
        respond(200, { ok: true, pong: Date.now(), device: peerView() });
        return;
      }
      if (!pair.allowControl) {
        respond(403, {
          ok: false,
          error: { code: 'denied', message: `${state.displayName} 尚未允许该设备控制本机` },
        });
        return;
      }
      if (action === 'capabilities') {
        respond(200, { ok: true, device: peerView() });
        return;
      }
      if (action === 'workspace.list') {
        try {
          const result = await localWorkspaces();
          respond(200, { ok: true, ...result });
        } catch (error) {
          respond(500, { ok: false, error: { code: 'workspace-unavailable', message: String(error?.message ?? error) } });
        }
        return;
      }
      if (action === 'session.messages') {
        try {
          respond(200, { ok: true, ...(await remoteSessionMessages(params)) });
        } catch (error) {
          respond(500, { ok: false, error: { code: 'session-read-failed', message: String(error?.message ?? error) } });
        }
        return;
      }
      if (action === 'session.create') {
        try {
          finish(200, { ok: true, ...(await remoteSessionCreate(params)) });
        } catch (error) {
          finish(500, { ok: false, error: { code: 'session-create-failed', message: String(error?.message ?? error) } });
        }
        return;
      }
      if (action === 'session.prompt') {
        try {
          respond(200, { ok: true, ...(await remoteSessionPrompt(params)) });
        } catch (error) {
          respond(500, { ok: false, error: { code: 'session-prompt-failed', message: String(error?.message ?? error) } });
        }
        return;
      }
      if (action === 'session.cancel') {
        try {
          respond(200, { ok: true, ...remoteSessionCancel(params) });
        } catch (error) {
          respond(500, { ok: false, error: { code: 'session-cancel-failed', message: String(error?.message ?? error) } });
        }
        return;
      }
      if (action === 'dispatch') {
        const prompt = String(params.prompt ?? '').trim();
        if (!prompt) {
          finish(400, { ok: false, error: { code: 'empty-prompt', message: '任务内容不能为空' } });
          return;
        }
        const permission = remotePermission(pair, params.permissionMode);
        if (permission.response) {
          finish(permission.response.status, permission.response.body);
          return;
        }
        try {
          const job = startJob({
            prompt,
            cwd: typeof params.cwd === 'string' && params.cwd ? params.cwd : undefined,
            permissionMode: permission.value,
            approvalPolicy: state.settings.approvalPolicy,
            origin: { deviceId, displayName: pair.displayName ?? shortId(deviceId), kind: 'remote' },
          });
          finish(200, { ok: true, jobId: job.id, target: state.displayName });
        } catch (error) {
          finish(500, { ok: false, error: { code: 'dispatch-failed', message: String(error?.message ?? error) } });
        }
        return;
      }
      if (action === 'job') {
        const job = jobs.get(String(params.jobId ?? ''));
        if (!job) {
          respond(404, { ok: false, error: { code: 'no-job', message: '任务不存在或已过期' } });
          return;
        }
        respond(200, { ok: true, job: jobView(job, { includeEvents: params.includeEvents !== false }) });
        return;
      }
      if (action === 'cancel') {
        const job = jobs.get(String(params.jobId ?? ''));
        if (job) cancelJob(job);
        respond(200, { ok: true, cancelled: Boolean(job) });
        return;
      }
      if (action === 'endpoint.list') {
        respond(200, { ok: true, endpoints: listOwnedEndpoints().filter((ep) => ep.shared) });
        return;
      }
      if (action === 'endpoint.test') {
        const found = remoteEndpoint(params.endpointId);
        if (found.error) {
          finish(found.error.status, found.error.body);
          return;
        }
        const probe = await probeEndpoint(found.ep);
        respond(200, { ok: true, probe });
        return;
      }
      if (action === 'endpoint.run') {
        const command = String(params.command ?? '').trim();
        if (!command) {
          finish(400, { ok: false, error: { code: 'empty-command', message: '远端命令不能为空' } });
          return;
        }
        const found = remoteEndpoint(params.endpointId);
        if (found.error) {
          finish(found.error.status, found.error.body);
          return;
        }
        try {
          const output = await sshExec(found.ep, command, { timeoutMs: SSH_COMMAND_TIMEOUT_MS });
          finish(200, { ok: true, output });
        } catch (error) {
          finish(500, { ok: false, error: { code: 'ssh-failed', message: String(error?.message ?? error) } });
        }
        return;
      }
      if (action === 'endpoint.task') {
        const prompt = String(params.prompt ?? '').trim();
        if (!prompt) {
          finish(400, { ok: false, error: { code: 'empty-prompt', message: '任务内容不能为空' } });
          return;
        }
        const permission = remotePermission(pair, params.permissionMode);
        if (permission.response) {
          finish(permission.response.status, permission.response.body);
          return;
        }
        const found = remoteEndpoint(params.endpointId);
        if (found.error) {
          finish(found.error.status, found.error.body);
          return;
        }
        const ep = found.ep;
        try {
          const job = startJob({
            prompt: `${endpointPreamble(ep)}${prompt}`,
            permissionMode: permission.value,
            origin: { deviceId, displayName: pair.displayName ?? shortId(deviceId), kind: 'endpoint' },
            target: { deviceId: ep.id, displayName: ep.name, kind: 'endpoint' },
          });
          job.endpointId = ep.id;
          finish(200, { ok: true, jobId: job.id, target: ep.name });
        } catch (error) {
          finish(500, { ok: false, error: { code: 'dispatch-failed', message: String(error?.message ?? error) } });
        }
        return;
      }
      respond(400, { ok: false, error: { code: 'unknown-action', message: `unknown action ${action}` } });
      return;
    }
    json(res, 404, { ok: false, error: 'not found' });
  }

  async function startPeerServer() {
    const server = createServer((req, res) => {
      handlePeerRequest(req, res).catch((error) => {
        try {
          json(res, 500, { ok: false, error: { code: 'internal', message: String(error?.message ?? error) } });
        } catch {
          /* ignore */
        }
      });
    });
    const port = await bindInRange(server, Number(state.settings.port) || PEER_PORT, '0.0.0.0');
    if (!port) {
      log('error', 'unable to bind the peer control plane');
      return;
    }
    peerServer = server;
    peerPort = port;
    log('info', `peer control plane on 0.0.0.0:${port}`);
  }

  /* ---------------- dsh CLI + jobs ---------------- */

  function whichOnPath(bin) {
    const dirs = String(process.env.PATH ?? '').split(delimiter);
    const exts = process.platform === 'win32' ? String(process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
    for (const dir of dirs) {
      if (!dir) continue;
      for (const ext of exts) {
        const candidate = join(dir, `${bin}${ext.toLowerCase()}`);
        if (existsSync(candidate)) return candidate;
        if (ext) { const upper = join(dir, `${bin}${ext}`); if (existsSync(upper)) return upper; }
      }
    }
    return null;
  }

  function resolveCli() {
    const explicit = String(state.settings.cliPath ?? '').trim();
    if (explicit && existsSync(explicit)) return { kind: 'node', node: process.execPath, script: explicit, electron: false, source: 'config' };
    if (process.resourcesPath) {
      const candidate = join(process.resourcesPath, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
      if (existsSync(candidate)) return { kind: 'node', node: process.execPath, script: candidate, electron: true, source: 'app' };
    }
    const fromPath = whichOnPath('dsh');
    if (fromPath) return { kind: 'bin', node: fromPath, script: null, electron: false, source: 'path' };
    return null;
  }

  function localUser() {
  try {
    return userInfo().username ?? 'user';
  } catch {
    return 'user';
  }
}

function cliDescription() {
    const cli = resolveCli();
    if (!cli) return { resolved: false, source: 'none', hint: '未找到 dsh CLI，请确认 dsh 已安装且可从 PATH 调用' };
    return { resolved: true, source: cli.source, script: cli.script ?? cli.node };
  }

  function ensureOverlay() {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(
        OVERLAY_FILE,
        [
          '# Claw-Mesh: run the headless profile with the credentials the desktop app already stores.',
          '# The api-key adapter is disabled so the saved DeepSeek account login is the only provider.',
          '- id: credentials',
          '  disabled: false',
          '- id: authorization',
          '  disabled: false',
          '- id: deepseek-account',
          '  disabled: false',
          '- id: llm-deepseek',
          '  disabled: true',
          '- id: agent-default-model',
          '  config:',
          '    provider: deepseek-account',
          '    model: deepseek-flash',
          '',
        ].join('\n'),
        'utf8',
      );
      return OVERLAY_FILE;
    } catch {
      return null;
    }
  }

  function pushEvent(job, event) {
    if (job.events.length >= MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS + 1);
    job.events.push(event);
  }

  function extractFinalText(event) {
    const candidates = [event?.text, event?.data?.text, event?.data?.message, event?.message, event?.data?.result?.text, event?.data?.output];
    let best = '';
    for (const candidate of candidates) if (typeof candidate === 'string' && candidate.length > best.length) best = candidate;
    return best;
  }

  function summarizeEvent(raw) {
    const type = typeof raw?.type === 'string' ? raw.type : 'event';
    if (type === 'text') return { type: 'text', text: String(raw.text ?? '') };
    if (type === 'thinking') return { type: 'thinking', text: String(raw.text ?? '') };
    if (type === 'final') return { type: 'final', text: extractFinalText(raw) };
    if (type === 'status') {
      const phase = raw.phase;
      if (phase === 'turn_start') return { type: 'status', text: `第 ${raw.turn ?? 1} 轮开始` };
      if (phase === 'turn_end') {
        const kind = raw?.reason?.kind ?? '';
        return { type: 'status', text: kind === 'completed' ? `第 ${raw.turn ?? 1} 轮完成` : `第 ${raw.turn ?? 1} 轮结束：${kind}` };
      }
      if (phase === 'step_end' && raw.usage) {
        const usage = raw.usage;
        return { type: 'usage', text: `tokens 输入 ${usage.inputTokens ?? 0} / 输出 ${usage.outputTokens ?? 0} / 缓存 ${usage.cacheReadTokens ?? 0}` };
      }
      return { type: 'status', text: '' };
    }
    const toolName = raw?.name ?? raw?.tool ?? raw?.data?.name ?? raw?.data?.tool;
    if (toolName) return { type: 'tool', text: String(toolName) };
    const inline = raw?.message ?? raw?.data?.text;
    if (typeof inline === 'string' && inline) return { type, text: inline };
    return { type: 'event', text: '' };
  }

  function rememberJob(jobId) {
    recentJobIds.unshift(jobId);
    if (recentJobIds.length > 40) recentJobIds.length = 40;
    persistJobs();
  }

  function persistJobs() {
    const summary = {};
    for (const id of recentJobIds) {
      const job = jobs.get(id);
      if (!job) continue;
      summary[id] = {
        id: job.id,
        prompt: job.prompt.slice(0, 500),
        status: job.status,
        startedAt: job.startedAt,
        endedAt: job.endedAt,
        target: job.target,
        origin: job.origin,
        finalText: job.finalText.slice(0, 2000),
      };
    }
    state.jobs = summary;
    persist(state);
  }

  function startJob({ prompt, cwd, permissionMode, approvalPolicy, origin, target }) {
    const cli = resolveCli();
    if (!cli) throw new Error('目标设备未找到 dsh CLI（可在设置中指定 cliPath）');
    const job = {
      id: randomUUID(),
      prompt,
      cwd: cwd || state.settings.dispatchCwd || homedir(),
      permissionMode: permissionMode ?? state.settings.permissionMode ?? 'workspace-write',
      approvalPolicy: approvalPolicy ?? state.settings.approvalPolicy ?? 'never',
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      events: [],
      finalText: '',
      stderr: '',
      origin: origin ?? { deviceId: state.deviceId, displayName: state.displayName, kind: 'local' },
      target: target ?? { deviceId: state.deviceId, displayName: state.displayName },
      usedCli: cli.source,
      cliLabel: cli.kind === 'bin' ? cli.node : `${cli.node} ${cli.script}`,
    };
    jobs.set(job.id, job);
    rememberJob(job.id);
    // Launcher flags (--profile / --patch) must precede the app's own arguments.
    const args = ['--profile', 'headless'];
    if (state.settings.useLoginOverlay) {
      const overlay = ensureOverlay();
      if (overlay) args.push('--patch', overlay);
    }
    args.push('--json', '--permission-mode', job.permissionMode, '--approval-policy', job.approvalPolicy, '-');
    const env = { ...process.env };
    if (cli.electron) env.ELECTRON_RUN_AS_NODE = '1';
    const child = cli.kind === 'bin' ? spawn(cli.node, args, { cwd: job.cwd, env }) : spawn(cli.node, [cli.script, ...args], { cwd: job.cwd, env });
    job.child = child;
    uiLog('job-start', { id: shortId(job.id), cli: cli.source, cwd: job.cwd, prompt: prompt.slice(0, 120) });
    const timeoutMs = Number(state.settings.jobTimeoutMs) || 30 * 60 * 1000;
    job.timeoutTimer = setTimeout(() => {
      if (job.status !== 'running') return;
      job.status = 'timed_out';
      job.endedAt = Date.now();
      pushEvent(job, { seq: job.events.length, at: Date.now(), type: 'timeout', text: `超过 ${Math.round(timeoutMs / 1000)}s 未完成，已终止` });
      terminateJob(job);
      persistJobs();
    }, timeoutMs);
    let buffer = '';
    let discardingLine = false;
    const handleLine = (rawLine) => {
      if (rawLine.length > MAX_JOB_LINE) {
        pushEvent(job, { seq: job.events.length, at: Date.now(), type: 'output-truncated', text: '丢弃超过 1 MiB 的单行输出' });
        return;
      }
      const line = rawLine.trim();
      if (!line) return;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        pushEvent(job, { seq: job.events.length, at: Date.now(), type: 'stdout', text: line.slice(0, 1200) });
        return;
      }
      const summary = summarizeEvent(parsed);
      if (summary.text || summary.type === 'final') {
        pushEvent(job, { seq: job.events.length, at: Date.now(), type: summary.type, text: summary.text.slice(0, 1200) });
      }
      if (summary.type === 'final') {
        job.finalText = summary.text;
        if (parsed?.reason?.kind && parsed.reason.kind !== 'completed') job.status = 'failed';
        if (parsed?.reason?.error?.message) job.errorMessage = String(parsed.reason.error.message).slice(0, 400);
      }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (discardingLine) {
        const newline = chunk.indexOf('\n');
        if (newline < 0) return;
        chunk = chunk.slice(newline + 1);
        discardingLine = false;
      }
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
      if (buffer.length > MAX_JOB_LINE) {
        pushEvent(job, { seq: job.events.length, at: Date.now(), type: 'output-truncated', text: '丢弃超过 1 MiB 且无换行的输出' });
        buffer = '';
        discardingLine = true;
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      job.stderr = `${job.stderr}${chunk}`.slice(-4000);
    });
    child.on('error', (error) => {
      clearJobTimers(job);
      job.status = 'failed';
      job.endedAt = Date.now();
      pushEvent(job, { seq: job.events.length, at: Date.now(), type: 'error', text: String(error?.message ?? error) });
      uiLog('job-error', { id: shortId(job.id), message: String(error?.message ?? error) });
      persistJobs();
    });
    child.on('close', (code, signal) => {
      clearJobTimers(job);
      handleLine(buffer);
      buffer = '';
      job.exitCode = code;
      job.endedAt = Date.now();
      if (job.status === 'running') job.status = code === 0 ? 'completed' : 'failed';
      if (signal) job.signal = signal;
      if (code !== 0 && !job.finalText && job.stderr) pushEvent(job, { seq: job.events.length, at: Date.now(), type: 'stderr', text: job.stderr.slice(-1200) });
      if (code !== 0 && !job.errorMessage) {
        if (/unknown option .--json/.test(job.stderr)) job.errorMessage = `目标节点的 dsh 版本过旧（不支持 --json），请升级到 DSH 0.2 及以上：${job.cliLabel ?? ''}`;
        else if (/Authentication Fails|401/i.test(job.stderr)) job.errorMessage = '目标节点的 DeepSeek 账号鉴权失败，请在该设备上确认已登录';
        else job.errorMessage = job.stderr.trim().split('\n').slice(-1)[0]?.slice(0, 300) ?? '';
      }
      uiLog('job-end', { id: shortId(job.id), code, status: job.status, events: job.events.length });
      persistJobs();
    });
    try {
      child.stdin.end(prompt.endsWith('\n') ? prompt : `${prompt}\n`);
    } catch (error) {
      pushEvent(job, { seq: job.events.length, at: Date.now(), type: 'error', text: String(error?.message ?? error) });
    }
    return job;
  }

  function clearJobTimers(job) {
    clearTimeout(job.timeoutTimer);
    clearTimeout(job.forceKillTimer);
    job.timeoutTimer = null;
    job.forceKillTimer = null;
  }

  function terminateJob(job) {
    try {
      job.child?.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    if (job.forceKillTimer) return;
    job.forceKillTimer = setTimeout(() => {
      try {
        job.child?.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, FORCE_KILL_AFTER_MS);
  }

  function cancelJob(job) {
    if (job.status === 'running') {
      job.status = 'cancelled';
      job.endedAt = Date.now();
    } else if (job.status !== 'timed_out') {
      return;
    }
    clearTimeout(job.timeoutTimer);
    job.timeoutTimer = null;
    terminateJob(job);
    persistJobs();
  }

  function jobView(job, { includeEvents = true } = {}) {
    return {
      id: job.id,
      prompt: job.prompt,
      cwd: job.cwd,
      permissionMode: job.permissionMode,
      approvalPolicy: job.approvalPolicy,
      status: job.status,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      exitCode: job.exitCode,
      signal: job.signal ?? null,
      finalText: job.finalText,
      errorMessage: job.errorMessage ?? '',
      stderr: job.stderr.slice(-1200),
      origin: job.origin,
      target: job.target,
      usedCli: job.usedCli,
      eventCount: job.events.length,
      events: includeEvents ? job.events.slice(-160) : [],
    };
  }

  function localJobs() {
    return recentJobIds
      .map((id) => jobs.get(id))
      .filter(Boolean)
      .map((job) => ({ id: job.id, prompt: job.prompt.slice(0, 200), status: job.status, startedAt: job.startedAt, endedAt: job.endedAt, origin: job.origin, target: job.target }));
  }

  function workspaceBasename(value) {
    const parts = String(value ?? '').split(/[\\/]/).filter(Boolean);
    return parts.at(-1) ?? '';
  }

  async function localWorkspaces() {
    const registry = ctx.get('workspaceRegistry');
    const controller = ctx.get('sessionController');
    if (!registry || !controller) throw new Error('当前 DSH 未提供工作区查询接口');
    const listed = await controller.list({}, AbortSignal.timeout(8_000));
    const sessionViews = new Map();
    for (const entry of listed?.items ?? []) {
      const id = String(entry.sessionId ?? '');
      if (!id) continue;
      sessionViews.set(id, {
        id,
        title: entry.projections?.values?.title || workspaceBasename(entry.cwd) || id,
        cwd: entry.cwd ?? '',
        running: Boolean(entry.running),
        updatedAt: Number(entry.updatedAt) || 0,
      });
    }
    const assigned = new Set();
    const workspaces = registry.list().slice(0, 50).map((workspace) => {
      const sessions = [];
      for (const id of workspace.sessionIds ?? []) {
        const session = sessionViews.get(id);
        if (!session) continue;
        assigned.add(id);
        sessions.push(session);
      }
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return {
        id: workspace.id,
        title: workspace.title || workspaceBasename(workspace.path) || workspace.id,
        path: workspace.path,
        sessions: sessions.slice(0, 50),
      };
    });
    const ungroupedSessions = [...sessionViews.values()]
      .filter((session) => !assigned.has(session.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
    return { workspaces, ungroupedSessions };
  }

  function sessionText(content) {
    return (content ?? []).filter((part) => part?.type === 'text').map((part) => part.text ?? '').join('');
  }

  async function remoteSessionMessages(params) {
    const controller = ctx.get('sessionController');
    if (!controller) throw new Error('当前 DSH 未提供会话接口');
    const sessionId = String(params.sessionId ?? '');
    if (!sessionId) throw new Error('缺少 sessionId');
    const read = controller.events ?? controller.page;
    const page = await read.call(controller, {
      address: { kind: 'session', sessionId },
      maxMessages: Math.max(1, Math.min(Number(params.maxMessages) || 50, 100)),
    }, AbortSignal.timeout(10_000));
    const messages = [];
    for (const record of page?.records ?? []) {
      const event = record?.event;
      if (!event || event.surfaceOp !== 'append') continue;
      if (event.type === 'user/message' && event.data?.source?.kind === 'user') {
        messages.push({
          seq: event.seq,
          time: event.time,
          role: 'user',
          text: sessionText(event.data.content),
        });
      } else if (event.type === 'assistant/message') {
        messages.push({
          seq: event.seq,
          time: event.time,
          role: 'assistant',
          text: sessionText(event.data?.message?.content),
          interrupted: event.data?.interrupted === true,
        });
      }
    }
    const listed = await controller.list({}, AbortSignal.timeout(5_000));
    const current = (listed?.items ?? []).find((entry) => entry.sessionId === sessionId);
    // Tool-only assistant turns carry no text; they would render as blank rows.
    const visible = messages.filter((message) => String(message.text ?? '').trim().length > 0);
    return {
      messages: visible,
      running: Boolean(current?.running),
      cursor: page?.cursor ?? 0,
      hasMore: Boolean(page?.hasMore),
      title: current?.projections?.values?.title || workspaceBasename(current?.cwd) || sessionId,
      cwd: current?.cwd ?? '',
    };
  }

  async function remoteSessionPrompt(params) {
    const controller = ctx.get('sessionController');
    if (!controller) throw new Error('当前 DSH 未提供会话接口');
    const sessionId = String(params.sessionId ?? '');
    const text = String(params.text ?? '').trim();
    if (!sessionId || !text) throw new Error('sessionId 和消息内容不能为空');
    const requestId = String(params.requestId ?? '') || randomUUID();
    await controller.prompt({
      requestId,
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }, AbortSignal.timeout(10_000));
    return { accepted: true, requestId };
  }

  async function remoteSessionCreate(params) {
    const controller = ctx.get('sessionController');
    if (!controller) throw new Error('当前 DSH 未提供会话接口');
    const request = {};
    if (params.workspaceId) request.workspaceId = String(params.workspaceId);
    else if (params.cwd) request.cwd = String(params.cwd);
    const created = await controller.create(request);
    return { sessionId: created.sessionId, agentPreset: created.agentPreset ?? null };
  }

  function remoteSessionCancel(params) {
    const controller = ctx.get('sessionController');
    if (!controller) throw new Error('当前 DSH 未提供会话接口');
    const sessionId = String(params.sessionId ?? '');
    if (!sessionId) throw new Error('缺少 sessionId');
    controller.cancel({ sessionId });
    return { accepted: true };
  }

  async function remoteWorkspaces() {
    await refreshPresence();
    const candidates = presenceSummary().filter((peer) => peer.sameAccount && peer.canControlPeer);
    const devices = await Promise.all(candidates.map(async (peer) => {
      try {
        const result = await signedPeerRequest(peer.deviceId, 'workspace.list', {}, { timeoutMs: 10_000 });
        if (!result.ok) throw new Error(result.error?.message ?? '无法读取工作区');
        return {
          deviceId: peer.deviceId,
          displayName: peer.displayName,
          online: true,
          workspaces: result.workspaces ?? [],
          ungroupedSessions: result.ungroupedSessions ?? [],
          error: '',
        };
      } catch (error) {
        return {
          deviceId: peer.deviceId,
          displayName: peer.displayName,
          online: false,
          workspaces: [],
          ungroupedSessions: [],
          error: String(error?.message ?? error),
        };
      }
    }));
    return { ok: true, updatedAt: Date.now(), devices };
  }

  /* ---------------- service methods ---------------- */

  async function statusPayload() {
    await refreshAccount();
    return {
      ok: true,
      version: VERSION,
      updatedAt: Date.now(),
      self: {
        ...peerView(),
        shortId: shortId(state.deviceId),
        accountFingerprint: selfInfo.accountFingerprint,
        discoverable: Boolean(udpSocket),
        controlPlane: peerServer ? `0.0.0.0:${peerPort}` : '未监听',
        uiPlane: uiServer ? `127.0.0.1:${uiPort}` : '未监听',
        settings: { ...state.settings },
      },
      peers: presenceSummary(),
      endpoints: listOwnedEndpoints(),
      jobs: localJobs(),
    };
  }

  async function refreshPresence() {
    announce('probe');
    announce('announce');
    const work = [];
    for (const peer of presenceSummary()) {
      if (!peer.paired) continue;
      work.push(
        (async () => {
          const startedAt = Date.now();
          try {
            const result = await signedPeerRequest(peer.deviceId, 'ping', {}, { timeoutMs: 4_000 });
            const record = peers.get(peer.deviceId);
            if (!record) return;
            if (result.ok) {
              record.latencyMs = Date.now() - startedAt;
              record.lastSeen = Date.now();
              record.lastError = null;
              record.displayName = result.device?.displayName ?? record.displayName;
              record.account = result.device?.account ?? record.account;
              record.signedIn = Boolean(result.device?.signedIn);
              if (record.account && record.account === selfInfo.accountFingerprint) {
                state.pairs[peer.deviceId] = { ...state.pairs[peer.deviceId], deviceId: peer.deviceId, displayName: record.displayName };
              }
            } else {
              record.latencyMs = null;
              record.lastError = result?.error?.message ?? 'ping failed';
            }
          } catch (error) {
            const record = peers.get(peer.deviceId);
            if (record) {
              record.latencyMs = null;
              record.lastError = String(error?.message ?? error);
            }
          }
        })(),
      );
    }
    await Promise.allSettled(work);
    return statusPayload();
  }

  /* ---------------- external endpoints (SSH) ---------------- */

  function endpointView(ep) {
    return {
      endpointId: ep.id,
      name: ep.name,
      host: ep.host,
      port: Number(ep.port) || 22,
      user: ep.user,
      hasKey: Boolean(ep.keyPath),
      hasPassword: Boolean(ep.password),
      shared: Boolean(ep.shared),
      ownerDeviceId: ep.ownerDeviceId,
      ownerName: ep.ownerName,
      mine: ep.ownerDeviceId === state.deviceId,
      addedAt: ep.addedAt,
      lastProbe: ep.lastProbe ?? null,
      online: ep.lastProbe ? Boolean(ep.lastProbe.ok) : null,
      probeAt: ep.lastProbe?.at ?? null,
      probeError: ep.lastProbe?.error ?? '',
      caps: ep.caps ?? null,
      ssh: sshCommandString(ep),
    };
  }

  function listOwnedEndpoints() {
    return Object.values(state.endpoints ?? {})
      .filter((ep) => ep.ownerDeviceId === state.deviceId)
      .map((ep) => endpointView(ep));
  }

  function findEndpoint(endpointId) {
    const key = String(endpointId ?? '').trim();
    if (!key) return null;
    const owned = state.endpoints?.[key];
    if (owned) return { ...owned, mine: true };
    for (const [id, ep] of Object.entries(state.endpoints ?? {})) {
      if (ep.name === key && ep.ownerDeviceId === state.deviceId) return { ...ep, id, mine: true };
    }
    for (const peer of presenceSummary()) {
      for (const ep of peer.endpoints ?? []) {
        if (ep.endpointId === key || ep.name === key) {
          return { id: ep.endpointId, ...ep, ownerDeviceId: peer.deviceId, ownerName: peer.displayName, mine: false };
        }
      }
    }
    return null;
  }

  function sshTarget(ep) {
    return `${ep.user || process.env.USER || 'user'}@${ep.host}`;
  }

  function sshCommandString(ep) {
    const parts = ['ssh'];
    const port = Number(ep.port) || 22;
    if (port !== 22) parts.push('-p', String(port));
    if (ep.keyPath) parts.push('-i', ep.keyPath);
    parts.push(sshTarget(ep));
    return parts.join(' ');
  }

  function sshArgs(ep, command) {
    const args = [];
    const port = Number(ep.port) || 22;
    if (port !== 22) args.push('-p', String(port));
    if (ep.password) {
      // A stored password cannot work with BatchMode: let ssh ask the askpass helper once.
      args.push(
        '-o', 'BatchMode=no',
        '-o', 'PreferredAuthentications=password,keyboard-interactive',
        '-o', 'PubkeyAuthentication=no',
        '-o', 'NumberOfPasswordPrompts=1',
      );
    } else {
      args.push('-o', 'BatchMode=yes');
    }
    args.push('-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new');
    if (ep.keyPath && !ep.password) args.push('-i', ep.keyPath);
    args.push(sshTarget(ep), command);
    return args;
  }

  /* ssh only reads the password from a terminal or from an askpass program.
     The helper is written into the state directory and reads the secret from
     the child environment, so it never shows up in this process argv. */
  function ensureAskpass() {
    const windows = process.platform === 'win32';
    const helper = join(STATE_DIR, windows ? 'askpass.cmd' : 'askpass.sh');
    try {
      if (windows) writeFileSync(helper, '@echo off\r\necho %CM_SSH_PASSWORD%\r\n');
      else {
        writeFileSync(helper, '#!/bin/sh\nprintf \'%s\\n\' "$CM_SSH_PASSWORD"\n');
        chmodSync(helper, 0o700);
      }
      return helper;
    } catch {
      return null;
    }
  }

  async function sshExec(ep, command, { timeoutMs = 30_000 } = {}) {
    let env;
    if (ep.password) {
      const helper = ensureAskpass();
      if (helper) env = { SSH_ASKPASS: helper, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY || ':0', CM_SSH_PASSWORD: ep.password };
    }
    const result = await runCommand('ssh', sshArgs(ep, command), { timeoutMs, env });
    return { code: result.code, stdout: result.stdout.slice(-8000), stderr: result.stderr.slice(-4000) };
  }

  const ENDPOINT_PROBE = "echo CM_OS $(uname -srm 2>/dev/null); echo CM_CORES $(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null); echo CM_MEM $(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null); echo CM_DISK $(df -h / 2>/dev/null | tail -1); echo CM_GPU $(lspci 2>/dev/null | grep -iE 'vga|3d|display' | head -4 | cut -d: -f3- | paste -sd'|' -)";

  function parseProbe(stdout) {
    const line = (prefix) => stdout.split('\n').find((row) => row.startsWith(`${prefix} `))?.slice(prefix.length + 1).trim() ?? '';
    const memKb = Number(line('CM_MEM'));
    const diskFields = line('CM_DISK').split(/\s+/);
    if (!line('CM_OS') && !line('CM_CORES')) return null;
    return {
      osLabel: line('CM_OS').split(' ')[0] || '',
      kernel: line('CM_OS'),
      cores: Number(line('CM_CORES')) || null,
      memGb: Number.isFinite(memKb) && memKb > 0 ? Math.round((memKb / 1024 / 1024) * 10) / 10 : null,
      disk: line('CM_DISK'),
      diskAvail: diskFields.length >= 4 ? diskFields[3] : null,
      gpu: chooseGpu((line('CM_GPU') || '').split('|')) || (line('CM_GPU') || '').trim() || null,
    };
  }

  async function probeEndpoint(ep) {
    const startedAt = Date.now();
    const result = await sshExec(ep, ENDPOINT_PROBE, { timeoutMs: 20_000 });
    const ok = result.code === 0;
    const record = state.endpoints?.[ep.id];
    const probe = {
      at: Date.now(),
      ms: Date.now() - startedAt,
      ok,
      error: ok ? '' : result.stderr.trim().split('\n').slice(-1)[0]?.slice(0, 300) || `ssh exited with ${result.code}`,
      caps: ok ? parseProbe(result.stdout) : null,
    };
    if (record) {
      record.lastProbe = probe;
      if (probe.caps) record.caps = probe.caps;
      persist(state);
    }
    return probe;
  }

  function endpointPreamble(ep) {
    return [
      `你正在通过 SSH 操作远端设备「${ep.name}」（${sshTarget(ep)}，该设备没有安装 dsh）。`,
      `远端的所有操作都必须通过这条命令完成：${sshCommandString(ep)} '<远端命令>'`,
      '本机的当前目录是控制端的工作目录，不要假设远端存在同样的路径、工具或 shell 语法。',
      '需要读取文件内容、执行脚本或多步操作时，逐步通过 ssh 执行并检查退出码。',
      '完成后用中文简要汇报在远端做了什么、看到了什么。',
      '',
      '任务：',
    ].join('\n');
  }

  async function forwardRemoteSession(deviceId, action, params) {
    if (!deviceId) return { ok: false, error: { code: 'invalid-target', message: '缺少目标设备' } };
    try {
      const result = await signedPeerRequest(deviceId, action, params, { timeoutMs: 15_000 });
      return result.ok ? result : { ok: false, error: result.error ?? { code: 'session-failed', message: '远端会话操作失败' } };
    } catch (error) {
      return { ok: false, error: { code: 'session-failed', message: String(error?.message ?? error) } };
    }
  }

  const methods = {
    async status() {
      return statusPayload();
    },
    async refresh() {
      return refreshPresence();
    },
    async remoteWorkspaces() {
      return remoteWorkspaces();
    },
    async remoteSessionMessages(payload) {
      return forwardRemoteSession(String(payload?.deviceId ?? ''), 'session.messages', { sessionId: payload?.sessionId, maxMessages: payload?.maxMessages });
    },
    async remoteSessionCreate(payload) {
      return forwardRemoteSession(String(payload?.deviceId ?? ''), 'session.create', { cwd: payload?.cwd, workspaceId: payload?.workspaceId });
    },
    async remoteSessionPrompt(payload) {
      return forwardRemoteSession(String(payload?.deviceId ?? ''), 'session.prompt', { sessionId: payload?.sessionId, text: payload?.text, requestId: payload?.requestId });
    },
    async remoteSessionCancel(payload) {
      return forwardRemoteSession(String(payload?.deviceId ?? ''), 'session.cancel', { sessionId: payload?.sessionId });
    },
    async log(payload) {
      uiLog('client', payload ?? {});
      return { ok: true };
    },
    async rename(payload) {
      const next = String(payload?.displayName ?? '').trim();
      if (!next) return { ok: false, error: { code: 'invalid', message: '设备名不能为空' } };
      state.displayName = next.slice(0, 60);
      persist(state);
      announce('announce');
      return statusPayload();
    },
    async setTrust(payload) {
      const deviceId = String(payload?.deviceId ?? '');
      if (!peers.has(deviceId)) return { ok: false, error: { code: 'offline', message: '设备不在线' } };
      try {
        await pairWithPeer(deviceId, { allowControl: Boolean(payload?.allowControl), maxPermissionMode: payload?.maxPermissionMode });
        return statusPayload();
      } catch (error) {
        return { ok: false, error: { code: 'pair-failed', message: String(error?.message ?? error) } };
      }
    },
    async pair(payload) {
      const deviceId = String(payload?.deviceId ?? '');
      if (!peers.has(deviceId)) return { ok: false, error: { code: 'offline', message: '设备不在线' } };
      try {
        await pairWithPeer(deviceId, {});
        return statusPayload();
      } catch (error) {
        return { ok: false, error: { code: 'pair-failed', message: String(error?.message ?? error) } };
      }
    },
    async forget(payload) {
      const deviceId = String(payload?.deviceId ?? '');
      if (state.pairs[deviceId]) {
        delete state.pairs[deviceId];
        persist(state);
      }
      return statusPayload();
    },
    async dispatch(payload) {
      const target = String(payload?.deviceId ?? 'self');
      const prompt = String(payload?.prompt ?? '').trim();
      if (!prompt) return { ok: false, error: { code: 'empty', message: '请填写任务内容' } };
      const options = {
        cwd: typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : undefined,
        permissionMode: typeof payload?.permissionMode === 'string' ? payload.permissionMode : undefined,
        approvalPolicy: typeof payload?.approvalPolicy === 'string' ? payload.approvalPolicy : undefined,
      };
      if (payload?.endpointId) {
        return methods.endpointTask({ endpointId: payload.endpointId, prompt, waitMs: payload.waitMs, permissionMode: options.permissionMode, requestId: payload.requestId });
      }
      if (target === 'self' || target === state.deviceId) {
        const request = beginLocalRequest(payload, 'dispatch', { ...options, prompt });
        if (request.response) return request.response;
        try {
          const job = startJob({ ...options, prompt, origin: { deviceId: state.deviceId, displayName: state.displayName, kind: 'local' } });
          return request.finish({ ok: true, jobId: job.id, target: state.displayName, job: jobView(job) });
        } catch (error) {
          return request.finish({ ok: false, error: { code: 'dispatch-failed', message: String(error?.message ?? error) } });
        }
      }
      try {
        const result = await signedPeerRequest(target, 'dispatch', { ...options, prompt }, { requestId: payload.requestId });
        if (!result.ok) return { ok: false, error: result.error ?? { code: 'peer-error', message: '目标节点拒绝调度' } };
        return { ok: true, jobId: result.jobId, target: result.target ?? peers.get(target)?.displayName ?? target };
      } catch (error) {
        return { ok: false, error: { code: 'dispatch-failed', message: String(error?.message ?? error) } };
      }
    },
    async job(payload) {
      const target = String(payload?.jobDeviceId ?? payload?.deviceId ?? 'self');
      const jobId = String(payload?.jobId ?? '');
      if (!jobId) return { ok: false, error: { code: 'invalid', message: '缺少 jobId' } };
      if (target === 'self' || target === state.deviceId) {
        const job = jobs.get(jobId);
        if (job) return { ok: true, job: jobView(job) };
        const stored = state.jobs?.[jobId];
        if (stored) return { ok: true, job: { ...stored, events: [], stale: true } };
        return { ok: false, error: { code: 'missing', message: '任务不存在' } };
      }
      try {
        const result = await signedPeerRequest(target, 'job', { jobId });
        if (!result.ok) return { ok: false, error: result.error ?? { code: 'peer-error', message: '读取任务失败' } };
        return { ok: true, job: result.job };
      } catch (error) {
        return { ok: false, error: { code: 'job-failed', message: String(error?.message ?? error) } };
      }
    },
    async cancel(payload) {
      const target = String(payload?.deviceId ?? 'self');
      const jobId = String(payload?.jobId ?? '');
      if (target === 'self' || target === state.deviceId) {
        const job = jobs.get(jobId);
        if (job) cancelJob(job);
        return { ok: true };
      }
      try {
        const result = await signedPeerRequest(target, 'cancel', { jobId });
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      } catch (error) {
        return { ok: false, error: { code: 'cancel-failed', message: String(error?.message ?? error) } };
      }
    },
    async endpointList() {
      return { ok: true, endpoints: listOwnedEndpoints() };
    },
    async endpointSave(payload) {
      const input = payload?.endpoint ?? payload ?? {};
      const host = String(input.host ?? '').trim();
      if (!host || /\s/.test(host)) return { ok: false, error: { code: 'invalid-host', message: '请填写有效的主机名或 IP' } };
      const id = String(input.endpointId ?? payload?.endpointId ?? '').trim() || randomUUID();
      const existing = state.endpoints?.[id] ?? null;
      if (existing && existing.ownerDeviceId !== state.deviceId) return { ok: false, error: { code: 'not-owner', message: '该设备由其他节点注册' } };
      const record = {
        id,
        name: String(input.name ?? existing?.name ?? host).trim() || host,
        host,
        port: Number(input.port) || existing?.port || 22,
        user: String(input.user ?? existing?.user ?? process.env.USER ?? '').trim() || process.env.USER || 'user',
        keyPath: String(input.keyPath ?? existing?.keyPath ?? '').trim(),
        password: input.password === undefined ? (existing?.password ?? '') : String(input.password),
        shared: input.shared === undefined ? Boolean(existing?.shared) : Boolean(input.shared),
        ownerDeviceId: state.deviceId,
        ownerName: state.displayName,
        addedAt: existing?.addedAt ?? Date.now(),
        lastProbe: existing?.lastProbe ?? null,
        caps: existing?.caps ?? null,
      };
      state.endpoints = { ...(state.endpoints ?? {}), [id]: record };
      persist(state);
      announce('announce');
      return { ok: true, endpoint: endpointView(record), status: await statusPayload() };
    },
    async setEndpointShared(payload) {
      const id = String(payload?.endpointId ?? '').trim();
      const record = state.endpoints?.[id];
      if (!record) return { ok: false, error: { code: 'missing', message: '设备不存在' } };
      if (record.ownerDeviceId !== state.deviceId) return { ok: false, error: { code: 'not-owner', message: '该设备由其他节点注册' } };
      record.shared = payload?.shared === undefined ? !record.shared : Boolean(payload.shared);
      state.endpoints = { ...(state.endpoints ?? {}), [id]: record };
      persist(state);
      announce('announce');
      return { ok: true, endpoint: endpointView(record), status: await statusPayload() };
    },
    async endpointRemove(payload) {
      const id = String(payload?.endpointId ?? '');
      const record = state.endpoints?.[id];
      if (!record) return { ok: false, error: { code: 'missing', message: '设备不存在' } };
      if (record.ownerDeviceId !== state.deviceId) return { ok: false, error: { code: 'not-owner', message: '该设备由其他节点注册' } };
      delete state.endpoints[id];
      persist(state);
      announce('announce');
      return { ok: true, status: await statusPayload() };
    },
    async endpointTest(payload) {
      const ep = findEndpoint(payload?.endpointId);
      if (!ep) return { ok: false, error: { code: 'missing', message: '设备不存在' } };
      if (!ep.mine) {
        try {
          const result = await signedPeerRequest(ep.ownerDeviceId, 'endpoint.test', { endpointId: ep.id });
          return result.ok ? { ok: true, probe: result.probe } : { ok: false, error: result.error };
        } catch (error) {
          return { ok: false, error: { code: 'relay-failed', message: String(error?.message ?? error) } };
        }
      }
      const probe = await probeEndpoint(ep);
      return { ok: true, probe, endpoint: endpointView(state.endpoints[ep.id]) };
    },
    async endpointRun(payload) {
      const ep = findEndpoint(payload?.endpointId);
      if (!ep) return { ok: false, error: { code: 'missing', message: '设备不存在' } };
      const command = String(payload?.command ?? '').trim();
      if (!command) return { ok: false, error: { code: 'empty', message: '请填写要在远端执行的命令' } };
      if (!ep.mine) {
        try {
          const result = await signedPeerRequest(ep.ownerDeviceId, 'endpoint.run', { endpointId: ep.id, command }, { requestId: payload.requestId });
          return result.ok ? { ok: true, output: result.output } : { ok: false, error: result.error };
        } catch (error) {
          return { ok: false, error: { code: 'relay-failed', message: String(error?.message ?? error) } };
        }
      }
      const request = beginLocalRequest(payload, 'endpoint.run', { endpointId: ep.id, command });
      if (request.response) return request.response;
      try {
        const output = await sshExec(ep, command, { timeoutMs: SSH_COMMAND_TIMEOUT_MS });
        return request.finish({ ok: true, output });
      } catch (error) {
        return request.finish({ ok: false, error: { code: 'ssh-failed', message: String(error?.message ?? error) } });
      }
    },
    async endpointTask(payload) {
      const ep = findEndpoint(payload?.endpointId);
      if (!ep) return { ok: false, error: { code: 'missing', message: '设备不存在' } };
      const prompt = String(payload?.prompt ?? '').trim();
      if (!prompt) return { ok: false, error: { code: 'empty', message: '请填写任务内容' } };
      if (!ep.mine) {
        try {
          const result = await signedPeerRequest(ep.ownerDeviceId, 'endpoint.task', { endpointId: ep.id, prompt, permissionMode: payload?.permissionMode }, { requestId: payload.requestId });
          if (!result.ok) return { ok: false, error: result.error ?? { code: 'peer-error', message: '注册节点拒绝调度' } };
          return { ok: true, jobId: result.jobId, jobDeviceId: ep.ownerDeviceId, target: ep.name };
        } catch (error) {
          return { ok: false, error: { code: 'relay-failed', message: String(error?.message ?? error) } };
        }
      }
      const request = beginLocalRequest(payload, 'endpoint.task', { endpointId: ep.id, prompt, permissionMode: payload?.permissionMode });
      if (request.response) return request.response;
      try {
        const job = startJob({
          prompt: `${endpointPreamble(ep)}${prompt}`,
          permissionMode: payload?.permissionMode,
          origin: { deviceId: state.deviceId, displayName: state.displayName, kind: 'endpoint' },
          target: { deviceId: ep.id, displayName: ep.name, kind: 'endpoint' },
        });
        job.endpointId = ep.id;
        return request.finish({ ok: true, jobId: job.id, jobDeviceId: state.deviceId, target: ep.name, job: jobView(job) });
      } catch (error) {
        return request.finish({ ok: false, error: { code: 'dispatch-failed', message: String(error?.message ?? error) } });
      }
    },
    async setDiscoverable(payload) {
      const enabled = payload?.discoverable === undefined ? true : Boolean(payload.discoverable);
      state.settings.discoverable = enabled;
      persist(state);
      if (enabled) {
        if (!udpSocket) await startDiscovery();
        else announce('announce');
      } else {
        stopDiscovery();
        peers.clear();
      }
      log('info', enabled ? 'discovery enabled' : 'discovery disabled');
      return statusPayload();
    },
    async saveSettings(payload) {
      const next = payload?.settings ?? {};
      const ports = {};
      for (const key of ['port', 'discoveryPort']) {
        if (next[key] === undefined) continue;
        const value = Number(next[key]);
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          return { ok: false, error: { code: 'invalid-port', message: `${key} 必须是 1–65535 的整数端口` } };
        }
        ports[key] = value;
      }
      const previousPeerPort = Number(state.settings.port) || PEER_PORT;
      const previousDiscoveryPort = Number(state.settings.discoveryPort) || DISCOVERY_PORT;
      const restartDiscovery = ports.discoveryPort !== undefined && ports.discoveryPort !== previousDiscoveryPort && Boolean(udpSocket);
      if (restartDiscovery) stopDiscovery();
      for (const key of ['cliPath', 'dispatchCwd', 'permissionMode', 'approvalPolicy']) if (next[key] !== undefined) state.settings[key] = String(next[key]);
      if (next.useLoginOverlay !== undefined) state.settings.useLoginOverlay = Boolean(next.useLoginOverlay);
      if (next.jobTimeoutMs !== undefined) state.settings.jobTimeoutMs = Number(next.jobTimeoutMs) || state.settings.jobTimeoutMs;
      Object.assign(state.settings, ports);
      persist(state);
      const nextPeerPort = Number(state.settings.port) || PEER_PORT;
      if (nextPeerPort !== previousPeerPort) {
        try {
          peerServer?.close();
        } catch {
          /* ignore */
        }
        peerServer = null;
        peerPort = 0;
        await startPeerServer();
        if (!peerServer) return { ok: false, error: { code: 'port-bind-failed', message: `无法监听控制端口 ${nextPeerPort}` } };
        announce('announce');
      }
      if (restartDiscovery) await startDiscovery();
      return statusPayload();
    },
    async ssh(payload) {
      const deviceId = String(payload?.deviceId ?? 'self');
      const host = deviceId === 'self' ? localAddresses()[0] ?? '127.0.0.1' : peers.get(deviceId)?.address ?? '';
      const user = process.env.USER ?? process.env.LOGNAME ?? 'user';
      return { ok: true, command: `ssh ${user}@${host}`, host, user };
    },
  };

  async function invoke(method, payload) {
    const handler = methods[method];
    if (!handler) return { ok: false, error: { code: 'unknown-method', message: `unknown method ${method}` } };
    try {
      return await handler(payload ?? {});
    } catch (error) {
      return { ok: false, error: { code: 'internal', message: String(error?.message ?? error) } };
    }
  }

  /* ---------------- UI plane (loopback) ---------------- */

  function corsHeaders(req) {
    const origin = req.headers.origin;
    if (!origin || !isTrustedOrigin(origin)) return {};
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
      vary: 'origin',
    };
  }

  async function handleUiRequest(req, res) {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    const origin = req.headers.origin ?? '(none)';
    if (origin !== '(none)' && !isTrustedOrigin(origin)) {
      uiLog('origin-rejected', { origin, path });
      json(res, 403, { ok: false, error: { code: 'origin', message: 'Origin must be the local app or loopback' } }, cors);
      return;
    }
    if (req.method === 'GET' && (path === '/ui/ping' || path === '/ui/status')) {
      if (path === '/ui/ping') json(res, 200, { ok: true, service: 'claw-mesh', version: VERSION, deviceId: state.deviceId, displayName: state.displayName, peerPort, discoveryPort: state.settings.discoveryPort }, cors);
      else json(res, 200, await invoke('status', {}), cors);
      return;
    }
    if (req.method === 'POST' && path.startsWith('/ui/')) {
      const method = path.slice('/ui/'.length);
      let body;
      try {
        const raw = await readBody(req);
        body = raw ? JSON.parse(raw) : {};
      } catch {
        json(res, 400, { ok: false, error: { code: 'bad-json', message: 'body is not JSON' } }, cors);
        return;
      }
      const result = await invoke(method, body);
      if (result?.ok === false) uiLog('ui-error', { method, error: result.error });
      json(res, 200, result, cors);
      return;
    }
    json(res, 404, { ok: false, error: 'not found' }, cors);
  }

  async function startUiServer() {
    const server = createServer((req, res) => {
      handleUiRequest(req, res).catch((error) => {
        try {
          json(res, 500, { ok: false, error: { code: 'internal', message: String(error?.message ?? error) } }, corsHeaders(req));
        } catch {
          /* ignore */
        }
      });
    });
    const port = await bindInRange(server, Number(state.settings.uiPort) || UI_PORT, '127.0.0.1');
    if (!port) {
      log('error', 'unable to bind the UI plane');
      return;
    }
    uiServer = server;
    uiPort = port;
    log('info', `UI plane on 127.0.0.1:${port}`);
  }

  /* ---------------- agent tools ---------------- */

  function textBlocks(value) {
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
  }

  function registerTools() {
    const disposers = [];
    const safeRegister = (definition) => {
      try {
        disposers.push(ctx.tools.register(definition));
      } catch (error) {
        log('error', 'tool registration failed', { name: definition.name, message: String(error?.message ?? error) });
      }
    };
    safeRegister({
      name: 'mesh_list_devices',
      description:
        'List everything this Claw-Mesh node can reach: DSH devices on the LAN (dispatchable agents) and registered SSH endpoints (machines without dsh, driven by their owning node). Each DSH device reports deviceId, name, platform, LAN address, account match, pairing, control permission, and a capability scan (osLabel, arch, cores, memGb, gpu, tags). Each SSH endpoint reports endpointId, host, port, user, the owning node, its last probe (online true/false/null when never tested, probedAt, probeError) and a capability scan when known. Use this first, then pick a target by capability or use mesh_dispatch.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: { type: 'object', additionalProperties: true }, render: (args, value) => textBlocks(value) },
      async execute() {
        const data = await refreshPresence();
        const shape = (ep, extra) => ({
          endpointId: ep.endpointId,
          name: ep.name,
          host: ep.host,
          port: ep.port,
          user: ep.user,
          model: 'ssh',
          online: ep.online ?? (ep.lastProbe ? Boolean(ep.lastProbe.ok) : null),
          probedAt: ep.probeAt ?? null,
          probeError: ep.probeError || null,
          osLabel: ep.caps?.osLabel ?? null,
          caps: ep.caps ? { osLabel: ep.caps.osLabel, cores: ep.caps.cores, memGb: ep.caps.memGb, gpu: ep.caps.gpu ?? null } : null,
          ...extra,
        });
        const endpoints = [
          ...data.endpoints.map((ep) => shape(ep, { owner: 'self' })),
          ...data.peers.flatMap((peer) =>
            (peer.endpoints ?? []).map((ep) => shape(ep, { owner: peer.displayName, ownerDeviceId: peer.deviceId, online: ep.online ?? null })),
          ),
        ];
        return {
          ok: true,
          self: {
            deviceId: data.self.deviceId,
            displayName: data.self.displayName,
            controlPlane: data.self.controlPlane,
            cli: data.self.cli,
            capabilities: data.self.capabilities ?? null,
          },
          devices: data.peers.map((peer) => ({
            deviceId: peer.deviceId,
            name: peer.displayName,
            platform: peer.platform,
            address: `${peer.address}:${peer.port}`,
            sameAccount: peer.sameAccount,
            paired: peer.paired,
            canDispatch: peer.canControlPeer,
            latencyMs: peer.latencyMs,
            signedIn: peer.signedIn,
            capabilities: peer.capabilities ?? null,
            endpoints: (peer.endpoints ?? []).length,
            error: peer.lastError,
          })),
          endpoints,
          note: 'DSH 设备之间用 deviceId 调度；SSH 端点（model=ssh）没有 dsh，只能通过所属节点的 SSH 通道操作，用 endpointId 传给 mesh_dispatch。',
        };
      },
    });
    safeRegister({
      name: 'mesh_dispatch',
      description:
        'Run one agent task on a Claw-Mesh target: a DSH device (agent-to-agent delegation through `dsh --profile headless`), an SSH endpoint (the owning node drives that machine over ssh), or "self" (locally). Returns a jobId immediately; poll it with mesh_job_status, or pass waitMs (e.g. 120000) to block until it finishes. A DSH target must be paired and must have granted this device control permission. Leave target empty and pass requires to pick the most capable matching device automatically.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'DSH device id from mesh_list_devices, an SSH endpointId, or "self". Use mesh_list_devices to see what is reachable and what each device can do.' },
          prompt: { type: 'string', description: 'Natural-language task. On an SSH endpoint the owning node runs an agent that drives the remote machine through ssh.' },
          requestId: { type: 'string', minLength: 8, maxLength: 128, description: 'Optional idempotency key. Reusing it with identical parameters returns the original job instead of starting another one.' },
          cwd: { type: 'string', description: 'Optional working directory on the target.' },
          permissionMode: { type: 'string', enum: ['read-only', 'workspace-write', 'danger-full-access'] },
          requires: {
            type: 'object',
            description: 'Optional capability filter used when target is omitted: picks the most capable reachable device that matches.',
            properties: {
              os: { type: 'string', description: 'Substring of the OS label or platform, e.g. "linux", "macOS", "win32".' },
              gpu: { type: 'boolean', description: 'Require a detected GPU.' },
              minCores: { type: 'number' },
              minMemGb: { type: 'number' },
              tag: { type: 'string', description: 'Capability tag such as "docker".' },
            },
            additionalProperties: false,
          },
          waitMs: { type: 'number', description: 'Block up to this many milliseconds for completion (default 0).' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: (args, value) => textBlocks(value) },
      async execute(args) {
        const waitMs = Math.max(0, Math.min(Number(args?.waitMs ?? 0), 600_000));
        let target = String(args?.target ?? '');
        if (!target && args?.requires) {
          const data = await refreshPresence();
          const matches = (caps) => {
            if (!caps) return false;
            const req = args.requires;
            if (req.os && !`${caps.os ?? ''} ${caps.osLabel ?? ''}`.toLowerCase().includes(String(req.os).toLowerCase())) return false;
            if (req.gpu && !caps.gpu) return false;
            if (req.minCores && !(Number(caps.cores) >= Number(req.minCores))) return false;
            if (req.minMemGb && !(Number(caps.memGb) >= Number(req.minMemGb))) return false;
            if (req.tag && !(caps.tags ?? []).includes(String(req.tag))) return false;
            return true;
          };
          const candidates = data.peers
            .filter((peer) => peer.sameAccount && peer.canControlPeer && matches(peer.capabilities))
            .sort((a, b) => (Number(b.capabilities?.cores ?? 0) - Number(a.capabilities?.cores ?? 0)));
          if (!candidates.length) {
            return { ok: false, error: { code: 'no-match', message: '没有满足条件的可调度设备（需要对方已授权本机控制）' } };
          }
          target = candidates[0].deviceId;
        }
        const endpointHit = target && target !== 'self' ? findEndpoint(target) : null;
        const started = endpointHit
          ? await methods.endpointTask({ endpointId: endpointHit.id, prompt: args?.prompt, permissionMode: args?.permissionMode, requestId: args?.requestId })
          : await methods.dispatch({ deviceId: target, prompt: args?.prompt, cwd: args?.cwd, permissionMode: args?.permissionMode, requestId: args?.requestId });
        if (!started.ok) return started;
        const jobDeviceId = started.jobDeviceId ?? target;
        if (waitMs <= 0) return { ok: true, jobId: started.jobId, jobDeviceId, target: started.target, status: 'running' };
        const deadline = Date.now() + waitMs;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          const polled = await methods.job({ jobDeviceId, jobId: started.jobId });
          if (!polled.ok) return polled;
          if (polled.job.status !== 'running') {
            return { ok: true, jobId: started.jobId, jobDeviceId, target: started.target, status: polled.job.status, finalText: polled.job.finalText, exitCode: polled.job.exitCode, events: (polled.job.events ?? []).slice(-20).map((event) => ({ type: event.type, text: event.text })) };
          }
        }
        return { ok: true, jobId: started.jobId, jobDeviceId, target: started.target, status: 'running', note: '仍在执行，请用 mesh_job_status 继续轮询' };
      },
    });
    safeRegister({
      name: 'mesh_job_status',
      description: 'Read the status, recent events, and final answer of a mesh_dispatch job.',
      parameters: { type: 'object', properties: { target: { type: 'string', description: 'Device id that runs the job (mesh_dispatch returns jobDeviceId).' }, jobDeviceId: { type: 'string' }, jobId: { type: 'string' } }, required: ['jobId'], additionalProperties: false },
      output: { schema: { type: 'object', additionalProperties: true }, render: (args, value) => textBlocks(value) },
      async execute(args) {
        const polled = await methods.job({ jobDeviceId: args?.jobDeviceId ?? args?.target ?? 'self', jobId: args?.jobId });
        if (!polled.ok) return polled;
        const job = polled.job;
        return {
          ok: true,
          jobId: job.id,
          status: job.status,
          exitCode: job.exitCode,
          finalText: job.finalText,
          events: (job.events ?? []).slice(-25).map((event) => ({ type: event.type, text: event.text })),
        };
      },
    });
    safeRegister({
      name: 'mesh_ssh_run',
      description:
        'Run one shell command on a registered SSH endpoint (a machine without dsh). The owning node executes it through ssh and returns exit code, stdout and stderr. This is the primitive for inspecting or operating such a device; for multi-step work prefer mesh_dispatch with the endpointId so an agent can iterate.',
      parameters: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'endpointId or endpoint name from mesh_list_devices.' },
          command: { type: 'string', description: 'Shell command to run on the remote host.' },
          requestId: { type: 'string', minLength: 8, maxLength: 128, description: 'Optional idempotency key. Identical retries return the cached command result.' },
        },
        required: ['endpoint', 'command'],
        additionalProperties: false,
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: (args, value) => textBlocks(value) },
      async execute(args) {
        const ep = findEndpoint(args?.endpoint);
        if (!ep) return { ok: false, error: { code: 'missing', message: '找不到该 SSH 端点，先用 mesh_list_devices 查看' } };
        return methods.endpointRun({ endpointId: ep.id, command: args?.command, requestId: args?.requestId });
      },
    });
    safeRegister({
      name: 'mesh_add_endpoint',
      description:
        'Register an SSH endpoint on this node: a machine that cannot run dsh (for example a Linux server). The node that registers it is the only one that opens the SSH connection, and other nodes operate it by asking the owner. Authentication is a key (pass keyPath when it is not the default identity) or a password (pass password; it stays in this node state file and is never broadcast). Verify the connection with mesh_ssh_run afterwards.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name, e.g. "GPU 服务器".' },
          host: { type: 'string', description: 'Hostname or IP on the LAN.' },
          user: { type: 'string', description: 'SSH user (defaults to the local user).' },
          port: { type: 'number', description: 'SSH port, default 22.' },
          keyPath: { type: 'string', description: 'Private key path when not using the default identity.' },
          password: { type: 'string', description: 'SSH password for password-authenticated hosts. Stored in this node state file and never shared with other nodes; prefer keys when possible.' },
          shared: { type: 'boolean', description: 'Share this endpoint with other paired devices that have control permission. Defaults to false: only this node can use it.' },
        },
        required: ['host'],
        additionalProperties: false,
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: (args, value) => textBlocks(value) },
      async execute(args) {
        const saved = await methods.endpointSave({ name: args?.name, host: args?.host, user: args?.user, port: args?.port, keyPath: args?.keyPath, password: args?.password, shared: args?.shared });
        if (!saved.ok) return saved;
        const probed = await methods.endpointTest({ endpointId: saved.endpoint.endpointId });
        return { ok: true, endpoint: saved.endpoint, probe: probed.probe ?? null };
      },
    });
    return () => disposers.forEach((fn) => fn?.());
  }

  /* ---------------- endpoint health + prompt ---------------- */

  async function keepsakeProbeEndpoints() {
    const owned = Object.values(state.endpoints ?? {}).filter((ep) => ep.ownerDeviceId === state.deviceId);
    for (const ep of owned) {
      if (Date.now() - (ep.lastProbe?.at ?? 0) < ENDPOINT_PROBE_EVERY_MS - 15_000) continue;
      try {
        await probeEndpoint(ep);
      } catch {
        /* keep the previous probe */
      }
    }
  }

  function meshPromptText() {
    const reachable = [...peers.values()].filter((peer) => peer.sameAccount);
    const ready = reachable.filter((peer) => state.pairs?.[peer.deviceId]?.canControlPeer);
    const endpoints = listOwnedEndpoints();
    const names =
      reachable
        .slice(0, 8)
        .map((peer) => {
          const caps = peer.caps;
          const bits = [caps?.osLabel ?? peer.platform];
          if (caps?.cores) bits.push(`${caps.cores} 核`);
          if (caps?.gpu) bits.push(caps.gpu);
          return `${peer.displayName}（${bits.filter(Boolean).join('，')}）`;
        })
        .join('、') || '暂无';
    return [
      '# Claw-Mesh 局域网设备',
      `本机「${state.displayName}」已加入 Claw-Mesh 设备网：同账号在线设备 ${reachable.length} 台（${names}），其中已授权本机调度的 ${ready.length} 台；本机注册的 SSH 设备 ${endpoints.length} 台。`,
      '用户说到「设备」「另一台机器」「那边」「服务器」或让你在别的电脑上干活时：',
      '1. 先用 mesh_list_devices 查看实时清单（在线状态、能否调度、硬件画像）。',
      '2. 用 mesh_dispatch 派任务，target 传 deviceId 或 endpointId（省略 target 时可用 requires 按能力挑一台），需要结果就带 waitMs，或事后用 mesh_job_status 查。',
      '3. 只想在 SSH 设备上跑一条命令时用 mesh_ssh_run，不必启动 Agent。',
      '派任务本身不需要再征求用户同意，但对方必须已授权（canControlPeer=true）；若被拒绝，提示用户在那台设备上打开「允许该设备控制本机」。不要编造设备或任务结果，一律以工具返回为准。',
    ].join('\n');
  }

  /* ---------------- lifecycle ---------------- */

  ctx.effect(() => {
    const dispose = registerTools();
    return () => dispose?.();
  });

  ctx.effect(() => {
    const dispose = ctx.systemPrompt.section({ name: 'claw-mesh', order: 900, text: () => meshPromptText() });
    return () => dispose?.();
  });

  ctx.effect(() => {
    let cancelled = false;
    (async () => {
      await refreshAccount(true);
      if (cancelled) return;
      await startPeerServer();
      if (cancelled) return;
      await startUiServer();
      if (cancelled) return;
      await collectCapabilities().catch(() => null);
      if (cancelled) return;
      if (state.settings.discoverable !== false) await startDiscovery();
      probeTimer = setInterval(() => { void keepsakeProbeEndpoints(); }, ENDPOINT_PROBE_EVERY_MS);
      setTimeout(() => { void keepsakeProbeEndpoints(); }, 6_000);
      uiLog('plugin-ready', { deviceId: shortId(state.deviceId), peerPort, uiPort, account: selfInfo.accountFingerprint, cli: cliDescription() });
      log('info', 'mesh ready', { deviceId: shortId(state.deviceId), peerPort, uiPort, account: selfInfo.accountFingerprint });
    })().catch((error) => log('error', 'startup failed', { message: String(error?.message ?? error) }));
    return () => {
      cancelled = true;
      if (probeTimer) clearInterval(probeTimer);
      probeTimer = null;
      stopDiscovery();
      for (const server of [peerServer, uiServer]) {
        try {
          server?.close();
        } catch {
          /* ignore */
        }
      }
      for (const job of jobs.values()) cancelJob(job);
      persist(state);
    };
  });
}
