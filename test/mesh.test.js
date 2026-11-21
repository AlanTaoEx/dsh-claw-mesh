import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(root, 'tools', 'second-node.mjs');
const fakeDsh = join(root, 'test', 'fixtures', 'fake-dsh.mjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freeTcpPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function freeUdpPort() {
  const socket = createSocket('udp4');
  socket.bind(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  socket.close();
  await once(socket, 'close');
  return port;
}

async function call(node, method, payload = {}) {
  const response = await fetch(`${node.ui}/ui/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, `${method}: ${JSON.stringify(body)}`);
  return body;
}

async function waitFor(check, { timeoutMs = 15_000, intervalMs = 200, description = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function startNode(temp, name, ports, { account = 'claw-mesh-test-account' } = {}) {
  const stateDir = join(temp, name);
  const child = spawn(process.execPath, [runner], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_MESH_STATE_DIR: stateDir,
      DSH_MESH_PORT: String(ports.peer),
      DSH_MESH_UI_PORT: String(ports.ui),
      DSH_MESH_DISCOVERY_PORT: String(ports.discovery),
      DSH_MESH_FAKE_ACCOUNT: account,
      DSH_MESH_FAKE_WORKSPACES: ports.fakeWorkspaces ? '1' : '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const node = {
    name,
    child,
    stateDir,
    ui: `http://127.0.0.1:${ports.ui}`,
    output: '',
  };
  const capture = (chunk) => {
    node.output = `${node.output}${chunk}`.slice(-12_000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  try {
    await waitFor(async () => {
      const response = await fetch(`${node.ui}/ui/ping`, { signal: AbortSignal.timeout(500) });
      return response.ok;
    }, { description: `${name} UI startup` });
    const status = await call(node, 'status');
    node.deviceId = status.self.deviceId;
    return node;
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`${error.message}\n${node.output}`);
  }
}

let embeddedSequence = 0;

async function startEmbeddedNode(temp, name, ports) {
  const stateDir = join(temp, name);
  const previousStateDir = process.env.DSH_MESH_STATE_DIR;
  const moduleUrl = new URL('../index.js', import.meta.url);
  embeddedSequence += 1;
  moduleUrl.searchParams.set('testInstance', `${name}-${embeddedSequence}`);
  const tools = new Map();
  const sections = [];
  const disposers = [];
  const ctx = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
        return () => tools.delete(definition.name);
      },
    },
    systemPrompt: {
      section(definition) {
        sections.push(definition);
        return () => {};
      },
    },
    effect(fn) {
      const dispose = fn();
      disposers.push(dispose);
      return dispose;
    },
    get(service) {
      if (service !== 'deepseekAccount') return undefined;
      return {
        getState: async () => ({ status: 'signed-out' }),
        getDeviceIdentity: async () => ({}),
        getProfile: async () => null,
      };
    },
  };
  try {
    process.env.DSH_MESH_STATE_DIR = stateDir;
    const { apply } = await import(moduleUrl.href);
    apply(ctx, {
      port: ports.peer,
      uiPort: ports.ui,
      discoveryPort: ports.discovery,
      discoverable: ports.discoverable !== false,
    });
  } finally {
    if (previousStateDir === undefined) delete process.env.DSH_MESH_STATE_DIR;
    else process.env.DSH_MESH_STATE_DIR = previousStateDir;
  }
  const node = {
    name,
    stateDir,
    ui: `http://127.0.0.1:${ports.ui}`,
    tools,
    sections,
    disposers,
  };
  await waitFor(async () => {
    const response = await fetch(`${node.ui}/ui/ping`, { signal: AbortSignal.timeout(500) });
    return response.ok;
  }, { description: `${name} embedded UI startup` });
  const status = await call(node, 'status');
  node.deviceId = status.self.deviceId;
  node.peer = `http://127.0.0.1:${status.self.controlPlane.split(':').at(-1)}`;
  return node;
}

async function stopEmbeddedNode(node) {
  if (!node) return;
  for (const dispose of [...node.disposers].reverse()) {
    try {
      dispose?.();
    } catch {
      // Cleanup must continue so one failed disposer cannot leak the other servers.
    }
  }
  await sleep(25);
}

async function controlRequest(target, source, pairKey, payload, options = {}) {
  const raw = options.raw ?? JSON.stringify(payload);
  const ts = options.ts ?? String(Date.now());
  const sig = options.sig ?? createHmac('sha256', pairKey).update(`${source.deviceId}\n${ts}\n${raw}`).digest('hex');
  const response = await fetch(`${target.peer}/mesh/control`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mesh-device': source.deviceId,
      'x-mesh-ts': ts,
      'x-mesh-sig': sig,
    },
    body: raw,
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, body: await response.json(), raw, ts, sig };
}

function installFakeSsh(temp) {
  const executable = join(temp, 'ssh');
  const fixture = join(root, 'test', 'fixtures', 'fake-ssh.mjs');
  writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`, { mode: 0o700 });
  chmodSync(executable, 0o700);
  return temp;
}

async function stopNode(node) {
  if (!node || node.child.exitCode !== null || node.child.signalCode) return;
  const exited = once(node.child, 'exit');
  node.child.kill('SIGTERM');
  const stopped = await Promise.race([exited.then(() => true), sleep(1_000).then(() => false)]);
  if (!stopped) {
    node.child.kill('SIGKILL');
    await exited;
  }
}

async function waitForPeer(node, peerId) {
  return waitFor(async () => {
    await call(node, 'refresh');
    const status = await call(node, 'status');
    return status.peers.find((peer) => peer.deviceId === peerId);
  }, { description: `${node.name} to discover ${peerId}` });
}

async function waitForJob(node, jobDeviceId, jobId, predicate) {
  return waitFor(async () => {
    const result = await call(node, 'job', { jobDeviceId, jobId });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return predicate(result.job) ? result.job : null;
  }, { description: `job ${jobId}` });
}

test('two Harness nodes share, authorize, dispatch and terminate jobs safely', { timeout: 60_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'claw-mesh-test-'));
  const nodes = [];
  try {
    const discovery = await freeUdpPort();
    const [peerA, peerB, uiA, uiB] = await Promise.all([freeTcpPort(), freeTcpPort(), freeTcpPort(), freeTcpPort()]);
    const [a, b] = await Promise.all([
      startNode(temp, 'a', { peer: peerA, ui: uiA, discovery }),
      startNode(temp, 'b', { peer: peerB, ui: uiB, discovery }),
    ]);
    nodes.push(a, b);

    await Promise.all([waitForPeer(a, b.deviceId), waitForPeer(b, a.deviceId)]);

    for (const node of nodes) {
      const saved = await call(node, 'saveSettings', {
        settings: { cliPath: fakeDsh, dispatchCwd: temp, useLoginOverlay: false },
      });
      assert.equal(saved.ok, true);
    }

    const denied = await call(b, 'dispatch', { deviceId: a.deviceId, prompt: 'before-pair' });
    assert.equal(denied.ok, false);

    const trusted = await call(a, 'setTrust', { deviceId: b.deviceId, allowControl: true });
    assert.equal(trusted.ok, true);
    const bView = await waitFor(async () => {
      const status = await call(b, 'status');
      const peer = status.peers.find((item) => item.deviceId === a.deviceId);
      return peer?.canControlPeer ? peer : null;
    }, { description: 'reverse control permission' });
    assert.equal(bView.canControlPeer, true);

    const privateEndpoint = await call(b, 'endpointSave', {
      endpoint: { name: 'private-endpoint', host: '127.0.0.1', user: 'tester', shared: false },
    });
    assert.equal(privateEndpoint.ok, true);
    const endpointId = privateEndpoint.endpoint.endpointId;
    await sleep(1_000);
    await call(a, 'refresh');
    const privateStatus = await call(a, 'status');
    const bOnA = privateStatus.peers.find((peer) => peer.deviceId === b.deviceId);
    assert.equal((bOnA.endpoints ?? []).some((ep) => ep.endpointId === endpointId), false);

    const shared = await call(b, 'setEndpointShared', { endpointId, shared: true });
    assert.equal(shared.ok, true);
    await waitFor(async () => {
      await call(a, 'refresh');
      const status = await call(a, 'status');
      const peer = status.peers.find((item) => item.deviceId === b.deviceId);
      return (peer?.endpoints ?? []).find((ep) => ep.endpointId === endpointId);
    }, { description: 'shared endpoint announcement' });

    const endpointJob = await call(b, 'endpointTask', { endpointId, prompt: 'endpoint-target' });
    assert.equal(endpointJob.ok, true);
    assert.equal(endpointJob.job.target.deviceId, endpointId);
    assert.equal(endpointJob.job.target.displayName, 'private-endpoint');
    const completedEndpointJob = await waitForJob(b, b.deviceId, endpointJob.jobId, (job) => job.status === 'completed');
    assert.equal(completedEndpointJob.target.deviceId, endpointId);

    const remote = await call(b, 'dispatch', { deviceId: a.deviceId, prompt: 'remote-task' });
    assert.equal(remote.ok, true);
    const remoteJob = await waitForJob(b, a.deviceId, remote.jobId, (job) => job.status === 'completed');
    assert.match(remoteJob.finalText, /^done:remote-task/);
    assert.ok(remoteJob.finalText.length > 2_500, 'final answer must not use the truncated event preview');

    const overlong = await call(b, 'dispatch', { deviceId: a.deviceId, prompt: 'MODE_OVERLONG_LINE' });
    assert.equal(overlong.ok, true);
    const overlongJob = await waitForJob(b, a.deviceId, overlong.jobId, (job) => job.status === 'completed');
    assert.equal(overlongJob.finalText, 'after-overlong-line');
    assert.ok(overlongJob.events.some((event) => event.type === 'output-truncated'));

    const timeoutSetting = await call(a, 'saveSettings', { settings: { jobTimeoutMs: 150 } });
    assert.equal(timeoutSetting.ok, true);
    const timed = await call(b, 'dispatch', { deviceId: a.deviceId, prompt: 'MODE_TIMEOUT' });
    assert.equal(timed.ok, true);
    await waitForJob(b, a.deviceId, timed.jobId, (job) => job.status === 'timed_out');
    const killed = await waitForJob(b, a.deviceId, timed.jobId, (job) => job.signal === 'SIGKILL');
    assert.equal(killed.status, 'timed_out');

    if (process.platform !== 'win32') {
      assert.equal(statSync(a.stateDir).mode & 0o777, 0o700);
      assert.equal(statSync(join(a.stateDir, 'state.json')).mode & 0o777, 0o600);
    }
    assert.equal(readdirSync(a.stateDir).some((name) => name.endsWith('.tmp')), false);
  } finally {
    await Promise.all(nodes.map((node) => stopNode(node)));
    rmSync(temp, { recursive: true, force: true });
  }
});

test('devices from another account stay invisible', { timeout: 60_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'claw-mesh-account-test-'));
  const nodes = [];
  try {
    const discovery = await freeUdpPort();
    const [peerA, peerB, uiA, uiB] = await Promise.all([freeTcpPort(), freeTcpPort(), freeTcpPort(), freeTcpPort()]);
    const [a, b] = await Promise.all([
      startNode(temp, 'a', { peer: peerA, ui: uiA, discovery }, { account: 'claw-mesh-account-a' }),
      startNode(temp, 'b', { peer: peerB, ui: uiB, discovery }, { account: 'claw-mesh-account-b' }),
    ]);
    nodes.push(a, b);

    // Several announce cycles: neither node may record the other.
    await sleep(6_000);
    const [statusA, statusB] = await Promise.all([call(a, 'status'), call(b, 'status')]);
    assert.equal(statusA.peers.length, 0);
    assert.equal(statusB.peers.length, 0);
    assert.equal(statusA.endpoints.length, 0);
    assert.equal(statusB.endpoints.length, 0);

    const devices = await call(a, 'status');
    assert.equal(devices.self.signedIn, true);
  } finally {
    for (const node of nodes) node.child.kill('SIGKILL');
    rmSync(temp, { recursive: true, force: true });
  }
});

test('control protocol enforces permission ceilings, idempotency and replay protection', { timeout: 60_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'claw-mesh-protocol-test-'));
  const nodes = [];
  const childNodes = [];
  const previousFakeAccount = process.env.DSH_MESH_FAKE_ACCOUNT;
  process.env.DSH_MESH_FAKE_ACCOUNT = 'claw-mesh-test-account';
  try {
    const discovery = await freeUdpPort();
    const [peerA, peerB, uiA, uiB] = await Promise.all([freeTcpPort(), freeTcpPort(), freeTcpPort(), freeTcpPort()]);
    const a = await startNode(temp, 'protocol-a', { peer: peerA, ui: uiA, discovery, fakeWorkspaces: true });
    const b = await startEmbeddedNode(temp, 'protocol-b', { peer: peerB, ui: uiB, discovery });
    childNodes.push(a);
    nodes.push(b);
    await Promise.all([waitForPeer(a, b.deviceId), waitForPeer(b, a.deviceId)]);
    for (const node of [a, b]) {
      const saved = await call(node, 'saveSettings', {
        settings: { cliPath: fakeDsh, dispatchCwd: temp, useLoginOverlay: false },
      });
      assert.equal(saved.ok, true);
    }

    const trusted = await call(a, 'setTrust', {
      deviceId: b.deviceId,
      allowControl: true,
      maxPermissionMode: 'read-only',
    });
    assert.equal(trusted.ok, true);
    assert.equal(trusted.peers.find((peer) => peer.deviceId === b.deviceId).maxPermissionMode, 'read-only');
    const reverseTrusted = await call(b, 'setTrust', { deviceId: a.deviceId, allowControl: true, maxPermissionMode: 'workspace-write' });
    assert.equal(reverseTrusted.ok, true);

    const syncedWorkspaces = await call(b, 'remoteWorkspaces');
    assert.equal(syncedWorkspaces.ok, true);
    const remoteDevice = syncedWorkspaces.devices.find((device) => device.deviceId === a.deviceId);
    assert.equal(remoteDevice.online, true);
    assert.equal(remoteDevice.workspaces[0].title, 'Demo Workspace');
    assert.equal(remoteDevice.workspaces[0].path, '/tmp/demo-workspace');
    assert.equal(remoteDevice.workspaces[0].sessions[0].title, 'Demo Session');
    assert.equal(remoteDevice.ungroupedSessions[0].title, 'Ungrouped Session');
    assert.equal(remoteDevice.ungroupedSessions[0].running, true);

    const history = await call(b, 'remoteSessionMessages', { deviceId: a.deviceId, sessionId: 'session-demo' });
    assert.equal(history.ok, true);
    assert.equal(history.messages[0].role, 'user');
    assert.equal(history.messages[0].text, 'Hello remote agent');
    assert.equal(history.messages[1].role, 'assistant');
    assert.equal(history.messages[1].text, 'Hello from remote agent');
    const prompted = await call(b, 'remoteSessionPrompt', { deviceId: a.deviceId, sessionId: 'session-demo', text: 'Continue remotely', requestId: 'prompt-remote-0001' });
    assert.equal(prompted.ok, true);
    assert.equal(prompted.accepted, true);
    const afterPrompt = await call(b, 'remoteSessionMessages', { deviceId: a.deviceId, sessionId: 'session-demo' });
    assert.equal(afterPrompt.messages.at(-1).text, 'Remote reply: Continue remotely');
    const createdSession = await call(b, 'remoteSessionCreate', { deviceId: a.deviceId, cwd: '/tmp/demo-workspace', workspaceId: 'workspace-demo' });
    assert.equal(createdSession.ok, true);
    assert.equal(createdSession.sessionId, 'session-new');
    const cancelledSession = await call(b, 'remoteSessionCancel', { deviceId: a.deviceId, sessionId: 'session-demo' });
    assert.equal(cancelledSession.ok, true);
    assert.equal(cancelledSession.accepted, true);

    const remoteRequest = {
      deviceId: a.deviceId,
      prompt: 'remote-idempotent',
      requestId: 'remote-job-0001',
      approvalPolicy: 'on-request',
    };
    const remote = await call(b, 'dispatch', remoteRequest);
    assert.equal(remote.ok, true);
    const duplicate = await call(b, 'dispatch', remoteRequest);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.jobId, remote.jobId, 'identical retries must reuse the original remote job');
    const remoteJob = await waitForJob(b, a.deviceId, remote.jobId, (job) => job.status === 'completed');
    assert.equal(remoteJob.permissionMode, 'read-only', 'an omitted permission inherits the remote ceiling');
    assert.equal(remoteJob.approvalPolicy, 'never', 'remote callers cannot override the local approval policy');

    const conflict = await call(b, 'dispatch', { ...remoteRequest, prompt: 'different-content' });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.error.code, 'request-id-conflict');
    const exceeded = await call(b, 'dispatch', {
      deviceId: a.deviceId,
      prompt: 'too-powerful',
      permissionMode: 'workspace-write',
      requestId: 'remote-job-0002',
    });
    assert.equal(exceeded.ok, false);
    assert.equal(exceeded.error.code, 'permission-exceeded');
    const invalidPermission = await call(b, 'dispatch', {
      deviceId: a.deviceId,
      prompt: 'invalid-permission',
      permissionMode: 'root',
      requestId: 'remote-job-0003',
    });
    assert.equal(invalidPermission.ok, false);
    assert.equal(invalidPermission.error.code, 'invalid-permission');

    const localRequest = { deviceId: 'self', prompt: 'local-idempotent', requestId: 'local-job-0001' };
    const local = await call(b, 'dispatch', localRequest);
    assert.equal(local.ok, true);
    const localDuplicate = await call(b, 'dispatch', localRequest);
    assert.equal(localDuplicate.jobId, local.jobId, 'local retries must also be idempotent');
    const localConflict = await call(b, 'dispatch', { ...localRequest, prompt: 'changed-local-content' });
    assert.equal(localConflict.error.code, 'request-id-conflict');
    const badLocalId = await call(b, 'dispatch', { deviceId: 'self', prompt: 'bad-id', requestId: 'bad' });
    assert.equal(badLocalId.error.code, 'bad-request-id');

    const pairKey = JSON.parse(readFileSync(join(b.stateDir, 'state.json'), 'utf8')).pairs[a.deviceId].pairKey;
    assert.equal(typeof pairKey, 'string');
    const ping = { v: 1, requestId: 'replay-ping-0001', action: 'ping', params: {} };
    const replayOptions = { ts: String(Date.now()) };
    const firstPing = await controlRequest(b, a, pairKey, ping, replayOptions);
    assert.equal(firstPing.status, 200);
    assert.equal(firstPing.body.ok, true);
    assert.deepEqual(firstPing.body.result.device.protocols, [1]);
    const replay = await controlRequest(b, a, pairKey, ping, replayOptions);
    assert.equal(replay.status, 409);
    assert.equal(replay.body.error.code, 'replayed-request');

    const stale = await controlRequest(b, a, pairKey, { ...ping, requestId: 'stale-ping-0001' }, { ts: String(Date.now() - 121_000) });
    assert.equal(stale.status, 403);
    assert.equal(stale.body.error.code, 'stale');
    const invalidTimestamp = await controlRequest(b, a, pairKey, { ...ping, requestId: 'invalid-time-001' }, { ts: 'not-a-time' });
    assert.equal(invalidTimestamp.status, 403);
    assert.equal(invalidTimestamp.body.error.code, 'stale');
    const badSignature = await controlRequest(b, a, pairKey, { ...ping, requestId: 'bad-signature-001' }, { sig: '0'.repeat(64) });
    assert.equal(badSignature.status, 403);
    assert.equal(badSignature.body.error.code, 'bad-signature');
    const unsupported = await controlRequest(b, a, pairKey, { ...ping, v: 2, requestId: 'version-two-0001' });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.error.code, 'unsupported-version');
    const badRequestId = await controlRequest(b, a, pairKey, { ...ping, requestId: 'x' });
    assert.equal(badRequestId.status, 400);
    assert.equal(badRequestId.body.error.code, 'bad-request-id');
    const badParams = await controlRequest(b, a, pairKey, { ...ping, requestId: 'array-params-001', params: [] });
    assert.equal(badParams.status, 400);
    assert.equal(badParams.body.error.code, 'bad-request');
    const badJson = await controlRequest(b, a, pairKey, null, { raw: '{' });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.body.error.code, 'bad-request');
    const emptyPrompt = await controlRequest(b, a, pairKey, {
      v: 1,
      requestId: 'empty-remote-001',
      action: 'dispatch',
      params: { prompt: '   ' },
    });
    assert.equal(emptyPrompt.status, 400);
    assert.equal(emptyPrompt.body.error.code, 'empty-prompt');
    const unpaired = await controlRequest(b, { deviceId: 'unpaired-source' }, 'unused', ping);
    assert.equal(unpaired.status, 403);
    assert.equal(unpaired.body.error.code, 'not-paired');

    const capabilities = await controlRequest(b, a, pairKey, { v: 1, requestId: 'allowed-caps-0001', action: 'capabilities', params: {} });
    assert.equal(capabilities.status, 200);
    assert.equal(capabilities.body.result.device.deviceId, b.deviceId);
    const legacyPing = await controlRequest(b, a, pairKey, { action: 'ping', params: {} });
    assert.equal(legacyPing.status, 200);
    assert.equal(legacyPing.body.ok, true);
    assert.equal('v' in legacyPing.body, false, 'legacy callers retain the legacy response shape');
    const legacyReplay = await controlRequest(b, a, pairKey, { action: 'ping', params: {} }, { ts: legacyPing.ts, sig: legacyPing.sig });
    assert.equal(legacyReplay.status, 409);
    assert.equal(legacyReplay.body.error.code, 'replayed-request');
    const directInvalidPermission = await controlRequest(b, a, pairKey, {
      v: 1,
      requestId: 'direct-invalid-001',
      action: 'dispatch',
      params: { prompt: 'direct-invalid', permissionMode: 'root' },
    });
    assert.equal(directInvalidPermission.status, 400);
    assert.equal(directInvalidPermission.body.error.code, 'invalid-permission');
    const directExceeded = await controlRequest(b, a, pairKey, {
      v: 1,
      requestId: 'direct-exceeded-001',
      action: 'dispatch',
      params: { prompt: 'direct-exceeded', permissionMode: 'danger-full-access' },
    });
    assert.equal(directExceeded.status, 403);
    assert.equal(directExceeded.body.error.code, 'permission-exceeded');
    const directDispatch = await controlRequest(b, a, pairKey, {
      v: 1,
      requestId: 'direct-dispatch-001',
      action: 'dispatch',
      params: { prompt: 'direct-remote-task', permissionMode: 'read-only' },
    });
    assert.equal(directDispatch.status, 200);
    assert.equal(directDispatch.body.ok, true);
    const directJobId = directDispatch.body.result.jobId;
    const directJob = await waitFor(async () => {
      const polled = await controlRequest(b, a, pairKey, {
        v: 1,
        requestId: 'direct-job-poll-001',
        action: 'job',
        params: { jobId: directJobId, includeEvents: false },
      });
      return polled.body.result?.job?.status === 'completed' ? polled.body.result.job : null;
    }, { description: 'direct protocol job completion' });
    assert.equal(directJob.permissionMode, 'read-only');
    assert.deepEqual(directJob.events, []);
    assert.match(directJob.finalText, /^done:direct-remote-task/);
    const missingJob = await controlRequest(b, a, pairKey, { v: 1, requestId: 'missing-job-0001', action: 'job', params: { jobId: 'missing' } });
    assert.equal(missingJob.status, 404);
    assert.equal(missingJob.body.error.code, 'no-job');
    const emptyEndpoints = await controlRequest(b, a, pairKey, { v: 1, requestId: 'endpoint-list-001', action: 'endpoint.list', params: {} });
    assert.deepEqual(emptyEndpoints.body.result.endpoints, []);

    const cancellable = await controlRequest(b, a, pairKey, {
      v: 1,
      requestId: 'direct-cancel-job-001',
      action: 'dispatch',
      params: { prompt: 'MODE_TIMEOUT', permissionMode: 'workspace-write' },
    });
    const cancelled = await controlRequest(b, a, pairKey, {
      v: 1,
      requestId: 'direct-cancel-001',
      action: 'cancel',
      params: { jobId: cancellable.body.result.jobId },
    });
    assert.equal(cancelled.body.result.cancelled, true);
    const cancelMissing = await controlRequest(b, a, pairKey, { v: 1, requestId: 'direct-cancel-002', action: 'cancel', params: { jobId: 'missing' } });
    assert.equal(cancelMissing.body.result.cancelled, false);
    const unknownAction = await controlRequest(b, a, pairKey, { v: 1, requestId: 'unknown-action-001', action: 'not.real', params: {} });
    assert.equal(unknownAction.status, 400);
    assert.equal(unknownAction.body.error.code, 'unknown-action');

    const revoked = await call(b, 'setTrust', { deviceId: a.deviceId, allowControl: false, maxPermissionMode: 'workspace-write' });
    assert.equal(revoked.ok, true);
    const denied = await controlRequest(b, a, pairKey, { v: 1, requestId: 'denied-caps-0001', action: 'capabilities', params: {} });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'denied');

    await verifyLocalBehavior(b, temp, a, pairKey);
  } finally {
    await Promise.all(nodes.map((node) => stopEmbeddedNode(node)));
    await Promise.all(childNodes.map((node) => stopNode(node)));
    if (previousFakeAccount === undefined) delete process.env.DSH_MESH_FAKE_ACCOUNT;
    else process.env.DSH_MESH_FAKE_ACCOUNT = previousFakeAccount;
    rmSync(temp, { recursive: true, force: true });
  }
});

async function verifyLocalBehavior(node, temp, remoteNode, pairKey) {
  const previousPath = process.env.PATH;
  process.env.PATH = `${installFakeSsh(temp)}:${previousPath ?? ''}`;
  try {
    const reauthorized = await call(node, 'setTrust', { deviceId: remoteNode.deviceId, allowControl: true, maxPermissionMode: 'workspace-write' });
    assert.equal(reauthorized.ok, true);
    const evilOrigin = await fetch(`${node.ui}/ui/ping`, { headers: { origin: 'https://evil.example' } });
    assert.equal(evilOrigin.status, 403);
    const trustedOrigin = await fetch(`${node.ui}/ui/ping`, { headers: { origin: 'http://localhost:46810' } });
    assert.equal(trustedOrigin.status, 200);
    assert.equal(trustedOrigin.headers.get('access-control-allow-origin'), 'http://localhost:46810');
    const appOrigin = await fetch(`${node.ui}/ui/ping`, { headers: { origin: 'dsh-app://local' } });
    assert.equal(appOrigin.status, 200);
    const preflight = await fetch(`${node.ui}/ui/status`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:46810' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
    const badUiJson = await fetch(`${node.ui}/ui/status`, { method: 'POST', body: '{' });
    assert.equal(badUiJson.status, 400);
    assert.equal((await badUiJson.json()).error.code, 'bad-json');
    const unknownMethod = await call(node, 'doesNotExist');
    assert.equal(unknownMethod.error.code, 'unknown-method');
    const missingUi = await fetch(`${node.ui}/ui/missing`);
    assert.equal(missingUi.status, 404);
    const health = await fetch(`${node.peer}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'claw-mesh');
    const peerInfo = await fetch(`${node.peer}/mesh/info`);
    assert.deepEqual((await peerInfo.json()).features, ['idempotency', 'replay-protection', 'permission-ceiling']);

    assert.equal((await call(node, 'endpointSave', { endpoint: { host: '' } })).error.code, 'invalid-host');
    assert.equal((await call(node, 'endpointSave', { endpoint: { host: 'bad host' } })).error.code, 'invalid-host');
    const endpointSaved = await call(node, 'endpointSave', {
      endpoint: { name: 'local-ssh', host: '127.0.0.1', user: 'tester', port: 2222, keyPath: '/tmp/test-key', shared: false },
    });
    assert.equal(endpointSaved.ok, true);
    assert.equal(endpointSaved.endpoint.hasPassword, false);
    const endpointId = endpointSaved.endpoint.endpointId;

    const commandRequest = { endpointId, command: 'hello', requestId: 'local-ssh-0001' };
    const command = await call(node, 'endpointRun', commandRequest);
    assert.equal(command.ok, true);
    assert.equal(command.output.code, 0);
    assert.equal(command.output.stdout, 'ran:hello\n');
    const commandDuplicate = await call(node, 'endpointRun', commandRequest);
    assert.deepEqual(commandDuplicate, command, 'command retries must return the cached output');
    const commandConflict = await call(node, 'endpointRun', { ...commandRequest, command: 'changed' });
    assert.equal(commandConflict.error.code, 'request-id-conflict');
    assert.equal((await call(node, 'endpointRun', { endpointId, command: ' ', requestId: 'local-ssh-0002' })).error.code, 'empty');
    assert.equal((await call(node, 'endpointRun', { endpointId, command: 'bad-id', requestId: 'x' })).error.code, 'bad-request-id');
    assert.equal((await call(node, 'endpointRun', { endpointId: 'missing', command: 'hello' })).error.code, 'missing');
    const failedCommand = await call(node, 'endpointRun', { endpointId, command: 'fail', requestId: 'local-ssh-0003' });
    assert.equal(failedCommand.output.code, 7);
    assert.match(failedCommand.output.stderr, /deliberate ssh failure/);
    const largeCommand = await call(node, 'endpointRun', { endpointId, command: 'large', requestId: 'local-ssh-0004' });
    assert.equal(largeCommand.output.stdout.length, 8_000);
    assert.equal(largeCommand.output.stderr.length, 4_000);
    assert.match(largeCommand.output.stdout, /^x+$/);
    assert.match(largeCommand.output.stderr, /^z+$/);

    const probed = await call(node, 'endpointTest', { endpointId });
    assert.equal(probed.ok, true);
    assert.equal(probed.probe.ok, true);
    assert.equal(probed.probe.caps.osLabel, 'Linux');
    assert.equal(probed.probe.caps.cores, 8);
    assert.equal(probed.probe.caps.memGb, 16);
    assert.equal(probed.probe.caps.diskAvail, '60G');
    assert.match(probed.probe.caps.gpu, /RTX 4090/);
    const shared = await call(node, 'setEndpointShared', { endpointId });
    assert.equal(shared.endpoint.shared, true, 'omitting shared toggles the current value');

    const remoteEndpoints = await controlRequest(node, remoteNode, pairKey, { v: 1, requestId: 'endpoint-list-002', action: 'endpoint.list', params: {} });
    assert.ok(remoteEndpoints.body.result.endpoints.some((endpoint) => endpoint.endpointId === endpointId));
    const remoteProbe = await controlRequest(node, remoteNode, pairKey, { v: 1, requestId: 'endpoint-probe-001', action: 'endpoint.test', params: { endpointId } });
    assert.equal(remoteProbe.status, 200);
    assert.equal(remoteProbe.body.result.probe.ok, true);
    const remoteCommandPayload = {
      v: 1,
      requestId: 'remote-endpoint-run-001',
      action: 'endpoint.run',
      params: { endpointId, command: 'direct-remote-command' },
    };
    const remoteCommand = await controlRequest(node, remoteNode, pairKey, remoteCommandPayload);
    assert.equal(remoteCommand.body.result.output.stdout, 'ran:direct-remote-command\n');
    const remoteCommandDuplicate = await controlRequest(node, remoteNode, pairKey, remoteCommandPayload);
    assert.deepEqual(remoteCommandDuplicate.body, remoteCommand.body);
    const emptyRemoteCommand = await controlRequest(node, remoteNode, pairKey, {
      v: 1,
      requestId: 'remote-endpoint-run-002',
      action: 'endpoint.run',
      params: { endpointId, command: ' ' },
    });
    assert.equal(emptyRemoteCommand.status, 400);
    assert.equal(emptyRemoteCommand.body.error.code, 'empty-command');
    const missingRemoteEndpoint = await controlRequest(node, remoteNode, pairKey, {
      v: 1,
      requestId: 'remote-endpoint-run-003',
      action: 'endpoint.run',
      params: { endpointId: 'missing', command: 'hello' },
    });
    assert.equal(missingRemoteEndpoint.status, 404);
    assert.equal(missingRemoteEndpoint.body.error.code, 'missing');

    const remoteTask = await controlRequest(node, remoteNode, pairKey, {
      v: 1,
      requestId: 'remote-endpoint-task-001',
      action: 'endpoint.task',
      params: { endpointId, prompt: 'direct-endpoint-task', permissionMode: 'read-only' },
    });
    assert.equal(remoteTask.status, 200);
    assert.equal(remoteTask.body.result.target, 'local-ssh');
    const remoteEndpointJob = await waitFor(async () => {
      const polled = await controlRequest(node, remoteNode, pairKey, {
        v: 1,
        requestId: 'remote-endpoint-job-001',
        action: 'job',
        params: { jobId: remoteTask.body.result.jobId },
      });
      return polled.body.result?.job?.status === 'completed' ? polled.body.result.job : null;
    }, { description: 'remote endpoint job completion' });
    assert.equal(remoteEndpointJob.target.deviceId, endpointId);
    assert.equal(remoteEndpointJob.permissionMode, 'read-only');
    const emptyRemoteTask = await controlRequest(node, remoteNode, pairKey, {
      v: 1,
      requestId: 'remote-endpoint-task-002',
      action: 'endpoint.task',
      params: { endpointId, prompt: ' ' },
    });
    assert.equal(emptyRemoteTask.status, 400);
    assert.equal(emptyRemoteTask.body.error.code, 'empty-prompt');
    await call(node, 'setEndpointShared', { endpointId, shared: false });
    const notShared = await controlRequest(node, remoteNode, pairKey, {
      v: 1,
      requestId: 'remote-endpoint-run-004',
      action: 'endpoint.run',
      params: { endpointId, command: 'not-shared' },
    });
    assert.equal(notShared.body.error.code, 'endpoint-not-shared');
    await call(node, 'setEndpointShared', { endpointId, shared: true });

    const withPassword = await call(node, 'endpointSave', { endpoint: { endpointId, host: '127.0.0.1', password: 'test-password' } });
    assert.equal(withPassword.endpoint.hasPassword, true);
    assert.equal('password' in withPassword.endpoint, false, 'public endpoint views must not expose passwords');
    const askpass = await call(node, 'endpointRun', { endpointId, command: 'check-askpass', requestId: 'local-ssh-0005' });
    assert.deepEqual(JSON.parse(askpass.output.stdout), {
      askpass: true,
      askpassRequired: true,
      batchModeDisabled: true,
      passwordAuthentication: true,
    });
    if (process.platform !== 'win32') assert.equal(statSync(join(node.stateDir, 'askpass.sh')).mode & 0o777, 0o700);

    const dispatchTool = node.tools.get('mesh_dispatch');
    const toolJob = await dispatchTool.execute({ target: 'self', prompt: 'tool-job', requestId: 'tool-dispatch-001', waitMs: 10_000 });
    assert.equal(toolJob.ok, true);
    assert.equal(toolJob.status, 'completed');
    assert.match(toolJob.finalText, /^done:tool-job/);
    const noMatch = await dispatchTool.execute({ prompt: 'no-match', requires: { minCores: Number.MAX_SAFE_INTEGER } });
    assert.equal(noMatch.error.code, 'no-match');
    const statusTool = node.tools.get('mesh_job_status');
    const toolStatus = await statusTool.execute({ jobId: toolJob.jobId });
    assert.equal(toolStatus.status, 'completed');
    assert.equal(toolStatus.jobId, toolJob.jobId);
    const sshTool = node.tools.get('mesh_ssh_run');
    const toolCommand = await sshTool.execute({ endpoint: 'local-ssh', command: 'from-tool', requestId: 'tool-ssh-0001' });
    assert.equal(toolCommand.output.stdout, 'ran:from-tool\n');
    assert.equal((await sshTool.execute({ endpoint: 'missing', command: 'hello' })).error.code, 'missing');
    const listTool = node.tools.get('mesh_list_devices');
    const listed = await listTool.execute();
    assert.equal(listed.ok, true);
    assert.ok(listed.endpoints.some((endpoint) => endpoint.endpointId === endpointId && endpoint.owner === 'self'));
    const addTool = node.tools.get('mesh_add_endpoint');
    const added = await addTool.execute({ name: 'added-by-tool', host: 'example.test', user: 'tester', shared: true });
    assert.equal(added.ok, true);
    assert.equal(added.probe.ok, true);
    assert.equal(node.sections[0].text().includes('本机注册的 SSH 设备 2 台'), true);

    assert.equal((await call(node, 'rename', { displayName: ' ' })).error.code, 'invalid');
    const renamed = await call(node, 'rename', { displayName: 'renamed-local-node' });
    assert.equal(renamed.self.displayName, 'renamed-local-node');
    const ssh = await call(node, 'ssh', { deviceId: 'self' });
    assert.equal(ssh.ok, true);
    assert.match(ssh.command, /^ssh .+@/);
    const discoverable = await call(node, 'setDiscoverable', { discoverable: true });
    assert.equal(discoverable.self.discoverable, true);
    const hidden = await call(node, 'setDiscoverable', { discoverable: false });
    assert.equal(hidden.self.discoverable, false);
    const removed = await call(node, 'endpointRemove', { endpointId: added.endpoint.endpointId });
    assert.equal(removed.ok, true);
    assert.equal((await call(node, 'endpointRemove', { endpointId: added.endpoint.endpointId })).error.code, 'missing');

    const visibleAgain = await call(node, 'setDiscoverable', { discoverable: true });
    assert.equal(visibleAgain.self.discoverable, true);
    const invalidPort = await call(node, 'saveSettings', { settings: { port: 0 } });
    assert.equal(invalidPort.error.code, 'invalid-port');
    const [newPeerPort, newDiscoveryPort] = await Promise.all([freeTcpPort(), freeUdpPort()]);
    const oldPeer = node.peer;
    const changedPorts = await call(node, 'saveSettings', { settings: { port: newPeerPort, discoveryPort: newDiscoveryPort } });
    assert.equal(changedPorts.ok, true);
    assert.equal(changedPorts.self.settings.port, newPeerPort);
    assert.equal(changedPorts.self.settings.discoveryPort, newDiscoveryPort);
    assert.equal(changedPorts.self.controlPlane, `0.0.0.0:${newPeerPort}`);
    assert.equal(changedPorts.self.discoverable, true);
    const movedHealth = await fetch(`http://127.0.0.1:${newPeerPort}/health`);
    assert.equal(movedHealth.status, 200);
    await assert.rejects(fetch(`${oldPeer}/health`, { signal: AbortSignal.timeout(500) }));
  } finally {
    process.env.PATH = previousPath;
  }
}
