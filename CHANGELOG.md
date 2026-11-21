# Changelog

## 0.4.0

- Read and drive a remote session from the console: opening a device session shows its latest
  messages, and the composer sends new turns, stops a running turn, or starts a fresh session in a
  chosen workspace or directory.
- History requests return the most recent messages only (`maxMessages`, 1–100) and skip turns that
  contain nothing but tool calls, so the remote view is not padded with blank rows.
- The four session actions travel over the same signed control channel as everything else, require
  the owner's control permission, and are idempotent where they mutate (`session.create`). Failures
  come back as `session-read-failed` / `session-create-failed` / `session-prompt-failed` /
  `session-cancel-failed` instead of a generic error.
- Nodes that predate this release answer `unknown action session.*`; the panel reports it instead of
  showing an empty conversation.

## 0.3.0

- Add remote workspaces: paired devices that granted control now answer a `workspace.list` request,
  and the sidebar gains a collapsible section listing their workspaces and session titles, refreshed
  on demand and every 15 seconds.
- Picking a workspace or session opens a related-job form and starts a new headless job in that
  remote directory; no project files are copied and the original session is neither resumed nor
  modified.
- Workspace metadata is requested only over the signed control channel from devices that granted
  control, and is never part of the UDP announcement.
- Nodes that predate this release answer `unknown action workspace.list`; their group keeps the error
  instead of disappearing.

## 0.2.3

- Devices from another account are now invisible: their announcements are dropped on arrival, so
  they never appear in the list and never show up as shared SSH endpoints. Switching accounts also
  clears any peers that belonged to the previous one.
- Remove the "other accounts" section from the console.
- Cover the rule with an integration test where two nodes use different account fingerprints.

## 0.2.2

- Edit the control and discovery ports from the local device page; invalid values are rejected and a
  changed control port rebinds the listener (with discovery restarted) without a manual restart.
- Drop the in-panel settings and help pages, so the console is one list plus per-device detail.
- Point the "dsh CLI not found" hint at `PATH` instead of a settings field that no longer exists.
- Extend the integration tests to cover port validation and live rebinding.

## 0.2.1

- Refresh the README screenshot set: Windows console, Windows SSH endpoint, macOS console, and
  macOS peer detail, shown side by side for both platforms.
- Note in the guide that screenshots come from a real two-node setup with a live SSH endpoint.

## 0.2.0

- Hide private SSH endpoints from discovery, fix permission direction and preserve endpoint job targets.
- Align SSH/UI timeouts, bound command output, and add timed-out job termination with forced-kill escalation.
- Persist state atomically with restricted file permissions.
- Add control protocol v1 with legacy compatibility, `requestId` idempotency, replay protection,
  per-peer permission ceilings, and remote approval-policy isolation.
- Add automated two-node integration and protocol regression tests to CI.

## 0.1.0

First public release.

- Sidebar console **设备连接 / Claw-Mesh**: local device, online peers, SSH endpoints, other accounts.
- Same-account LAN discovery over UDP `46801` with a discoverability switch.
- Per-device, per-direction control switches; pairing exchanges a 32-byte key and every control
  request is HMAC-SHA256 signed.
- Agent dispatch to peers through `dsh --profile headless`, with hardware-aware selection
  (`os`, `gpu`, `minCores`, `minMemGb`, `tag`).
- SSH endpoints owned by the registering node, with key or password authentication (askpass helper,
  password never in argv), a 60 s online probe, and a per-endpoint sharing switch.
- Five agent tools: `mesh_list_devices`, `mesh_dispatch`, `mesh_job_status`, `mesh_ssh_run`,
  `mesh_add_endpoint`; every session gets a device inventory section.
- DSH-native UI: 960px centred column, native row/typography/switch metrics, light and dark themes.
