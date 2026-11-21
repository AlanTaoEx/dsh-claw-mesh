# Claw-Mesh 使用手册

Claw-Mesh 在 DeepSeek Harness 侧边栏增加一个 **设备连接** 控制台，把同一网段里登录同一 DeepSeek
账号的多台 DSH 设备连成一张可以互相调度的网；装不了 DSH 的机器（Linux 服务器、NAS、树莓派）以
SSH 设备的形式挂到注册它的那台机器下面。

## 1 两类参与者

| 类型 | 需要什么 | 谁能操作它 | 任务怎么跑 |
| --- | --- | --- | --- |
| DSH 节点（Windows / macOS） | 装 DSH 并登录同一账号 | 本机用户逐台授权 | 对端执行 `dsh --profile headless`，等于让 Agent 互相委托 |
| SSH 设备（Linux 服务器、NAS…） | 注册机可 SSH 登录 | 注册机自己，外加被共享的已授权节点 | 注册机用 `ssh` 执行，或由注册机上的 Agent 转述 |

DSH 节点是对等关系；SSH 设备不是节点，它挂在某一台注册机下面，由那台机器代连。

## 2 安装

把仓库目录放到任意位置，注册进桌面 profile：

```bash
# macOS
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js" \
  plugin --profile desktop add link:/path/to/dsh-claw-mesh
```

```powershell
# Windows
$env:ELECTRON_RUN_AS_NODE = "1"
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe" `
  "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js" `
  plugin --profile desktop add link:C:\path\to\dsh-claw-mesh
```

`dsh plugin` 只是转发 pnpm，会自动把 `dsh-claw-mesh` 写进 profile 的依赖与 bundle 列表，不需要手改
JSON；`remove` 时同样会摘掉。装完重启 DSH，或在 **插件** 页把这一项关开一次。

卸载：

```bash
# macOS
... plugin --profile desktop remove dsh-claw-mesh
```

## 3 控制台

侧边栏 **设备连接** 是一个单列页面，四段：

| 分区 | 内容 |
| --- | --- |
| 本机 | 设备 ID、控制端口、发现端口、账号、硬件画像、发现开关 |
| 在线设备 | 同账号节点，右侧是状态：可调度 / 待授权 / 未配对 |
| 外部设备（SSH） | 已注册的 SSH 设备，右侧是 在线 / 离线 / 未测试 |
| 其他账号设备 | 已移除：账号不同的 DSH 不会出现在列表里 |

点任意一行进入详情，左上角的返回箭头回到列表。列表右上角仅保留**刷新**（立即重读状态）。
**本机**详情中的**设置**包含控制端口、发现端口和可发现开关，端口保存后立即生效。

页面宽度与 DSH 原生页面一致：正文列 960px 居中，窄窗口下自动收窄；拉宽窗口时行与右上角按钮会
一起移动，超过列宽后居中停住。

## 4 权限

- **允许该设备控制本机**：默认关闭。打开后对方才能把任务派过来。只有人能在界面上切换，Agent
  没有这个能力。
- **本机控制对方**：只读状态。反方向要由对方机器上的人授权，本机无法自行放开。
- **允许的最高权限**：每个对端独立设置，默认 `workspace-write`。远端任务可以请求更低权限，
  但不能超过这个上限；远端传入的审批策略也不会覆盖本机设置。
- **配对**：交换一把随机的 32 字节密钥，之后的每次请求都用它做 HMAC-SHA256 签名。解除配对会
  删掉这把密钥，两个方向同时失效。

授权是「逐设备、逐方向」的：A 授权 B，不等于 B 授权 A；A 能控制 B，也不等于 C 能让 A 转发到 B。

## 5 在会话里调度

面板不再放调度输入框。插件给每个会话注入一段设备清单，所以直接在对话里说就行：

- 「让 Build Server 跑一下 `git status`，把结果贴回来」
- 「挑一台有 NVIDIA 显卡的机器，跑 `nvidia-smi -L`」
- 「在本地把测试跑一遍」

Agent 会先调用 `mesh_list_devices` 看现状，再调用 `mesh_dispatch`：

| 参数 | 说明 |
| --- | --- |
| `target` | 设备 ID、`self`、或 SSH 设备 ID；省略时按 `requires` 挑一台 |
| `prompt` | 自然语言任务，对端 Agent 收到的就是它 |
| `requestId` | 可选幂等键；相同参数重试返回原任务，相同 ID 对应不同内容会被拒绝 |
| `requires` | `os` / `gpu` / `minCores` / `minMemGb` / `tag`，用于按能力选机器 |
| `permissionMode` | `read-only` / `workspace-write` / `danger-full-access`，实际以对端授权为准 |
| `waitMs` | 等待上限，超时后返回 `jobId`，可再用 `mesh_job_status` 查 |

任务在对端是**一次性 Agent**：它能读、改那台机器上的文件，执行完把结论回传，不会残留会话。
默认单条任务 30 分钟超时。

### 远端工作区

侧栏底部的“其他设备的工作区”按设备分组显示已授权 DSH 的工作区和会话标题。整个区域支持折叠，
每台设备也可以单独展开或收起；折叠状态会保留在本机。数据只在展开时按需获取，并每 15 秒刷新，
不会通过 UDP 广播。

点击已有会话会打开真实的远端会话面板，读取最近的用户和 Agent 消息，并可向该会话发送 prompt 或停止当前回合。
点击空白工作区会在对应目录创建正式 DSH 会话；消息每两秒刷新，文件和历史始终保留在目标设备。
只有已授权本机控制的设备会出现在列表中，查询失败时保留设备分组并显示错误。

## 6 SSH 设备

**外部设备（SSH） → 添加**，填名称、主机、端口、用户、私钥路径或密码：

- **认证方式**：填了密码走密码认证（内部用 `SSH_ASKPASS` 辅助脚本，密码不进命令行），否则用
  密钥。私钥留空表示用默认密钥（`~/.ssh/id_*`）。
- **密码存在哪**：注册机的 `~/.dsh/claw-mesh/state.json` 里，不广播、不发给其他节点；详情页只
  显示「是否已设置」。
- **测试连接**：执行一段探测脚本，回收系统、核心数、内存、磁盘、显卡，顺便确认连通性。之后每
  60 秒自动重探一次，列表右侧的在线状态就来自它。
- **共享**：关闭时只有注册机能用；打开后，所有已授权控制注册机的节点都能用这台设备，但仍然是
  「注册机去连」，其他节点只是把任务转给它。

SSH 设备的任务有两种用法：详情页的 **远程命令** 跑一条精确命令；或者直接在会话里描述任务，让
Agent 通过 `mesh_ssh_run` / `mesh_dispatch` 转给注册机执行。

## 7 硬件画像

每台 DSH 节点启动后扫描一次本机，结果随发现广播共享，并在列表中显示；SSH 设备由探测脚本采集。

| 字段 | 来源 |
| --- | --- |
| 系统 | `os.release()` / `os.arch()`；Windows 用 `Get-CimInstance` |
| 处理器 | `os.cpus()[0].model` + 核心数 |
| 内存 | `os.totalmem()` |
| 显卡 | macOS `system_profiler`；Windows `Win32_VideoController`；Linux `lspci` |
| 可用磁盘 | `statfs` 的可用块数；Linux 回退 `df -k` |

多块显卡时优先挑真实独显（NVIDIA / Radeon / Apple M 系列），虚拟显示适配器（Virtual Display、
Parsec、VMware 等）排在后面。

## 8 网络与端口

| 端口 | 用途 | 谁能访问 |
| --- | --- | --- |
| UDP `46801` | 发现广播 | 局域网 |
| TCP `46800` | 节点控制面：`/mesh/info`、`/mesh/pair`、`/mesh/control` | 局域网，按对签名 |
| TCP `46810` | 本机界面面：`/ui/*` | 仅回环 |

端口被占用时自动顺延（控制面 24 个、界面面 24 个）。发现广播可以在本机详情里关掉：关掉后本机
不再广播，也不会出现在别人的列表里，但已配对的两台机器仍然可以直连。

跨公网组网（Tailscale、ZeroTier、EasyTier、企业 VPN）不在项目范围内，只要 IP 可达就能用。

## 9 安全边界

- 控制面请求带 `x-mesh-device` / `x-mesh-ts` / `x-mesh-sig`，签名覆盖 `deviceId\n时间戳\nbody`，
  时间窗口 2 分钟，超出直接拒绝。
- 未配对只能调 `ping`；已配对但未授权只能问状态；只有 `allowControl` 为真才能派任务。
- 界面面只监听回环，并校验 `Origin`（`dsh-app:` 或回环），别的机器无法驱动你的面板。
- SSH 密码与私钥路径只存在注册机本地；对端只能看到名称、主机、用户、在线状态。

### 控制协议 v1

当前节点发出的控制请求使用以下信封，HMAC 仍覆盖未经修改的完整 JSON：

```json
{
  "v": 1,
  "requestId": "调用方生成的唯一 ID",
  "action": "dispatch",
  "params": { "prompt": "git status" }
}
```

成功响应放在 `result` 中，失败响应使用结构化 `error`。旧格式请求继续接受并返回旧格式响应，
便于全网滚动升级；`/mesh/info` 的 `protocols` 和 `features` 可用于检查对端能力。

幂等规则：

- `dispatch`、`endpoint.task` 的相同 `requestId` 和相同参数返回原 `jobId`，不会重复启动 Agent。
- `endpoint.run` 的相同重试返回缓存输出；仍在执行时返回 `duplicate-in-progress`。
- 相同 ID 对应不同 action 或参数时返回 `request-id-conflict`。
- 本地 `self` 调用与远程调用使用相同规则。记录保存在目标节点，最长保留 24 小时、最多 200 条。
- 节点重启会把未完成的请求标记为 `request-interrupted`；确认副作用后使用新的 ID 重试。
- 完全相同签名的请求在时间窗口内重放会被拒绝；幂等重试则返回原请求结果。

## 10 状态与诊断

| 路径 | 内容 |
| --- | --- |
| `~/.dsh/claw-mesh/state.json` | 设备 ID、显示名、配对密钥、端点、设置、近期幂等记录 |
| `~/.dsh/claw-mesh/ui.log` | 界面面交互日志（面板挂载、请求失败原因） |
| `~/.dsh/claw-mesh/headless-login.patch.yml` | 复用界面登录凭据时给 headless 的 overlay |

面板打不开时先看 `ui.log` 最后几行；端口冲突、Origin 被拒、客户端异常都会记在里面。

## 11 已知限制

- 同一网段的广播可能被企业 Wi-Fi 或 AP 隔离挡住，此时设备不会自动出现，可以改用 SSH 设备接入。
- Windows 上的 headless 复用登录依赖 Electron 版 dsh；纯 CLI 安装需要自己配 `DEEPSEEK_API_KEY`。
- SSH 只支持密钥或免密/密码登录，不支持交互式二次验证（OTP）。
- 单条调度任务默认 30 分钟超时；需要更久时改 `state.json` 里的 `jobTimeoutMs` 并重启。
- 发现与配对基于账号指纹，不校验设备主人的身份；换账号后需要重新配对。

## 12 本地联调

打包：`npm run pack` 按 `package.json` 的版本号生成 `version/<包名>-<版本>.zip`，只收 git 跟踪的文件；
`version/` 已在 `.gitignore` 里，发布包不会被提交。

不接第二台机器也能验证：仓库里的 `tools/second-node.mjs` 会用独立状态目录和端口起第二个节点。

```bash
ELECTRON_RUN_AS_NODE=1 "<DSH 可执行文件>" tools/second-node.mjs
```

用 `DSH_MESH_STATE_DIR` 指定状态目录，`DSH_MESH_PORT` / `DSH_MESH_UI_PORT` /
`DSH_MESH_DISCOVERY_PORT` 指定端口；`DSH_MESH_FAKE_ACCOUNT` 可以把两个实例伪装成同一账号，方便
在一台机器上验证授权与调度流程。
