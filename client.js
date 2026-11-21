/**
 * Claw-Mesh — Client half.
 *
 * A "设备连接" sidebar panel plus a console page that follows the host UI
 * language: flat rows, hairline fields, no cards. Local port and discovery
 * controls live in the device detail view.
 */
window.__ModuleLoader__.load({
  id: 'dsh-claw-mesh',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-claw-mesh';
    const PANEL_ID = 'claw-mesh';

    const STRINGS = {
      'zh-CN': {
        panelTitle: '设备连接',
        panelSubtitle: '局域网内同账号设备的互联与调度',
        sidebar: '设备连接',
        self: '本机',
        devices: '在线设备',
        endpoints: '外部设备（SSH）',
        noDevices: '暂未发现其他设备',
        noDevicesHint: '另一台设备启动 DSH 并登录同一账号后会自动出现',
        noEndpoints: '尚未添加 SSH 设备',
        refresh: '刷新',
        settings: '设置',
        back: '返回',
        online: '在线',
        offline: '离线',
        untested: '未测试',
        dispatchHintTitle: '在会话里调度',
        dispatchHintSelf: '本机就是当前窗口，直接在对话里布置任务就行。',
        dispatchHintReady: '在任意会话里说清楚要在这台设备上做什么，Agent 会用 mesh_dispatch 派过来再把结果拿回来。',
        dispatchHintPending: '对方还没授权本机调度，去那台设备上打开「允许该设备控制本机」。',
        endpointDispatchHint: '在任意会话里让 Agent 用 mesh_dispatch 指定这台 SSH 设备，注册它的节点会通过 ssh 执行；只想跑一条命令也可以用上面的「远程命令」。',
        offline: '离线',
        sameAccount: '同账号',
        signedOut: '未登录',
        signedIn: '已登录',
        paired: '已配对',
        unpaired: '未配对',
        allowControl: '允许该设备控制本机',
        controlPeer: '本机控制对方',
        allowed: '已允许',
        notAllowed: '未允许',
        pairNow: '配对',
        unpair: '解除配对',
        ready: '可调度',
        pending: '待授权',
        deviceId: '设备 ID',
        platform: '平台',
        account: '账号',
        lan: '地址',
        ssh: 'SSH',
        controlPort: '控制端口',
        discoveryPort: '发现端口',
        name: '名称',
        rename: '重命名',
        discovery: '发现',
        discoverable: '可被发现',
        discoveryHidden: '已隐藏',
        allowDiscovery: '允许局域网内的同账号设备发现本机',
        discoveryOn: '其他设备能看到本机，可以把任务派过来。',
        discoveryOff: '本机不广播，也不会出现在其他设备列表里；已配对的设备仍能直连。',
        dispatch: '调度任务',
        dispatchPrompt: '描述要在这台设备上执行的任务…',
        permission: '权限',
        maxPermission: '允许的最高权限',
        run: '运行',
        jobResult: '任务结果',
        eventsUnit: '条事件',
        running: '执行中',
        completed: '已完成',
        failed: '失败',
        cancelled: '已取消',
        capsTitle: '硬件画像',
        capsEmpty: '尚未探测',
        cores: '核心',
        memory: '内存',
        disk: '可用磁盘',
        gpuNone: '无独立 GPU',
        capsSystem: '系统',
        capsCpu: '处理器',
        capsMem: '内存',
        capsGpu: '显卡',
        capsDisk: '可用磁盘',
        capsUnknown: '未知',
        test: '测试连接',
        testing: '测试中…',
        reachable: '连接正常',
        unreachable: '连接失败',
        remoteCommand: '远程命令',
        commandPlaceholder: '例如：nvidia-smi -L',
        output: '输出',
        exitCode: '退出码',
        add: '添加',
        newEndpoint: '新增 SSH 设备',
        host: '主机',
        port: '端口',
        user: '用户',
        key: '私钥路径',
        password: '密码',
        passwordHint: '留空则用密钥认证',
        authTitle: '认证方式',
        authPassword: '密码认证',
        authKey: '密钥认证',
        authDefaultKey: '默认密钥',
        authManaged: '由注册机管理',
        setPassword: '设置密码',
        passwordOnly: '密码只保存在本机状态文件里，不会同步给其他节点。',
        shareTitle: '共享',
        shareEndpoint: '允许其他已授权设备使用',
        shareHintOn: '已授权控制本机的设备，可以在这台机器上执行命令、派任务。',
        shareHintOff: '只有本机能使用这台 SSH 设备。',
        sharedBadge: '已共享',
        optional: '可选',
        save: '保存',
        cancel: '取消',
        deleteEndpoint: '移除设备',
        ownerNode: '所属节点',
        ownerSelf: '本机',
        via: '经 ',
        sshEndpoint: 'SSH',
        settingsTitle: '设置',
        settingsHint: '端口保存后立即生效',
        on: '开启',
        off: '关闭',
        scan: '扫描',
        loading: '加载中…',
        failed: '操作失败',
        errorPrefix: '错误',
        sinceNow: '刚刚',
        permissionOptions: { 'read-only': '只读', 'workspace-write': '工作区读写', 'danger-full-access': '完全访问' },
        remoteWorkspaces: '其他设备的工作区',
        remoteWorkspaceHint: '按需读取已授权设备；点击工作区或会话可直接对话',
        collapse: '折叠',
        expand: '展开',
        noRemoteWorkspaces: '暂无已授权设备的工作区',
        noWorkspaces: '暂无工作区',
        ungroupedSessions: '未分组会话',
        remoteTaskTitle: '创建远端关联任务',
        remoteTaskHint: '新任务将在目标设备的对应目录运行，不会同步或修改原会话。',
        targetDevice: '目标设备',
        targetWorkspace: '工作区',
        targetDirectory: '目录',
        relatedSession: '关联会话',
        taskPrompt: '描述要在该工作区执行的新任务…',
        startTask: '启动任务',
        backToWorkspaces: '返回设备列表',
        newTask: '新建关联任务',
        timedOut: '已超时',
        noDevicesOnline: '没有可同步工作区的已授权在线设备',
        remoteConversation: '远端会话',
        openConversation: '打开会话',
        createConversation: '新建会话',
        send: '发送',
        stop: '停止',
        you: '你',
        agent: 'Agent',
        noMessages: '暂无会话消息，输入内容开始对话',
        messagePlaceholder: '发送消息到远端会话…',
        creatingConversation: '正在创建远端会话…',
      },
      en: {
        panelTitle: 'Devices',
        panelSubtitle: 'Same-account devices on your LAN, connected and controllable',
        sidebar: 'Devices',
        self: 'This device',
        devices: 'Online devices',
        endpoints: 'SSH endpoints',
        noDevices: 'No other devices yet',
        noDevicesHint: 'They appear once another device runs DSH with the same account',
        noEndpoints: 'No SSH endpoints yet',
        refresh: 'Refresh',
        settings: 'Settings',
        back: 'Back',
        online: 'Online',
        offline: 'Offline',
        untested: 'Not tested',
        dispatchHintTitle: 'Dispatch from chat',
        dispatchHintSelf: 'This window is the device; just describe the task in the conversation.',
        dispatchHintReady: 'In any session, say what should happen on this device: the agent calls mesh_dispatch and brings the result back.',
        dispatchHintPending: 'This device has not granted control yet. Open “允许该设备控制本机” on it first.',
        endpointDispatchHint: 'In any session, point mesh_dispatch at this SSH device and its owning node runs the work over ssh; for a single command use “Remote command” above.',
        offline: 'Offline',
        sameAccount: 'Same account',
        signedOut: 'Signed out',
        signedIn: 'Signed in',
        paired: 'Paired',
        unpaired: 'Not paired',
        allowControl: 'Allow this device to control me',
        controlPeer: 'Control that device',
        allowed: 'Allowed',
        notAllowed: 'Not allowed',
        pairNow: 'Pair',
        unpair: 'Unpair',
        ready: 'Ready',
        pending: 'Pending',
        deviceId: 'Device ID',
        platform: 'Platform',
        account: 'Account',
        lan: 'Address',
        ssh: 'SSH',
        controlPort: 'Control port',
        discoveryPort: 'Discovery port',
        name: 'Name',
        rename: 'Rename',
        discovery: 'Discovery',
        discoverable: 'Visible',
        discoveryHidden: 'Hidden',
        allowDiscovery: 'Let same-account devices on the LAN discover this machine',
        discoveryOn: 'Other devices can see this machine and dispatch tasks to it.',
        discoveryOff: 'This machine stays silent and drops out of other lists; paired devices can still connect directly.',
        dispatch: 'Dispatch a task',
        dispatchPrompt: 'Describe the task to run on that device…',
        permission: 'Permission',
        maxPermission: 'Maximum permission',
        run: 'Run',
        jobResult: 'Result',
        eventsUnit: 'events',
        running: 'Running',
        completed: 'Completed',
        failed: 'Failed',
        cancelled: 'Cancelled',
        capsTitle: 'Hardware',
        capsEmpty: 'Not scanned',
        cores: 'cores',
        memory: 'memory',
        disk: 'free disk',
        gpuNone: 'No discrete GPU',
        capsSystem: 'System',
        capsCpu: 'CPU',
        capsMem: 'Memory',
        capsGpu: 'GPU',
        capsDisk: 'Free disk',
        capsUnknown: 'Unknown',
        test: 'Test',
        testing: 'Testing…',
        reachable: 'Reachable',
        unreachable: 'Unreachable',
        remoteCommand: 'Remote command',
        commandPlaceholder: 'e.g. nvidia-smi -L',
        output: 'Output',
        exitCode: 'Exit code',
        add: 'Add',
        newEndpoint: 'New SSH endpoint',
        host: 'Host',
        port: 'Port',
        user: 'User',
        key: 'Key path',
        password: 'Password',
        passwordHint: 'Leave empty to use a key',
        authTitle: 'Authentication',
        authPassword: 'Password',
        authKey: 'Key',
        authDefaultKey: 'default identity',
        authManaged: 'managed by owner',
        setPassword: 'Set password',
        passwordOnly: 'The password stays in this node state file and is never shared with other devices.',
        shareTitle: 'Sharing',
        shareEndpoint: 'Let other authorized devices use it',
        shareHintOn: 'Devices you granted control to can run commands and tasks on this machine.',
        shareHintOff: 'Only this node can use this SSH device.',
        sharedBadge: 'Shared',
        optional: 'optional',
        save: 'Save',
        cancel: 'Cancel',
        deleteEndpoint: 'Remove device',
        ownerNode: 'Owner node',
        ownerSelf: 'this device',
        via: 'via ',
        sshEndpoint: 'SSH',
        settingsTitle: 'Settings',
        settingsHint: 'Port changes apply when saved',
        on: 'On',
        off: 'Off',
        scan: 'Scan',
        loading: 'Loading…',
        failed: 'Failed',
        errorPrefix: 'Error',
        sinceNow: 'just now',
        permissionOptions: { 'read-only': 'Read only', 'workspace-write': 'Workspace write', 'danger-full-access': 'Full access' },
        remoteWorkspaces: 'Workspaces on other devices',
        remoteWorkspaceHint: 'Loaded from authorized devices on demand; click a workspace or session for a direct conversation',
        collapse: 'Collapse',
        expand: 'Expand',
        noRemoteWorkspaces: 'No workspaces from authorized devices',
        noWorkspaces: 'No workspaces',
        ungroupedSessions: 'Ungrouped sessions',
        remoteTaskTitle: 'Create related remote job',
        remoteTaskHint: 'The new job runs in the selected directory on the target. It does not copy or modify the original session.',
        targetDevice: 'Target device',
        targetWorkspace: 'Workspace',
        targetDirectory: 'Directory',
        relatedSession: 'Related session',
        taskPrompt: 'Describe the new job for this workspace…',
        startTask: 'Start job',
        backToWorkspaces: 'Back to devices',
        newTask: 'New related job',
        timedOut: 'Timed out',
        noDevicesOnline: 'No authorized online devices with workspaces',
        remoteConversation: 'Remote conversation',
        openConversation: 'Open conversation',
        createConversation: 'New conversation',
        send: 'Send',
        stop: 'Stop',
        you: 'You',
        agent: 'Agent',
        noMessages: 'No messages yet. Send a message to start the conversation',
        messagePlaceholder: 'Send a message to the remote session…',
        creatingConversation: 'Creating remote conversation…',
      },
    };

    const T = {
      bg: 'var(--dsw-alias-bg-base)',
      layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      border1: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      brand: 'var(--dsw-alias-brand-primary)',
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      danger: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    };

    // bg-layer-1/2 resolve to pure white in the light theme, so surfaces and
    // separators need explicit light/dark values to stay visible.
    const SURFACE = 'light-dark(rgba(0,0,0,.045),rgba(255,255,255,.06))';
    const LINE = 'light-dark(rgba(0,0,0,.07),rgba(255,255,255,.09))';
    const HOVER = 'light-dark(rgba(0,0,0,.04),rgba(255,255,255,.05))';
    const INPUT_LINE = 'light-dark(rgba(0,0,0,.16),rgba(255,255,255,.16))';
    // Native row descriptions sit lighter than label-secondary.
    const DESC = 'light-dark(#81858c,#8b9098)';

    // ctx.locale.getLocale() returns a snapshot object ({ active, locales, revision }),
    // not a bare tag, so every entry point has to accept both shapes.
    function normalizeLocaleTag(value) {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        const tag = value.active ?? value.locale ?? value.id ?? '';
        return typeof tag === 'string' ? tag : '';
      }
      return '';
    }

    function makeTranslator(locale) {
      const pick = (value) => {
        const tag = normalizeLocaleTag(value);
        if (!tag) return STRINGS['zh-CN'];
        if (STRINGS[tag]) return STRINGS[tag];
        return tag.toLowerCase().startsWith('zh') ? STRINGS['zh-CN'] : STRINGS.en;
      };
      const dict = pick(locale);
      const t = (key) => {
        const value = dict[key];
        return typeof value === 'string' ? value : key;
      };
      t.dict = dict;
      return t;
    }

    /* The Host half serves a loopback-only console API. The page discovers it by
       probing the port range, so a busy port on the host side never breaks the UI. */
    const UI_PORT_START = 46810;
    const UI_PORT_SPAN = 24;
    let uiBase = null;

    async function probeUiBase() {
      for (let port = UI_PORT_START; port < UI_PORT_START + UI_PORT_SPAN; port += 1) {
        const base = `http://127.0.0.1:${port}`;
        try {
          const response = await fetch(`${base}/ui/ping`, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(900) });
          if (!response.ok) continue;
          const payload = await response.json();
          if (payload?.service === 'claw-mesh') return base;
        } catch {
          /* keep probing */
        }
      }
      return null;
    }

    async function ensureUiBase(force) {
      if (uiBase && !force) return uiBase;
      uiBase = await probeUiBase();
      return uiBase;
    }

    async function reportClient(message, extra) {
      try {
        const base = await ensureUiBase();
        if (!base) return;
        await fetch(`${base}/ui/log`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, extra, at: Date.now(), href: location.href }),
        });
      } catch {
        /* diagnostics are best effort */
      }
    }

    async function callMesh(method, payload) {
      let base = await ensureUiBase();
      if (!base) base = await ensureUiBase(true);
      if (!base) throw new Error('未找到 Claw-Mesh Host 服务（127.0.0.1:46810-46833）');
      let response;
      try {
        response = await fetch(`${base}/ui/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(method === 'endpointRun' ? 75_000 : method === 'endpointTest' ? 35_000 : 25_000),
        });
      } catch (error) {
        uiBase = null;
        reportClient('fetch-failed', { method, message: String(error?.message ?? error) });
        throw new Error(`连不上 Host 服务（${base}）`);
      }
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        reportClient('bad-json', { method, status: response.status, body: text.slice(0, 300) });
        throw new Error(`Host 返回了非 JSON 响应（${response.status}）`);
      }
      if (!response.ok) throw new Error(parsed?.error?.message ?? `Host 返回 ${response.status}`);
      if (parsed?.ok === false) reportClient('method-error', { method, error: parsed?.error });
      return parsed;
    }

    function ago(timestamp, t) {
      if (!timestamp) return '';
      const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
      if (seconds < 5) return t ? t('sinceNow') : 'now';
      if (seconds < 60) return `${seconds}s`;
      if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
      return `${Math.round(seconds / 3600)}h`;
    }

    /* ---------------------------------------------------------------- */
    /* primitives                                                       */
    /* ---------------------------------------------------------------- */

    const PAGE_CSS = [
      '.cm-page{padding:28px clamp(20px,4vw,48px) 56px;box-sizing:border-box;color:var(--dsw-alias-label-primary)}',
      '.cm-col{width:100%;max-width:960px;margin:0 auto}',
      '.cm-row{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:calc(100% + 16px);padding:10px 8px;margin:0 -8px;border:none;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background 120ms ease}',
      '.cm-row:hover{background:var(--cm-hover)}',
      '.cm-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.cm-static{cursor:default}',
      '.cm-static:hover{background:transparent}',
      '.cm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;border-radius:12px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1;white-space:nowrap;flex:none;cursor:pointer;transition:background 120ms ease,border-color 120ms ease,opacity 120ms ease}',
      '.cm-btn:hover{background:var(--cm-hover)}',
      '.cm-btn:disabled{opacity:.4;cursor:default}',
      '.cm-btn-ghost{border-color:var(--dsw-alias-border-l2)}',
      '.cm-btn-ghost:hover{background:var(--cm-hover)}',
      '.cm-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}',
      '.cm-btn-primary:hover{background:var(--dsw-alias-label-primary);opacity:.86}',
      '.cm-btn-primary:disabled{opacity:.4}',
      '.cm-btn-danger{color:var(--dsw-alias-state-error-primary)}',
      '.cm-link{height:22px;padding:0 2px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12.5px;line-height:1;cursor:pointer;border-radius:6px}',
      '.cm-link:hover{color:var(--dsw-alias-label-primary);background:transparent}',
      '.cm-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.cm-btn-danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}',
      '.cm-input{width:100%;box-sizing:border-box;height:36px;background:var(--dsw-alias-bg-base);border:1px solid var(--cm-input-line);border-radius:12px;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;padding:0 12px;outline:none;transition:border-color 120ms ease,box-shadow 120ms ease}',
      '.cm-input:hover{border-color:var(--dsw-alias-border-l1)}',
      '.cm-input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent)}',
      '.cm-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}',
      'textarea.cm-input{height:auto;min-height:88px;padding:9px 12px;line-height:1.6;resize:vertical;display:block}',
      'select.cm-input{height:32px;padding:0 10px;cursor:pointer}',
      '.cm-switch{position:relative;width:36px;height:20px;flex:none;border:none;border-radius:999px;padding:0;cursor:pointer;background:rgba(255,255,255,.16);background:light-dark(rgba(0,0,0,.12),rgba(255,255,255,.16));transition:background 160ms ease}',
      '.cm-switch[data-on="true"]{background:var(--dsw-alias-label-primary)}',
      '.cm-switch:disabled{opacity:.4;cursor:default}',
      '.cm-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.cm-switch-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:#fff;background:light-dark(#fff,#adb2b8);transition:transform 160ms ease,background 160ms ease}',
      '.cm-switch[data-on="true"] .cm-switch-knob{transform:translateX(16px);background:var(--dsw-alias-bg-base)}',
      '.cm-mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;font-size:12px}',
      '.cm-scroll{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}',
      '.cm-scroll::-webkit-scrollbar{width:8px;height:8px}',
      '.cm-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:8px}',
      '.cm-scroll::-webkit-scrollbar-track{background:transparent}',
    ].join('\n');

    const PAGE_VARS = `:root, .cm-page { --cm-surface: ${SURFACE}; --cm-line: ${LINE}; --cm-hover: ${HOVER}; --cm-input-line: ${INPUT_LINE}; }`;

    function Chip({ children, tone = 'neutral' }) {
      const color = tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : tone === 'danger' ? T.danger : tone === 'brand' ? T.brand : T.muted;
      const strength = tone === 'neutral' ? '12%' : '10%';
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 18,
            padding: '0 7px',
            borderRadius: 999,
            fontSize: 11,
            lineHeight: '18px',
            whiteSpace: 'nowrap',
            flex: 'none',
            color,
            background: `color-mix(in srgb, ${color} ${strength}, transparent)`,
          },
        },
        children,
      );
    }

    function Dot({ tone = T.idle, size = 6 }) {
      return h('span', { style: { width: size, height: size, borderRadius: 999, background: tone, display: 'inline-block', flex: 'none' } });
    }

    function Button({ children, onClick, variant = 'ghost', disabled, title, style, active }) {
      return h(
        'button',
        {
          type: 'button',
          title,
          disabled,
          onClick,
          className: `cm-btn cm-btn-${variant}${active ? ' cm-btn-active' : ''}`,
          style,
        },
        children,
      );
    }


    function Toggle({ checked, onChange, disabled, label }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          'data-on': checked ? 'true' : 'false',
          disabled,
          className: 'cm-switch',
          onClick: () => onChange(!checked),
        },
        h('span', { className: 'cm-switch-knob' }),
      );
    }


    function IconTile({ children, muted, size = 40 }) {
      return h(
        'span',
        {
          style: {
            width: size,
            height: size,
            flex: 'none',
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--cm-surface)',
            color: muted ? T.muted : T.text,
          },
        },
        children,
      );
    }

    function Section({ title, hint, action, children, first }) {
      return h(
        'section',
        { style: { marginTop: first ? 24 : 32 } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 22, marginBottom: 6 } },
          h('h2', { style: { margin: 0, fontSize: 14, fontWeight: 500, color: T.text } }, title),
          hint ? h('span', { style: { fontSize: 12, color: T.muted } }, hint) : null,
          action ? h('span', { style: { marginLeft: 'auto' } }, action) : null,
        ),
        children,
      );
    }

    function Empty({ title, hint }) {
      return h(
        'div',
        { style: { padding: '10px 0', fontSize: 13, color: T.muted, lineHeight: 1.7 } },
        h('div', null, title),
        hint ? h('div', { style: { fontSize: 12 } }, hint) : null,
      );
    }

    function ListRow({ icon, title, meta, right, onClick, muted }) {
      const Tag = onClick ? 'button' : 'div';
      return h(
        Tag,
        {
          type: onClick ? 'button' : undefined,
          onClick,
          className: `cm-row${onClick ? '' : ' cm-static'}`,
        },
        icon ? h(IconTile, { muted }, icon) : null,
        h(
          'span',
          { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
          h(
            'span',
            { style: { fontSize: 14, lineHeight: '20px', color: muted ? T.muted : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            title,
          ),
          meta ? h('span', { style: { fontSize: 12.5, lineHeight: '19px', color: DESC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, meta) : null,
        ),
        right ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 10, flex: 'none' } }, right) : null,
      );
    }

    function Field({ label, children, mono, first }) {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'baseline',
            gap: 16,
            padding: '10px 0',
            borderTop: first ? 'none' : '1px solid var(--cm-line)',
          },
        },
        h('span', { style: { flex: 'none', width: 96, fontSize: 13, fontWeight: 500, color: T.text } }, label),
        h(
          'span',
          {
            style: {
              flex: 1,
              minWidth: 0,
              textAlign: 'right',
              fontSize: 13,
              lineHeight: '20px',
              color: T.text,
              overflowWrap: 'anywhere',
              fontFamily: mono ? T.mono : undefined,
            },
          },
          children,
        ),
      );
    }

    function BackBar({ label, onBack }) {
      return h(
        'button',
        {
          type: 'button',
          onClick: onBack,
          style: { display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, marginBottom: 12, padding: 0, border: 'none', background: 'transparent', color: T.muted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' },
        },
        h(Icon.Chevron, { size: 14 }),
        label,
      );
    }

    function PageHeader({ title, subtitle, actions }) {
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'flex-start', gap: '10px 16px', flexWrap: 'wrap' } },
        h(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          h('h1', { style: { margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: '28px', color: T.text } }, title),
          subtitle ? h('div', { style: { marginTop: 4, fontSize: 13, color: T.muted } }, subtitle) : null,
        ),
        actions ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flex: 'none' } }, actions) : null,
      );
    }

    function Hint({ children }) {
      return h('div', { style: { marginTop: 8, fontSize: 12, color: T.muted } }, children);
    }

    const Icon = {
      Mesh: ({ size = 18 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('rect', { x: 2.2, y: 3.4, width: 6.4, height: 6.4, rx: 1.7 }),
          h('rect', { x: 9.4, y: 8.2, width: 6.4, height: 6.4, rx: 1.7 }),
          h('path', { d: 'M7.2 9.6 9.6 8.6' }),
        ),
      Device: ({ size = 18 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('rect', { x: 2.5, y: 4, width: 13, height: 8.5, rx: 1.6 }),
          h('path', { d: 'M6.5 14.8h5' }),
        ),
      Server: ({ size = 18 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('rect', { x: 3, y: 3, width: 12, height: 5, rx: 1.4 }),
          h('rect', { x: 3, y: 10, width: 12, height: 5, rx: 1.4 }),
          h('path', { d: 'M5.6 5.5h.01M5.6 12.5h.01' }),
        ),
      Clock: ({ size = 18 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('circle', { cx: 9, cy: 9, r: 6.2 }),
          h('path', { d: 'M9 5.8V9l2.2 1.4' }),
        ),
      Refresh: ({ size = 14 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
          h('path', { d: 'M13 2.4V5h-2.6' }),
        ),
      Sliders: ({ size = 14 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M2.5 5h11M2.5 11h11' }),
          h('circle', { cx: 6, cy: 5, r: 1.6 }),
          h('circle', { cx: 10.5, cy: 11, r: 1.6 }),
        ),
      Chevron: ({ size = 14 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M10 3.5 5.5 8l4.5 4.5' }),
        ),
      Plus: ({ size = 14 }) =>
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
          h('path', { d: 'M8 3.5v9M3.5 8h9' }),
        ),
    };

    /* ---------------------------------------------------------------- */
    /* shared pieces                                                    */
    /* ---------------------------------------------------------------- */

    function mergeEndpoints(data) {
      const owned = data?.endpoints ?? [];
      const relayed = (data?.peers ?? []).flatMap((peer) =>
        (peer.endpoints ?? []).map((endpoint) => ({
          ...endpoint,
          mine: false,
          ownerDeviceId: peer.deviceId,
          ownerName: peer.displayName,
          online: endpoint.online ?? (endpoint.lastProbe ? Boolean(endpoint.lastProbe.ok) : null),
        })),
      );
      return [...owned, ...relayed];
    }

    function shortGpu(gpu) {
      if (!gpu) return null;
      const cleaned = String(gpu)
        .replace(/\((?:rev|R|TM|C)[^)]*\)/gi, ' ')
        .replace(/\[?[0-9a-f]{4}:[0-9a-f]{4}\]?/gi, ' ')
        .replace(/\b(?:Inc|Corp|Corporation|Ltd|Co|Limited)\b\.?/gi, ' ')
        .replace(/\bTechnolog(?:y|ies)\b/gi, ' ')
        .replace(/\bNVIDIA\b|\bAMD\b|\bIntel\b/gi, ' ')
        .replace(/\b(?:Graphics|Display)\s+(?:Adapter|Controller|Family)\b/gi, ' ')
        .replace(/[\s,;]+/g, ' ')
        .trim();
      const words = [];
      for (const word of (cleaned || String(gpu)).split(' ')) {
        if (words.length && words[words.length - 1].toLowerCase() === word.toLowerCase()) continue;
        words.push(word);
      }
      const label = words.join(' ').trim() || String(gpu);
      return label.length > 24 ? `${label.slice(0, 23)}…` : label;
    }

    function statusChip(peer, t) {
      if (!peer.paired) return h(Chip, { tone: 'neutral' }, t('unpaired'));
      if (peer.canControlPeer) return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Dot, { tone: T.ok }), h('span', { style: { fontSize: 12, color: T.muted } }, t('ready')));
      if (peer.allowControl) return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Dot, { tone: T.warn }), h('span', { style: { fontSize: 12, color: T.muted } }, t('pending')));
      return h(Chip, { tone: 'neutral' }, t('unpaired'));
    }

    function CapsLine({ caps, t }) {
      if (!caps) return h('div', { style: { fontSize: 13, color: T.muted, paddingTop: 2 } }, t('capsEmpty'));
      const rows = [
        ['capsSystem', [caps.osLabel ?? caps.os, caps.arch, caps.kernel].filter(Boolean).join(' · ') || null],
        ['capsCpu', [caps.cpu || null, caps.cores ? `${caps.cores} ${t('cores')}` : null].filter(Boolean).join(' · ') || null],
        ['capsMem', caps.memGb ? `${caps.memGb} GB` : null],
        ['capsGpu', caps.gpu || null],
        ['capsDisk', caps.diskAvail ?? (caps.diskFreeGb ? `${caps.diskFreeGb} GB` : null)],
      ];
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        rows.map(([key, value]) => h(CapRow, { key, label: t(key), value: value || t('capsUnknown'), muted: !value })),
      );
    }

    function CapRow({ label, value, muted }) {
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '7px 0', borderTop: `1px solid ${LINE}` } },
        h('div', { style: { flex: '0 0 96px', fontSize: 13, color: T.muted } }, label),
        h('div', { style: { flex: '1 1 auto', minWidth: 0, fontSize: 13, color: muted ? T.muted : T.text, textAlign: 'right', wordBreak: 'break-word' } }, value),
      );
    }

    function ListView({ data, t, actions, onOpenDevice, onOpenEndpoint, onAddEndpoint, onOpenRemoteWorkspaces }) {
      const self = data?.self ?? {};
      const peers = data?.peers ?? [];
      const endpoints = mergeEndpoints(data);
      const same = peers.filter((peer) => peer.sameAccount);
      const caps = self.capabilities;
      const selfMeta = [caps?.osLabel ?? self.platform, caps?.arch, caps?.cores ? `${caps.cores} ${t('cores')}` : null, caps?.memGb ? `${caps.memGb} GB` : null, caps?.gpu]
        .filter(Boolean)
        .join(' · ');

      return h(
        'div',
        null,
        h(PageHeader, {
          title: t('panelTitle'),
          subtitle: t('panelSubtitle'),
          actions: actions ?? [],
        }),
        h(
          Section,
          { title: t('self'), first: true },
          h(ListRow, {
            icon: h(Icon.Device),
            title: self.displayName ?? '—',
            meta: selfMeta,
            right: [
              self.discoverable === false ? h(Chip, { key: 'h', tone: 'warn' }, t('discoveryHidden')) : null,
              h(Dot, { key: 'd', tone: self.signedIn ? T.ok : T.idle }),
              h('span', { key: 's', style: { fontSize: 12, color: T.muted } }, self.signedIn ? (self.accountLabel ?? t('signedIn')) : t('signedOut')),
            ],
            onClick: () => onOpenDevice('self'),
          }),
        ),
        h(
          Section,
          { title: t('devices') },
          same.length
            ? same.map((peer) =>
                h(ListRow, {
                  key: peer.deviceId,
                  icon: h(Icon.Device),
                  title: peer.displayName,
                  meta: [peer.address ? `${peer.address}:${peer.port}` : null, peer.capabilities?.osLabel ?? peer.platform, peer.capabilities?.cores ? `${peer.capabilities.cores} ${t('cores')}` : null, shortGpu(peer.capabilities?.gpu)]
                    .filter(Boolean)
                    .join(' · '),
                  right: statusChip(peer, t),
                  onClick: () => onOpenDevice(peer.deviceId),
                }),
              )
            : h(Empty, { title: t('noDevices'), hint: t('noDevicesHint') }),
        ),
        h(
          Section,
          { title: t('remoteWorkspaces'), hint: t('remoteWorkspaceHint') },
          h(ListRow, {
            icon: h(Icon.Mesh),
            title: t('remoteWorkspaces'),
            meta: t('remoteWorkspaceHint'),
            right: h(Icon.Chevron, { size: 14 }),
            onClick: onOpenRemoteWorkspaces,
          }),
        ),
        h(
          Section,
          { title: t('endpoints'), action: h(Button, { onClick: onAddEndpoint }, t('add')) },
          endpoints.length
            ? endpoints.map((endpoint) =>
                h(ListRow, {
                  key: endpoint.endpointId,
                  icon: h(Icon.Server),
                  title: endpoint.name || endpoint.host,
                  meta: [`${endpoint.host}:${endpoint.port}`, endpoint.user, shortGpu(endpoint.caps?.gpu), endpoint.mine ? null : `${t('via')}${endpoint.ownerName ?? ''}`].filter(Boolean).join(' · '),
                  right: [
                    endpoint.shared && endpoint.mine ? h(Chip, { key: 'sh', tone: 'neutral' }, t('sharedBadge')) : null,
                    h(Dot, { key: 'd', tone: endpoint.online === true ? T.ok : endpoint.online === false ? T.danger : T.idle }),
                    h(
                      'span',
                      { key: 's', style: { fontSize: 12, color: T.muted } },
                      endpoint.online === true ? t('online') : endpoint.online === false ? t('offline') : t('untested'),
                    ),
                  ],
                  onClick: () => onOpenEndpoint(endpoint.endpointId),
                }),
              )
            : h(Empty, { title: t('noEndpoints') }),
        ),
      );
    }

    function DeviceView({ data, deviceId, t, client, busy, withBusy, setView }) {
      const self = data?.self ?? {};
      const isSelf = deviceId === 'self' || deviceId === self.deviceId;
      const peer = (data?.peers ?? []).find((item) => item.deviceId === deviceId);
      const [draftName, setDraftName] = React.useState('');
      const [draftSettings, setDraftSettings] = React.useState({ port: '46800', discoveryPort: '46801' });
      const [editing, setEditing] = React.useState(false);

      React.useEffect(() => {
        setDraftName(self.displayName ?? '');
      }, [self.displayName]);
      React.useEffect(() => {
        if (!isSelf) return;
        setDraftSettings({
          port: String(self.settings?.port ?? 46800),
          discoveryPort: String(self.settings?.discoveryPort ?? 46801),
        });
      }, [isSelf, self.settings?.port, self.settings?.discoveryPort]);

      if (!isSelf && !peer) {
        return h('div', null, h(BackBar, { label: t('devices'), onBack: () => setView({ kind: 'list' }) }), h(Empty, { title: t('noDevices') }));
      }

      const caps = (isSelf ? self.capabilities : peer?.capabilities) ?? null;
      const title = isSelf ? self.displayName : peer.displayName;
      const portsValid = [draftSettings.port, draftSettings.discoveryPort].every((value) => {
        const port = Number(value);
        return Number.isInteger(port) && port >= 1 && port <= 65535;
      });

      return h(
        'div',
        null,
        h(BackBar, { label: isSelf ? t('panelTitle') : t('devices'), onBack: () => setView({ kind: 'list' }) }),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 } },
          h(IconTile, { size: 40 }, h(isSelf ? Icon.Device : Icon.Device, { size: 20 })),
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            editing
              ? h(
                  'div',
                  { style: { display: 'flex', gap: 8 } },
                  h('input', {
                    className: 'cm-input',
                    value: draftName,
                    style: { height: 30, maxWidth: 320 },
                    onChange: (event) => setDraftName(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') {
                        withBusy(() => client.rename(draftName)).then(() => setEditing(false));
                      }
                    },
                  }),
                  h(Button, { variant: 'primary', onClick: () => withBusy(() => client.rename(draftName)).then(() => setEditing(false)) }, t('save')),
                )
              : h('div', { style: { fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title ?? '—'),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 } },
              isSelf ? h(Chip, null, t('self')) : h(Chip, { tone: 'brand' }, t('sameAccount')),
              isSelf ? null : peer.paired ? h(Chip, null, t('paired')) : h(Chip, null, t('unpaired')),
              isSelf && editing ? null : isSelf ? h('button', { type: 'button', className: 'cm-link', onClick: () => setEditing(true) }, t('rename')) : null,
            ),
          ),
        ),
        h(
          'div',
          null,
          h(Field, { label: t('deviceId'), mono: true, first: true }, isSelf ? self.deviceId : peer.deviceId),
          isSelf ? null : h(Field, { label: t('lan'), mono: true }, `${peer.address}:${peer.port}`),
          isSelf ? null : h(Field, { label: t('platform') }, peer.platform ?? '—'),
          isSelf ? h(Field, { label: t('controlPort'), mono: true }, self.controlPlane ?? '—') : null,
          isSelf ? h(Field, { label: t('discoveryPort'), mono: true }, self.discoveryPort ?? '—') : null,
          h(Field, { label: t('account') }, (isSelf ? self.accountLabel : peer.accountLabel) ?? '—'),
          isSelf ? null : h(Field, { label: t('ssh'), mono: true }, peer.sshCommand ?? (peer.sshUser ? `ssh ${peer.sshUser}@${peer.address}` : '—')),
        ),
        h(Section, { title: t('capsTitle'), hint: caps ? null : t('capsEmpty') }, h(CapsLine, { caps, t })),
        isSelf
          ? null
          : h(
              Section,
              { title: t('permission') },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: `1px solid ${T.border1}` } },
                h('span', { style: { flex: 1, fontSize: 13, color: T.text } }, t('allowControl')),
                h(Toggle, {
                  checked: Boolean(peer.allowControl),
                  disabled: busy,
                  label: t('allowControl'),
                  onChange: (next) => withBusy(() => client.setTrust(peer.deviceId, next)),
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: `1px solid ${T.border1}` } },
                h('span', { style: { flex: 1, fontSize: 13, color: T.text } }, t('maxPermission')),
                h(
                  'select',
                  {
                    className: 'cm-input',
                    style: { width: 180 },
                    value: peer.maxPermissionMode ?? 'workspace-write',
                    disabled: busy,
                    onChange: (event) => withBusy(() => client.setTrust(peer.deviceId, peer.allowControl, event.target.value)),
                  },
                  Object.entries(t.dict.permissionOptions ?? {}).map(([value, label]) => h('option', { key: value, value }, label)),
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: `1px solid ${T.border1}` } },
                h('span', { style: { flex: 1, fontSize: 13, color: T.text } }, t('controlPeer')),
                h(
                  'span',
                  { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                  h(Dot, { tone: peer.canControlPeer ? T.ok : T.idle }),
                  h('span', { style: { fontSize: 12.5, color: T.muted } }, peer.canControlPeer ? t('allowed') : t('notAllowed')),
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 12 } },
                peer.paired
                  ? h(Button, { variant: 'danger', disabled: busy, onClick: () => withBusy(() => client.forget(peer.deviceId)) }, t('unpair'))
                  : h(Button, { disabled: busy, onClick: () => withBusy(() => client.pair(peer.deviceId)) }, t('pairNow')),
              ),
            ),
        isSelf
          ? h(
              Section,
              { title: t('settingsTitle'), hint: t('settingsHint') },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--cm-line)' } },
                h(
                  'span',
                  { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } },
                  h('span', { style: { fontSize: 13, color: T.text } }, t('allowDiscovery')),
                  h('span', { style: { fontSize: 12.5, color: DESC, lineHeight: '19px' } }, self.discoverable === false ? t('discoveryOff') : t('discoveryOn')),
                ),
                h(Toggle, {
                  checked: self.discoverable !== false,
                  disabled: busy,
                  label: t('allowDiscovery'),
                  onChange: (next) => withBusy(() => client.setDiscoverable(next)),
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 12, marginTop: 14 } },
                h(
                  'div',
                  { style: { flex: 1 } },
                  h('div', { style: { fontSize: 12.5, color: T.muted, marginBottom: 6 } }, t('controlPort')),
                  h('input', {
                    className: 'cm-input',
                    inputMode: 'numeric',
                    value: draftSettings.port,
                    disabled: busy,
                    onChange: (event) => setDraftSettings((previous) => ({ ...previous, port: event.target.value })),
                  }),
                ),
                h(
                  'div',
                  { style: { flex: 1 } },
                  h('div', { style: { fontSize: 12.5, color: T.muted, marginBottom: 6 } }, t('discoveryPort')),
                  h('input', {
                    className: 'cm-input',
                    inputMode: 'numeric',
                    value: draftSettings.discoveryPort,
                    disabled: busy,
                    onChange: (event) => setDraftSettings((previous) => ({ ...previous, discoveryPort: event.target.value })),
                  }),
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', marginTop: 14 } },
                h(Button, {
                  variant: 'primary',
                  disabled: busy || !portsValid,
                  onClick: () =>
                    withBusy(async () => {
                      const response = await client.saveSettings({
                        port: Number(draftSettings.port),
                        discoveryPort: Number(draftSettings.discoveryPort),
                      });
                      if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
                    }),
                }, t('save')),
              ),
            )
          : null,
        h(
          Section,
          { title: t('dispatchHintTitle') },
          h(Hint, null, isSelf ? t('dispatchHintSelf') : peer.canControlPeer ? t('dispatchHintReady') : t('dispatchHintPending')),
        ),
      );
    }

    function RemoteTaskView({ target, t, client, busy, withBusy, setView }) {
      const [prompt, setPrompt] = React.useState('');
      const [job, setJob] = React.useState(null);
      const [pollError, setPollError] = React.useState('');

      React.useEffect(() => {
        setPrompt('');
        setJob(null);
        setPollError('');
      }, [target?.deviceId, target?.workspaceId, target?.sessionId]);

      React.useEffect(() => {
        if (!job?.id || job.status !== 'running') return undefined;
        let cancelled = false;
        const poll = async () => {
          try {
            const response = await client.job({ jobDeviceId: target.deviceId, jobId: job.id });
            if (cancelled) return;
            if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
            if (response?.job) setJob(response.job);
          } catch (error) {
            if (!cancelled) setPollError(String(error?.message ?? error));
          }
        };
        const timer = setInterval(poll, 2_000);
        poll();
        return () => {
          cancelled = true;
          clearInterval(timer);
        };
      }, [job?.id, job?.status, target.deviceId, client, t]);

      const start = () =>
        withBusy(async () => {
          const response = await client.dispatch({
            deviceId: target.deviceId,
            prompt: prompt.trim(),
            cwd: target.cwd || undefined,
          });
          if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
          setPollError('');
          setJob({ id: response.jobId, status: 'running', target: { displayName: target.displayName }, finalText: '', events: [] });
        });

      const statusText = job ? (job.status === 'timed_out' ? t('timedOut') : t(job.status)) : '';
      return h(
        'div',
        null,
        h(BackBar, { label: t('backToWorkspaces'), onBack: () => setView({ kind: 'list' }) }),
        h(PageHeader, { title: t('remoteTaskTitle'), subtitle: t('remoteTaskHint') }),
        h(
          'div',
          { style: { marginTop: 18 } },
          h(Field, { label: t('targetDevice'), first: true }, target.displayName),
          h(Field, { label: t('targetWorkspace') }, target.workspaceTitle),
          target.sessionTitle ? h(Field, { label: t('relatedSession') }, target.sessionTitle) : null,
          target.cwd ? h(Field, { label: t('targetDirectory'), mono: true }, target.cwd) : null,
        ),
        !job
          ? h(
              Section,
              { title: t('dispatch') },
              h('textarea', {
                className: 'cm-input',
                placeholder: t('taskPrompt'),
                value: prompt,
                disabled: busy,
                onChange: (event) => setPrompt(event.target.value),
              }),
              h(
                'div',
                { style: { display: 'flex', marginTop: 12 } },
                h(Button, { variant: 'primary', disabled: busy || !prompt.trim(), onClick: start }, t('startTask')),
              ),
            )
          : h(
              Section,
              { title: t('jobResult'), hint: statusText, action: h(Button, { onClick: () => { setJob(null); setPrompt(''); } }, t('newTask')) },
              job.errorMessage || pollError ? h('div', { style: { color: T.danger, fontSize: 12.5, marginBottom: 10 } }, job.errorMessage || pollError) : null,
              job.finalText
                ? h('pre', { className: 'cm-mono', style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.65, padding: '12px 0', borderTop: `1px solid ${T.border1}` } }, job.finalText)
                : h(Hint, null, statusText),
              (job.events ?? []).length
                ? h(
                    'div',
                    { style: { marginTop: 12, borderTop: `1px solid ${T.border1}`, paddingTop: 8 } },
                    (job.events ?? []).slice(-8).map((event, index) =>
                      h('div', { key: `${event.seq ?? index}-${index}`, style: { fontSize: 12, color: T.muted, padding: '4px 0', overflowWrap: 'anywhere' } }, `${event.type}: ${event.text ?? ''}`),
                    ),
                  )
                : null,
            ),
      );
    }

    function RemoteConversationView({ target, t, client, setView }) {
      const [sessionId, setSessionId] = React.useState(target.sessionId ?? null);
      const [messages, setMessages] = React.useState([]);
      const [input, setInput] = React.useState('');
      const [running, setRunning] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [creating, setCreating] = React.useState(!target.sessionId);

      React.useEffect(() => {
        let cancelled = false;
        setSessionId(target.sessionId ?? null);
        setMessages([]);
        setInput('');
        setError('');
        setRunning(false);
        if (target.sessionId) {
          setCreating(false);
          return undefined;
        }
        setCreating(true);
        setBusy(true);
        (async () => {
          try {
            const response = await client.remoteSessionCreate({
              deviceId: target.deviceId,
              cwd: target.cwd || undefined,
              workspaceId: target.workspaceId?.includes(':ungrouped') ? undefined : target.workspaceId,
            });
            if (cancelled) return;
            if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
            setSessionId(response.sessionId);
          } catch (caught) {
            if (!cancelled) setError(String(caught?.message ?? caught));
          } finally {
            if (!cancelled) {
              setBusy(false);
              setCreating(false);
            }
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [target.deviceId, target.workspaceId, target.sessionId, client, t]);

      React.useEffect(() => {
        if (!sessionId) return undefined;
        let cancelled = false;
        const poll = async () => {
          try {
            const response = await client.remoteSessionMessages({ deviceId: target.deviceId, sessionId, maxMessages: 50 });
            if (cancelled) return;
            if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
            setMessages(response.messages ?? []);
            setRunning(Boolean(response.running));
            setError('');
          } catch (caught) {
            if (!cancelled) setError(String(caught?.message ?? caught));
          }
        };
        poll();
        const timer = setInterval(poll, 2_000);
        return () => {
          cancelled = true;
          clearInterval(timer);
        };
      }, [sessionId, target.deviceId, client, t]);

      const send = async () => {
        const text = input.trim();
        if (!text || !sessionId || busy) return;
        setBusy(true);
        try {
          const response = await client.remoteSessionPrompt({
            deviceId: target.deviceId,
            sessionId,
            text,
            requestId: globalThis.crypto?.randomUUID?.(),
          });
          if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
          setInput('');
          setError('');
        } catch (caught) {
          setError(String(caught?.message ?? caught));
        } finally {
          setBusy(false);
        }
      };

      const cancel = async () => {
        if (!sessionId || busy) return;
        setBusy(true);
        try {
          const response = await client.remoteSessionCancel({ deviceId: target.deviceId, sessionId });
          if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
        } catch (caught) {
          setError(String(caught?.message ?? caught));
        } finally {
          setBusy(false);
        }
      };

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h(BackBar, { label: t('remoteWorkspaces'), onBack: () => setView({ kind: 'remoteWorkspaces' }) }),
        h(PageHeader, {
          title: target.sessionTitle || target.workspaceTitle || t('remoteConversation'),
          subtitle: `${target.displayName} · ${target.cwd || target.workspaceTitle}`,
          actions: running ? h(Button, { disabled: busy, onClick: cancel }, t('stop')) : null,
        }),
        error ? h('div', { style: { color: T.danger, fontSize: 12.5, margin: '10px 0' } }, error) : null,
        creating ? h(Hint, null, t('creatingConversation')) : null,
        h(
          'div',
          { className: 'cm-scroll', style: { flex: 1, minHeight: 180, maxHeight: '52vh', overflowY: 'auto', marginTop: 16, padding: '8px 0', borderTop: `1px solid ${T.border1}`, borderBottom: `1px solid ${T.border1}` } },
          !creating && !messages.length ? h(Empty, { title: t('noMessages') }) : null,
          messages.map((message) =>
            h(
              'div',
              { key: message.seq, style: { padding: '10px 4px', borderBottom: `1px solid ${T.border1}` } },
              h('div', { style: { fontSize: 12, fontWeight: 500, color: message.role === 'user' ? T.brand : T.muted, marginBottom: 5 } }, message.role === 'user' ? t('you') : t('agent')),
              h('pre', { className: 'cm-mono', style: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: T.text, lineHeight: 1.65 } }, message.text || '…'),
            ),
          ),
        ),
        h(
          'div',
          { style: { marginTop: 12 } },
          h('textarea', {
            className: 'cm-input',
            placeholder: t('messagePlaceholder'),
            value: input,
            disabled: busy || creating || !sessionId,
            onChange: (event) => setInput(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            },
          }),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 } },
            h(Button, { variant: 'primary', disabled: busy || creating || !sessionId || !input.trim(), onClick: send }, t('send')),
            running ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted } }, h(Dot, { tone: T.ok }), t('running')) : null,
          ),
        ),
      );
    }

    function EndpointView({ data, endpointId, t, client, busy, withBusy, setView }) {
      const endpoint = mergeEndpoints(data).find((item) => item.endpointId === endpointId);
      const [probeOverride, setProbe] = React.useState(null);
      const [command, setCommand] = React.useState('');
      const [result, setResult] = React.useState(null);
      const [password, setPassword] = React.useState('');

      const probe = probeOverride ?? endpoint?.lastProbe ?? null;
      const online = endpoint?.online ?? (probe ? Boolean(probe.ok) : null);

      if (!endpoint) {
        return h('div', null, h(BackBar, { label: t('endpoints'), onBack: () => setView({ kind: 'list' }) }), h(Empty, { title: t('noEndpoints') }));
      }

      const caps = endpoint.caps ?? probe?.caps ?? null;

      return h(
        'div',
        null,
        h(BackBar, { label: t('endpoints'), onBack: () => setView({ kind: 'list' }) }),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 } },
          h(IconTile, { size: 40 }, h(Icon.Server, { size: 20 })),
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, endpoint.name || endpoint.host),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 } },
              h(Dot, { tone: online === true ? T.ok : online === false ? T.danger : T.idle }),
              h('span', { style: { fontSize: 12.5, color: T.muted } }, online === true ? t('online') : online === false ? t('offline') : t('untested')),
              probe?.at ? h('span', { style: { fontSize: 12.5, color: DESC } }, `${ago(probe.at, t)}${probe.ms ? ` · ${probe.ms}ms` : ''}`) : null,
              h('span', { style: { fontSize: 12.5, color: DESC } }, `${t('sshEndpoint')} · ${endpoint.mine ? t('ownerSelf') : `${t('via')}${endpoint.ownerName ?? ''}`}`),
            ),
          ),
          h(Button, {
            disabled: busy,
            onClick: () =>
              withBusy(async () => {
                const response = await client.endpointTest(endpoint.endpointId);
                if (response?.ok === false) throw new Error(response?.error?.message ?? t('unreachable'));
                setProbe(response.probe ?? null);
              }),
          }, busy ? t('testing') : t('test')),
        ),
        h(
          'div',
          null,
          h(Field, { label: t('host'), mono: true, first: true }, endpoint.host),
          h(Field, { label: t('port'), mono: true }, String(endpoint.port ?? 22)),
          h(Field, { label: t('user'), mono: true }, endpoint.user ?? '—'),
          h(Field, { label: t('ownerNode') }, endpoint.mine ? t('ownerSelf') : endpoint.ownerName ?? '—'),
          h(Field, { label: t('ssh'), mono: true }, endpoint.ssh ?? `ssh ${endpoint.user ?? ''}@${endpoint.host}`),
          h(
            Field,
            { label: t('authTitle') },
            !endpoint.mine
              ? t('authManaged')
              : endpoint.hasPassword
                ? t('authPassword')
                : endpoint.hasKey
                  ? `${t('authKey')} · ${endpoint.keyPath ?? endpoint.key ?? ''}`
                  : `${t('authKey')} · ${t('authDefaultKey')}`,
          ),
        ),
        endpoint.mine
          ? h(
              Section,
              { title: t('password') },
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 4 } },
                h('input', {
                  className: 'cm-input',
                  type: 'password',
                  autoComplete: 'new-password',
                  placeholder: t('passwordHint'),
                  value: password,
                  style: { flex: 1 },
                  onChange: (event) => setPassword(event.target.value),
                }),
                h(
                  Button,
                  {
                    variant: 'primary',
                    disabled: busy || !password.trim(),
                    onClick: () =>
                      withBusy(async () => {
                        const response = await client.endpointSave({
                          endpointId: endpoint.endpointId,
                          host: endpoint.host,
                          user: endpoint.user,
                          port: endpoint.port,
                          keyPath: endpoint.keyPath ?? endpoint.key ?? '',
                          password,
                        });
                        if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
                        setPassword('');
                        setProbe(null);
                      }),
                  },
                  t('save'),
                ),
              ),
              h(Hint, null, t('passwordOnly')),
            )
          : null,
        endpoint.mine
          ? h(
              Section,
              { title: t('shareTitle') },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4, paddingTop: 10, borderTop: `1px solid ${LINE}` } },
                h(
                  'div',
                  { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { fontSize: 14, color: T.text, lineHeight: '20px' } }, t('shareEndpoint')),
                  h('div', { style: { fontSize: 12.5, color: T.muted, lineHeight: '18px', marginTop: 2 } }, endpoint.shared ? t('shareHintOn') : t('shareHintOff')),
                ),
                h(Toggle, {
                  checked: Boolean(endpoint.shared),
                  label: t('shareEndpoint'),
                  disabled: busy,
                  onChange: (next) =>
                    withBusy(async () => {
                      const response = await client.setEndpointShared(endpoint.endpointId, next);
                      if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
                    }),
                }),
              ),
            )
          : null,
        probe && probe.ok === false && probe.error
          ? h('div', { style: { marginTop: 10, fontSize: 12.5, color: T.danger, lineHeight: '19px', wordBreak: 'break-word' } }, probe.error)
          : null,
        h(
          Section,
          { title: t('capsTitle') },
          h(CapsLine, { caps, t }),
        ),
        h(
          Section,
          { title: t('remoteCommand') },
          h(
            'div',
            { style: { display: 'flex', gap: 8 } },
            h('input', {
              className: 'cm-input',
              placeholder: t('commandPlaceholder'),
              value: command,
              style: { flex: 1 },
              onChange: (event) => setCommand(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && command.trim() && !busy) {
                  withBusy(async () => {
                    const response = await client.endpointRun(endpoint.endpointId, command.trim());
                    if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
                    setResult(response.result ?? response);
                  });
                }
              },
            }),
            h(Button, {
              disabled: busy || !command.trim(),
              onClick: () =>
                withBusy(async () => {
                  const response = await client.endpointRun(endpoint.endpointId, command.trim());
                  if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
                  setResult(response.result ?? response);
                }),
            }, t('run')),
          ),
          result
            ? h(
                'div',
                { style: { marginTop: 10, border: `1px solid ${T.border1}`, borderRadius: 10, padding: 12 } },
                h('div', { style: { display: 'flex', gap: 12, fontSize: 12, color: T.muted, marginBottom: 6 } }, h('span', null, t('output')), h('span', { style: { marginLeft: 'auto', fontFamily: T.mono } }, `${t('exitCode')} ${result.code ?? '—'}`)),
                h('pre', { className: 'cm-mono', style: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: T.text, lineHeight: 1.6 } }, String(result.stdout || result.stderr || '').slice(0, 4000) || '—'),
              )
            : null,
        ),
        h(
          Section,
          { title: t('dispatchHintTitle') },
          h(Hint, null, t('endpointDispatchHint')),
        ),
        h(
          'div',
          { style: { marginTop: 28 } },
          h(Button, { variant: 'danger', disabled: busy, onClick: () => withBusy(() => client.endpointRemove(endpoint.endpointId)).then(() => setView({ kind: 'list' })) }, t('deleteEndpoint')),
        ),
      );
    }

    function AddEndpointView({ t, client, busy, withBusy, setView }) {
      const [draft, setDraft] = React.useState({ name: '', host: '', port: '22', user: '', keyPath: '', password: '' });
      const set = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }));
      const submit = () =>
        withBusy(async () => {
          const response = await client.endpointSave({
            name: draft.name.trim() || draft.host.trim(),
            host: draft.host.trim(),
            port: Number(draft.port) || 22,
            user: draft.user.trim(),
            keyPath: draft.keyPath.trim() || undefined,
            password: draft.password || undefined,
          });
          if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
          setView({ kind: 'endpoint', id: response?.endpoint?.endpointId });
        });

      const formRow = (label, input, hint) =>
        h(
          'div',
          { style: { marginTop: 14 } },
          h('div', { style: { fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 6 } }, label, hint ? h('span', { style: { color: T.muted, fontWeight: 400 } }, `  ${hint}`) : null),
          input,
        );

      return h(
        'div',
        null,
        h(BackBar, { label: t('endpoints'), onBack: () => setView({ kind: 'list' }) }),
        h(PageHeader, { title: t('newEndpoint') }),
        h(
          'div',
          { style: { maxWidth: 560 } },
          formRow(t('name'), h('input', { className: 'cm-input', value: draft.name, onChange: set('name'), placeholder: 'GPU 服务器' })),
          formRow(t('host'), h('input', { className: 'cm-input', value: draft.host, onChange: set('host'), placeholder: '192.168.1.20' })),
          formRow(t('port'), h('input', { className: 'cm-input', value: draft.port, onChange: set('port'), placeholder: '22' })),
          formRow(t('user'), h('input', { className: 'cm-input', value: draft.user, onChange: set('user'), placeholder: 'root' })),
          formRow(t('key'), h('input', { className: 'cm-input', value: draft.keyPath, onChange: set('keyPath'), placeholder: '~/.ssh/id_ed25519' }), `(${t('optional')})`),
          formRow(
            t('password'),
            h('input', { className: 'cm-input', type: 'password', value: draft.password, onChange: set('password'), placeholder: t('passwordHint'), autoComplete: 'new-password' }),
            `(${t('optional')})`,
          ),
          h('div', { style: { marginTop: 8, fontSize: 12, color: T.muted, lineHeight: 1.7 } }, t('passwordOnly')),
          h(
            'div',
            { style: { display: 'flex', gap: 8, marginTop: 22 } },
            h(Button, { variant: 'primary', disabled: busy || !draft.host.trim() || !draft.user.trim(), onClick: submit }, t('save')),
            h(Button, { onClick: () => setView({ kind: 'list' }) }, t('cancel')),
          ),
        ),
      );
    }

    function RemoteWorkspaces({ wide, t, openMesh }) {
      const STORAGE_KEY = 'claw-mesh.remote-workspaces.collapsed';
      const [collapsed, setCollapsed] = React.useState(() => {
        try {
          return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
          return false;
        }
      });
      const [expandedDevices, setExpandedDevices] = React.useState({});
      const [data, setData] = React.useState({ devices: [] });
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');

      const load = React.useCallback(async () => {
        setLoading(true);
        try {
          const response = await callMesh('remoteWorkspaces');
          if (response?.ok === false) throw new Error(response?.error?.message ?? t('failed'));
          setData(response ?? { devices: [] });
          setError('');
        } catch (caught) {
          setError(String(caught?.message ?? caught));
        } finally {
          setLoading(false);
        }
      }, [t]);

      React.useEffect(() => {
        try {
          localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        } catch {
          /* Folding still works when storage is unavailable. */
        }
      }, [collapsed]);

      React.useEffect(() => {
        if (!wide || collapsed) return undefined;
        load();
        const timer = setInterval(load, 15_000);
        return () => clearInterval(timer);
      }, [wide, collapsed, load]);

      const openTask = (device, workspace, session = null) => {
        const detail = {
          deviceId: device.deviceId,
          displayName: device.displayName,
          workspaceId: workspace.id,
          workspaceTitle: workspace.title,
          cwd: session?.cwd || workspace.path || '',
          sessionId: session?.id ?? null,
          sessionTitle: session?.title ?? '',
        };
        window.dispatchEvent(new CustomEvent('claw-mesh:open-remote-conversation', { detail }));
        openMesh();
      };

      if (!wide) {
        return h('button', { type: 'button', className: 'cm-row', title: t('remoteWorkspaces'), onClick: openMesh }, h(IconTile, null, h(Icon.Mesh)));
      }

      const devices = data?.devices ?? [];
      return h(
        'div',
        { style: { borderTop: `1px solid ${T.border1}`, padding: '8px 8px 4px', maxHeight: '42vh', overflowY: 'auto' }, className: 'cm-scroll' },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          h(
            'button',
            {
              type: 'button',
              onClick: () => setCollapsed((value) => !value),
              'aria-expanded': !collapsed,
              style: { display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: T.text, padding: '6px 0', cursor: 'pointer', textAlign: 'left' },
            },
            h('span', { style: { display: 'inline-flex', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 120ms ease' } }, h(Icon.Chevron, { size: 12 })),
            h('span', { style: { fontSize: 12.5, fontWeight: 500 } }, t('remoteWorkspaces')),
          ),
          h(Button, { disabled: loading, onClick: load, title: t('refresh') }, loading ? t('loading') : t('refresh')),
        ),
        collapsed
          ? null
          : h(
              'div',
              null,
              h('div', { style: { fontSize: 11.5, color: DESC, lineHeight: 1.5, padding: '2px 0 8px' } }, t('remoteWorkspaceHint')),
              error ? h('div', { style: { color: T.danger, fontSize: 12, padding: '4px 0' } }, error) : null,
              !devices.length && !loading ? h(Empty, { title: t('noDevicesOnline') }) : null,
              devices.map((device) => {
                const expanded = Boolean(expandedDevices[device.deviceId]);
                const ungroupedWorkspace = device.ungroupedSessions?.length
                  ? { id: `${device.deviceId}:ungrouped`, title: t('ungroupedSessions'), path: '', sessions: device.ungroupedSessions }
                  : null;
                const workspaces = ungroupedWorkspace ? [...device.workspaces, ungroupedWorkspace] : device.workspaces;
                return h(
                  'div',
                  { key: device.deviceId, style: { marginBottom: 4 } },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'cm-row',
                      style: { width: '100%', margin: 0, padding: '7px 4px' },
                      onClick: () => setExpandedDevices((previous) => ({ ...previous, [device.deviceId]: !expanded })),
                      'aria-expanded': expanded,
                    },
                    h('span', { style: { display: 'inline-flex', transform: expanded ? 'none' : 'rotate(-90deg)' } }, h(Icon.Chevron, { size: 12 })),
                    h('span', { style: { flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, device.displayName),
                    h(Dot, { tone: device.online ? T.ok : T.idle }),
                  ),
                  expanded
                    ? h(
                        'div',
                        { style: { marginLeft: 12, borderLeft: `1px solid ${T.border1}`, paddingLeft: 6 } },
                        device.error ? h('div', { style: { color: T.danger, fontSize: 11.5, padding: '4px 6px' } }, device.error) : null,
                        !workspaces.length && !device.error ? h('div', { style: { color: T.muted, fontSize: 11.5, padding: '5px 6px' } }, t('noWorkspaces')) : null,
                        workspaces.map((workspace) =>
                          h(
                            'div',
                            { key: workspace.id },
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'cm-row',
                                style: { width: '100%', margin: 0, padding: '6px 4px' },
                                onClick: () => openTask(device, workspace),
                                title: workspace.path || workspace.title,
                              },
                              h(Icon.Server, { size: 13 }),
                              h('span', { style: { flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, workspace.title),
                            ),
                            (workspace.sessions ?? []).map((session) =>
                              h(
                                'button',
                                {
                                  type: 'button',
                                  key: session.id,
                                  className: 'cm-row',
                                  style: { width: 'calc(100% - 12px)', margin: '0 0 0 12px', padding: '5px 4px' },
                                  onClick: () => openTask(device, workspace, session),
                                  title: session.title,
                                },
                                h('span', { style: { width: 13, textAlign: 'center', color: session.running ? T.ok : T.muted } }, '·'),
                                h('span', { style: { flex: 1, minWidth: 0, fontSize: 11.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, session.title),
                              ),
                            ),
                          ),
                        ),
                      )
                    : null,
                );
              }),
            ),
      );
    }

    /* ---------------------------------------------------------------- */
    /* panel                                                            */
    /* ---------------------------------------------------------------- */

    function ClawMeshPanel({ localeService }) {
      const [locale, setLocale] = React.useState(() => {
        try {
          return localeService?.getLocale?.() ?? 'zh-CN';
        } catch {
          return 'zh-CN';
        }
      }, []);
      const t = React.useMemo(() => makeTranslator(locale), [locale]);

      React.useEffect(() => {
        reportClient('panel-mounted', { locale });
        if (typeof localeService?.subscribe !== 'function') return undefined;
        return localeService.subscribe((next) => setLocale(next));
      }, []);

      const client = React.useMemo(
        () => ({
          status: () => callMesh('status'),
          refresh: () => callMesh('refresh'),
          dispatch: (payload) => callMesh('dispatch', payload),
          job: (payload) => callMesh('job', payload),
          remoteSessionMessages: (payload) => callMesh('remoteSessionMessages', payload),
          remoteSessionCreate: (payload) => callMesh('remoteSessionCreate', payload),
          remoteSessionPrompt: (payload) => callMesh('remoteSessionPrompt', payload),
          remoteSessionCancel: (payload) => callMesh('remoteSessionCancel', payload),
          setTrust: (deviceId, allowControl, maxPermissionMode) => callMesh('setTrust', { deviceId, allowControl, maxPermissionMode }),
          pair: (deviceId) => callMesh('pair', { deviceId }),
          forget: (deviceId) => callMesh('forget', { deviceId }),
          rename: (displayName) => callMesh('rename', { displayName }),
          setDiscoverable: (discoverable) => callMesh('setDiscoverable', { discoverable }),
          saveSettings: (settings) => callMesh('saveSettings', { settings }),
          endpointSave: (endpoint) => callMesh('endpointSave', { endpoint }),
          endpointRemove: (endpointId) => callMesh('endpointRemove', { endpointId }),
          setEndpointShared: (endpointId, shared) => callMesh('setEndpointShared', { endpointId, shared }),
          endpointTest: (endpointId) => callMesh('endpointTest', { endpointId }),
          endpointRun: (endpointId, command) => callMesh('endpointRun', { endpointId, command }),
        }),
        [],
      );

      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [view, setView] = React.useState({ kind: 'list' });

      React.useEffect(() => {
        const openRemoteConversation = (event) => {
          if (event?.detail) setView({ kind: 'remoteConversation', target: event.detail });
        };
        window.addEventListener('claw-mesh:open-remote-conversation', openRemoteConversation);
        return () => window.removeEventListener('claw-mesh:open-remote-conversation', openRemoteConversation);
      }, []);

      const load = React.useCallback(async () => {
        try {
          const result = await client.status();
          if (result?.ok === false) {
            setError(result?.error?.message ?? t('failed'));
            return;
          }
          setData(result);
          setError('');
        } catch (caught) {
          setError(String(caught?.message ?? caught));
        }
      }, [client, t]);

      React.useEffect(() => {
        load();
        const timer = setInterval(() => {
          if (view.kind === 'list' || view.kind === 'device' || view.kind === 'endpoint') load();
        }, 4000);
        return () => clearInterval(timer);
      }, [load, view.kind]);

      const withBusy = React.useCallback(
        async (fn) => {
          setBusy(true);
          try {
            const result = await fn();
            await load();
            return result;
          } catch (caught) {
            setError(String(caught?.message ?? caught));
            return null;
          } finally {
            setBusy(false);
          }
        },
        [load],
      );

      const scrollRef = React.useRef(null);
      React.useEffect(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = 0;
      }, [view.kind, view.id]);

      const actions = [
        h(Button, { key: 'r', onClick: () => withBusy(() => client.refresh()), disabled: busy }, busy ? t('loading') : t('refresh')),
      ];

      let body;
      if (view.kind === 'remoteWorkspaces') {
        body = h(
          'div',
          null,
          h(BackBar, { label: t('panelTitle'), onBack: () => setView({ kind: 'list' }) }),
          h(PageHeader, { title: t('remoteWorkspaces'), subtitle: t('remoteWorkspaceHint') }),
          h(RemoteWorkspaces, { wide: true, t, openMesh: () => {} }),
        );
      } else if (view.kind === 'remoteConversation') body = h(RemoteConversationView, { target: view.target, t, client, setView });
      else if (view.kind === 'remoteTask') body = h(RemoteTaskView, { target: view.target, t, client, busy, withBusy, setView });
      else if (view.kind === 'add') body = h(AddEndpointView, { t, client, busy, withBusy, setView });
      else if (view.kind === 'endpoint') body = h(EndpointView, { data, endpointId: view.id, t, client, busy, withBusy, setView });
      else if (view.kind === 'device') body = h(DeviceView, { data, deviceId: view.id, t, client, busy, withBusy, setView });
      else
        body = h(ListView, {
          data,
          t,
          actions,
          onOpenDevice: (id) => setView({ kind: 'device', id }),
          onOpenEndpoint: (id) => setView({ kind: 'endpoint', id }),
          onAddEndpoint: () => setView({ kind: 'add' }),
          onOpenRemoteWorkspaces: () => setView({ kind: 'remoteWorkspaces' }),
        });

      return h(
        'div',
        { ref: scrollRef, className: 'cm-page cm-scroll', style: { background: T.bg, color: T.text, height: '100%', overflow: 'auto', boxSizing: 'border-box' } },
        h('style', { key: 'css' }, `${PAGE_VARS}\n${PAGE_CSS}`),
        h(
          'div',
          { className: 'cm-col' },
          error ? h('div', { style: { margin: '10px 0', fontSize: 12.5, color: T.danger } }, `${t('errorPrefix')}: ${error}`) : null,
          body,
        ),
      );
    }

    function renderPanel(props) {
      try {
        return h(ClawMeshPanel, props);
      } catch (error) {
        reportClient('panel-error', { message: String(error?.message ?? error) });
        return null;
      }
    }

    /* ---------------------------------------------------------------- */
    /* sidebar entry                                                    */
    /* ---------------------------------------------------------------- */

    function SidebarIcon({ size = 18, active }) {
      return h(
        'span',
        { style: { width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: active ? 'var(--dsw-alias-label-primary)' : 'inherit' } },
        h(Icon.Mesh, { size }),
      );
    }

    function renderSidebarIcon(props) {
      try {
        return h(SidebarIcon, props);
      } catch (error) {
        reportClient('icon-error', { message: String(error?.message ?? error) });
        return null;
      }
    }

    /* ---------------------------------------------------------------- */
    /* registration                                                     */
    /* ---------------------------------------------------------------- */

    return {
      inject: ['slots', 'layout', 'locale'],
      apply(ctx) {
        reportClient('client-ready', { version: '0.1.0', locale: typeof ctx.locale?.getLocale === 'function' ? ctx.locale.getLocale() : 'unknown' });
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            ctx.locale.register(NS, { zh: STRINGS['zh-CN'], 'zh-CN': STRINGS['zh-CN'], en: STRINGS.en });
          }
        } catch (error) {
          // A hot reload re-runs apply() against the same namespace; that collision
          // is expected and harmless because the panel translates through STRINGS.
          const message = String(error?.message ?? error);
          if (!message.includes('already has locale')) reportClient('locale-register-failed', { message });
        }
        const t = () => makeTranslator(typeof ctx.locale?.getLocale === 'function' ? ctx.locale.getLocale() : 'zh-CN');

        ctx.slots.inject('main', () => {
          const stopPage = ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => ({ localeService: ctx.locale }),
            },
            renderPanel,
          );
          const stopIcon = ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 30,
                label: () => t().dict.sidebar,
                locale: NS,
              },
              renderSidebarIcon,
            ),
          );
          const stopAction = ctx.slots.inject('plugins.detail.actions', () =>
            ctx.slots.register(
              {
                name: 'plugins.detail.actions',
                id: `${PANEL_ID}-open`,
                order: 30,
                label: () => t().dict.panelTitle,
              },
              function OpenMeshAction() {
                return h(Button, { onClick: () => ctx.layout.selectPanel(PANEL_ID) }, t().dict.sidebar);
              },
            ),
          );
          const stopRemoteWorkspaces = ctx.slots.inject('sidebar.footer.action', () =>
            ctx.slots.register(
              {
                name: 'sidebar.footer.action',
                id: `${PANEL_ID}-remote-workspaces`,
                order: 40,
                label: () => t().dict.remoteWorkspaces,
                inject: () => ({ openMesh: () => ctx.layout.selectPanel(PANEL_ID) }),
              },
              RemoteWorkspaces,
            ),
          );
          return () => {
            try {
              stopRemoteWorkspaces?.();
            } catch {}
            try {
              stopAction?.();
            } catch {}
            try {
              stopIcon?.();
            } catch {}
            try {
              stopPage?.();
            } catch {}
          };
        });
      },
    };
  },
});
