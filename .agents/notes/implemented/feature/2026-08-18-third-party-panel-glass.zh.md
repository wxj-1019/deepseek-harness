# aqua 浮动模式下的第三方面板玻璃化

日期：2026-08-18
领域：`packages/client/ui-aqua`

[English](2026-08-18-third-party-panel-glass.md) | 中文

## 决策

`dsh-better-sidebar` 档位插件（第三方工作台：文件浏览、编辑器、终端、底部面板）的所有表面都通过通用 `--dsw-alias-*` 设计令牌上色——其样式表将此写明为换肤契约，期待皮肤重定义这些令牌。aqua 的浮动模式让通用令牌保持库存实色（只有 compat 模式的 `COMPAT_SURFACE_OVERRIDES` 会把它们变半透明），因此插件的固定面板在壁纸上渲染为不透明。主题层现在把 compat 的表面值**作用域化**到 `[data-dsh-better-sidebar]`（插件挂载宿主上的稳定属性），仅在浮动模式生效，并对它的 `panel` 类名片段加 `backdrop-filter: blur(var(--dsh-aqua-blur))`——与图层其余部分使用的属性缝与类名片段匹配同一习惯。compat 模式无需任何处理：其全局重定义已覆盖这些令牌。

## 影响

- 适配住在仓库自己的主题包里，插件更新不会丢失（只用属性缝与类名片段，绝不匹配完整哈希名）；aqua 总开关关闭或插件卸载时随样式表一起消失。
- 作用域令牌清单还覆盖了 `--dsw-alias-bg-base`（插件的各工作台 pane、编辑器/文件树/终端包裹层都涂这个令牌，而浮动与 compat 两份清单都不动它，因为它是应用根填充）。终端通过插件自己的透明度地板（`effectiveTokenValue`）保持不透明 xterm 底色，只有面板骨架变成玻璃。
- 取值镜像 `aqua-settings.ts` 的 `COMPAT_SURFACE_OVERRIDES`（外加 bg-base 的 pane 填充）；调整 compat 调色板时两处都要改。
- 已对运行中的 web 应用实测（暗色、浮动、壁纸开启）：面板计算背景为作用域玻璃色、模糊跟随旋钮；截图确认壁纸透过两侧面板。仓库的 aqua e2e 旅程无法覆盖此项——该插件只存在于用户档位层，不在仓库组合中。
