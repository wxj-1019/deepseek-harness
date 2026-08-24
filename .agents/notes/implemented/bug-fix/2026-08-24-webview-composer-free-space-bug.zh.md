# Agent Note: 输入卡贴底不得依赖主轴自由空间

Status: implemented

[English](2026-08-24-webview-composer-free-space-bug.md) | 中文

## Problem

活动会话列把输入卡固定在滚动口底部。原机制让 `.viewArea` 撑满滚动口（`flex: 1 0 auto`）从而把 sticky 座位推到底部；二分实验（TEMP-DIAG-2026-08-24）改为用 `margin-top: auto` 贴底。两种机制都分配 flex 容器的主轴**自由空间**——flex-grow 分配它，auto margin 吸收它。

在内嵌浏览器（应用内浏览器的 Electron webview，即 `html/body/#root` 高度链断裂的那类原生 webview）中，column flex 滚动容器按**滚动内容高度**而非滚动口高度计算该自由空间。因此历史溢出后自由空间仍为正：`flex-grow` 把 `.viewArea` 撑出内容之外，在 sticky 输入卡上方形成空白带；`margin-top: auto` 则保持正的 margin——实测在最后一条消息与输入卡之间有 459px 的幻影滚动空间，每次发送消息滚动条随之增长。现象像是内容被计算了两次；内容只有一份，重复的是自由空间。

## Decision

不通过主轴自由空间分配来贴底：

- `.viewArea` 改为 `flex: 0 0 auto; min-height: 100%`。百分比 `min-height` 直接对滚动口的 content box（确定高度）解析，不走自由空间分配：短会话撑满滚动口使 sticky 座位落在底部，溢出会话不受影响，也不会出现幻影空间。
- `.composerSeat` 移除 `margin-top: auto`。
- `.root[data-phase='active']` 恢复 `flex: 1 1 auto; min-height: 0`——当高度链断裂、`height: 100%` 对着 auto 内容解析时，这是仍能把 root 限制住的兜底。

同一改动还一并落地了与本次二分同源的另外两处滚动修复：`AppFrame` 的 `height: 100vh`（原生 webview 的框架级高度链兜底）与 `heroGlowClip` 包装层（裁剪 hero 光晕的装饰性溢出，使其不再制造可滚动溢出）。

## Alternatives considered

- **保留 `.viewArea` 的 `flex: 1 0 auto`**——否决：flex-grow 分配的是同一份算错的自由空间，会重现二分所要排查的空白带。
- **保留 `.composerSeat` 的 `margin-top: auto`**——否决：auto margin 吸收的是同一份自由空间，正是实测到的 459px 幻影空间。
- **滚动体用 `justify-content: flex-end`**——否决：justify-content 分配的是同一份自由空间，共享同一引擎行为。

## Consequences

- 输入卡贴底不再依赖主轴自由空间分配——内嵌浏览器恰好在这一点上算错了高度基准。
- 标准浏览器中行为一致：短会话撑满滚动口，溢出会话滚动，座位保持 sticky。
- 短会话时消息区 `min-height: 100%` 至多引入一个座位高度的滚动范围（sticky 座位本就在流内、按设计恒占这段范围），与二分前行为一致。
- 复现条件：任何人恢复 flex-grow 或 auto margin 贴底方案，必须在内嵌浏览器中复验，而不能只在标准浏览器里验证。
