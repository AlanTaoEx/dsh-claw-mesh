/**
 * Dev harness: run a second Claw-Mesh node in plain Node, outside the DSH host.
 *
 * It exists so the LAN transport (discovery, pairing, permission gate, remote
 * dispatch) can be exercised on a single machine. The node gets its own state
 * directory, its own ports, and a stub context that satisfies the two host
 * services the plugin touches (`tools`, `effect`).
 *
 *   DSH_MESH_STATE_DIR=/tmp/claw-mesh-b node tools/second-node.mjs
 */
import { apply } from '../index.js';

const stateDir = process.env.DSH_MESH_STATE_DIR;
if (!stateDir) {
  console.error('set DSH_MESH_STATE_DIR to a scratch directory');
  process.exit(2);
}

const ctx = {
  tools: { register: () => () => {} },
  // The harness half publishes a system-prompt section; the stub just accepts it.
  systemPrompt: { section: () => () => {} },
  effect: (fn) => {
    const dispose = fn();
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  },
  logger: console,
  provide: () => () => {},
  // Stands in for the DSH account service: signing in is simulated through
  // DSH_MESH_FAKE_ACCOUNT (see index.js), so this node just reports signed-out.
  get: (name) => {
    if (name === 'deepseekAccount') {
      return { getState: async () => ({ status: 'signed-out' }), getDeviceIdentity: async () => ({}), getProfile: async () => null };
    }
    if (process.env.DSH_MESH_FAKE_WORKSPACES !== '1') return undefined;
    if (name === 'workspaceRegistry') {
      return {
        list: () => [{ id: 'workspace-demo', title: 'Demo Workspace', path: '/tmp/demo-workspace', sessionIds: ['session-demo'] }],
      };
    }
    if (name === 'sessionController') {
      const records = globalThis.__clawMeshFakeSessionRecords ??= [
        {
          type: 'event',
          event: {
            seq: 1,
            time: 1_000,
            type: 'user/message',
            surfaceOp: 'append',
            data: { id: 'user-1', content: [{ type: 'text', text: 'Hello remote agent' }], source: { kind: 'user', rpcId: 'initial-user' } },
          },
        },
        {
          type: 'event',
          event: {
            seq: 2,
            time: 2_000,
            type: 'assistant/message',
            surfaceOp: 'append',
            data: { turn: 1, step: 1, message: { id: 'assistant-1', content: [{ type: 'text', text: 'Hello from remote agent' }], source: { kind: 'model', provider: 'fake', model: 'fake' } } },
          },
        },
      ];
      return {
        list: async () => ({
          items: [
            { sessionId: 'session-demo', cwd: '/tmp/demo-workspace', running: false, updatedAt: 2_000, projections: { values: { title: 'Demo Session' } } },
            { sessionId: 'session-ungrouped', cwd: '/tmp/ungrouped-workspace', running: true, updatedAt: 1_000, projections: { values: { title: 'Ungrouped Session' } } },
          ],
        }),
        page: async () => ({ cursor: records.at(-1)?.event.seq ?? 0, records, hasMore: false }),
        create: async () => ({ sessionId: 'session-new', agentPreset: undefined }),
        prompt: async (request) => {
          const seq = (records.at(-1)?.event.seq ?? 0) + 1;
          records.push({
            type: 'event',
            event: {
              seq,
              time: seq * 1_000,
              type: 'user/message',
              surfaceOp: 'append',
              data: { id: `user-${seq}`, content: request.content, source: { kind: 'user', rpcId: request.requestId } },
            },
          });
          records.push({
            type: 'event',
            event: {
              seq: seq + 1,
              time: (seq + 1) * 1_000,
              type: 'assistant/message',
              surfaceOp: 'append',
              data: { turn: 2, step: 1, message: { id: `assistant-${seq + 1}`, content: [{ type: 'text', text: `Remote reply: ${request.content[0].text}` }], source: { kind: 'model', provider: 'fake', model: 'fake' } } },
            },
          });
          return { accepted: true };
        },
        cancel: () => ({ accepted: true }),
      };
    }
    return undefined;
  },
};

apply(ctx, {
  port: Number(process.env.DSH_MESH_PORT || 46850),
  uiPort: Number(process.env.DSH_MESH_UI_PORT || 46860),
  discoveryPort: Number(process.env.DSH_MESH_DISCOVERY_PORT || 46801),
});

setInterval(() => {}, 1 << 30);
