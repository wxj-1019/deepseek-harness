# Agent Note: Component library watch scope, review guard, panel feedback, and manifest-claimed pkg

Status: implemented

[English](2026-09-06-component-library-watch-scope-review-guard-panel-feedback.md) | 中文

## Problem

组件库的第二轮审查暴露了四个缺口。主题样式表只在插件 init 时读取一次：watcher 的相关性判断接受 `packages/client` 下任何位置的 `.tsx` 或 `.module.css`，恰好排除了普通 `.css` 的主题样式表，于是令牌清单（以及由它渲染的 skill 正文分层计数）会一直过期到重启，而其余部分照常学习。review 面接受任何记录 id：经 Remote seam 的一次 `discard` 会静默删除权威的扫描记录，与 `contribute` 的扫描碰撞拒绝毫无对称，且被删记录要等所属文件下次变更或重启重扫才回来。面板的 review 控件丢弃 controller 的 Promise，传输失败或 `component-not-found` 变成无任何可见反馈的 unhandled rejection——按钮看起来像坏了。还有 `contribute` 接受任何 `pkg` 声明：id 从归一化路径派生，但错误的包名会存活进持久记录，审批后静默破坏按 `pkg` 过滤的查询。

同一轮审查还揪出了一个伪装成本机 flake 的 fixture 缺陷：watch 集成套件把检出建在 `os.tmpdir()` 下，而这台 Windows 机器经短路径（`ADMINI~1`）访问它，第一个文件系统事件会在 libuv 的 `uv_fs_event` 内中止 Node（`!_wcsnicmp(filename, dir, dirlen)`），因为事件文件名与被监听目录前缀不再匹配。

## Decision

watcher 的相关性现在与扫描器的遍历完全一致：包内 `src/client` 下的 `.tsx` 与 `.module.css`，外加主题样式表。主题样式表稳定变更（或删除）触发新的 `onThemeSettled` 事件；服务重读令牌清单并经 `SkillProviderControl` 直接失效 skill 目录——不广播 `component-library/changed`，因为变更广播必须尾随一次持久 domain 写入，而令牌重读不写任何东西。chokidar 深度上限移除；遍历与扫描器一样无上限，`node_modules` 照旧排除。spec 文件、fixture 和 client 树下其他样式表永不进入管线，这也顺带消灭了过去每次编辑 spec 都会触发的重学再遗忘的无效循环。watch 集成 fixture 经 `realpathSync.native` 解析临时检出路径，使被监听路径在所有平台都是长路径形式。

`review` 现在在执行任一决定前以新的 `scanned-record` 错误码拒绝扫描记录的 id；review seam 只为模型贡献记录的治理而存在。controller 把 review 失败以 `reviewError` 字段发布进 store 而不是向外拒绝——注入面丢弃了 Promise，store 是卡片唯一的反馈通道——卡片把它渲染为错误行，由下一次尝试或成功清除。`contribute` 经扫描器自己的 `packageName` 解析所属目录的 manifest 名称，`pkg` 声明不一致时以 `invalid-record` 拒绝。

## Alternatives considered

**令牌重读时广播 `component-library/changed`。** 一种事件覆盖所有刷新更简单，但本包自己的不变量要求每次广播尾随一次持久 `component_library` domain 写入，令牌重读不是；不变量会在每次主题编辑时触发。直接失效 skill 目录保住了不变量的绝对性。

**保留更大的深度上限而不移除。** 任何上限都会在深一层重新制造同样的扫描器/监听器不对称；`node_modules` 排除已经约束了遍历。

**对扫描记录的 review 复用 `component-not-found`。** 记录明明存在，撒谎的错误码会诱发客户端错误处理；专用码只花一个联合成员。

**让 `review` 从 controller 向外拒绝。** 注册处用 `void` 包裹调用，拒绝会成为 unhandled promise rejection——store 是卡片唯一的反馈通道，这也正是 list 失败已经发布 `status: 'error'` 的原因。

**容忍错误的 `pkg` 靠隔离兜底。** 面板审核者看得到记录却看不到未来的查询遗漏；审批之后该记录对按 `pkg` 过滤的查询永远不可见。manifest 读取只是 contribute 频率下的一次文件读取。

## Consequences

令牌清单、组件记录与 skill 正文现在以同样的实时性跟踪文件变更，管线忽略的恰好是扫描器忽略的。扫描记录无法再经 review seam 被删除或改动，扫描权威后条件在读改路径与写入路径上都成立。review 失败在面板上可见而非消失。模型记录无法再携带与持久集他处矛盾的包名。watch 集成套件能在临时目录为短路径的 Windows 宿主上运行——此前它在报告任何结果之前就把 worker 中止了。

## Testing

`watcher.spec.ts` 钉住主题样式表到 `onThemeSettled` 的路由，以及 spec、普通样式表、`src/client` 之外源的排除。`watch-integration.spec.ts` 在长路径检出上钉住主题重读、spec 文件不学习窗口和原有的重学/遗忘循环。`service.spec.ts` 钉住两个决定下 `scanned-record` 拒绝且不删除、`pkg`/manifest 不一致拒绝。`gaps.spec.ts` 把无操作批准 ack 改钉在已审核模型记录上，替换旧的扫描记录 ack。`card.client.spec.tsx` 钉住结果级与载体级 review 失败发布 `reviewError`，以及卡片的错误行渲染。
