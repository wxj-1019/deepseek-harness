# Agent Note：用量热力图格子渲染为透明——css-module 类名被字符串拼接选取

Status: implemented

[English](2026-09-01-usage-heatmap-level-class-lookup.md) | 中文

## 问题

用量仪表盘的 Token 活动热力图中，每个格子无论有无数据都渲染为透明背景。格子的类名由字符串拼接构造——`` `${css.heatmapCell} ${css.heatmapLevel}${level(cell.total)}` ``——但 css-modules 的映射为每个声明的类导出一个独立的哈希名，并不存在名为 `heatmapLevel` 的类。`css.heatmapLevel` 是 `undefined`，于是 DOM 上出现的是字面量类 `undefined0`…`undefined4`，`.heatmapLevel0`–`.heatmapLevel4` 的背景规则一条都匹配不上。这个 bug 早于 rc.8 合并；热力图从未显示过颜色。

## 决策

改为从模块级数组按计算出的层级取类——`[css.heatmapLevel0, …, css.heatmapLevel4][level]`——与代码库中其他枚举样式变体的做法一致。越界层级经守卫映射为无附加类。

## 后果

- 有数据的格子渲染出强度颜色；零数据的日子渲染 level-0 的浅灰底，网格呈现为带高亮活跃日的底纹。
- 通用规则：css-modules 的类名永远不能用公共前缀加运行时后缀拼装——枚举变体必须从导出的映射里选取。
