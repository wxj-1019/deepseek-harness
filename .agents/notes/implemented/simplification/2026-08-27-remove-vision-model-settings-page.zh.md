# Agent Note: Remove the vision-model settings page

Status: implemented

[English](2026-08-27-remove-vision-model-settings-page.md) | 中文

## Problem

Web 设置页（`@deepseek-ai/dsh-client-ui-settings-vision-model`）曾是 `vision-model` 设置命名空间的唯一编辑器：一组支持图片输入的 provider/model 对，`dsh-llm-vision-route` 把携带图片的请求重路由到它。该部署已不再通过单独的识图模型路由图片请求，这个页面只会在设置导航里长期保持未配置状态——而路由插件本来就是直接从设置文档读取自己的命名空间，从不需要一个浏览器表面才能成立。

## Decision

`@deepseek-ai/dsh-client-ui-settings-vision-model` 已从仓库和 web-app bundle patch 中移除；设置导航只渲染其余随包发布的分区。`vision-model` 命名空间保留其属主（`dsh-llm-vision-route`，仍由 base bundle 挂载），直接在 `$DSH_HOME/settings.yaml` 中配置。路由行为与其 prompt 预检 / `read_image` 消费方均未变化；web e2e 旅程改为在宿主侧写入该命名空间而不是驱动页面（[vision-model routing](../feature/2026-08-17-vision-model-routing.zh.md)）。

## Alternatives considered

- **把页面留在 bundle 或按部署的开关后面。** 未采纳：组合方式本来就已经通过编辑 bundle patch 文件来选择表面，运行时开关只会增加一个职责仅为隐藏死 UI 的旋钮。
- **连同整个路由功能（`dsh-llm-vision-route`）一起删除。** 未采纳：本次请求的范围是配置表面。路由仍是一个可用的可组合能力，拥有自己的单测与回放覆盖；删掉它还要为没有提出的需要改写预检/`read_image` 门禁接缝。如果路由本身将来也要移除，本笔记标记了完整移除还须覆盖的内容。

## Consequences

- 配置识图路由现在意味着手工编辑 yaml；编辑时没有任何东西替你过滤掉纯文本模型。指向未声明图片输入模型的路由与此前一样在适配器边界失败。
- 少了一个客户端包、一行 bundle 依赖和一个设置分区；重新生成的槽位目录与刷新后的设置导航黄金文件钉住的是五个分区，而不再是六个。
- 重新引入编辑器重新变更为纯增量：任何客户端包都可以在不变的命名空间上注册一个 `settings.section` 占用者。
