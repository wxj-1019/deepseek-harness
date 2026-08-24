# DeepSeek Harness

[English](README.md) | 中文

<p align="center">
  <img src="assets/banner.svg" alt="DeepSeek Harness 横幅" width="960">
</p>

<p align="center">
  <strong>一切皆插件。</strong>同一个由 Cordis 驱动的运行时承载 agent loop（智能体循环）、工具与 Web UI——可组合、可扩展、可替换。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@deepseek-ai/dsh"><img src="https://img.shields.io/npm/v/@deepseek-ai/dsh" alt="npm 版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3DA639" alt="许可证"></a>
  <a href="docs/development.zh.md"><img src="https://img.shields.io/badge/node-%E2%89%A5%2022.19%20%7C%7C%20%E2%89%A5%2024-339933" alt="Node 版本要求"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness/commits"><img src="https://img.shields.io/github/last-commit/deepseek-ai/deepseek-harness" alt="最近提交"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness/stargazers"><img src="https://img.shields.io/github/stars/deepseek-ai/deepseek-harness?style=social" alt="star 数"></a>
  <a href="https://discord.gg/Ycq5dCaS4"><img src="https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white" alt="Discord 社区"></a>
</p>

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 功能亮点

| | |
| --- | --- |
| 🔌 **一切皆插件** | agent loop、工具与 Web UI 都是通过 `cordis.yml` 组合的 Cordis 插件——无需改动循环本体即可扩展或替换任何部分。 |
| 🖥️ **内置 Web UI** | `dsh web` 在本地启动带有会话、计划与审批门控工具调用的 Web UI。 |
| 🧭 **多种驱动入口** | 同一运行时可由 Web UI、ACP 自动化服务器或一次性 headless CLI 任务驱动。 |
| 🧾 **可重放的会话日志** | 模型看到的一切都可以从会话日志重建；完整记录可在快照测试中无密钥重放。 |
| 🧰 **双 SDK，同一循环** | TypeScript 与 Python SDK 投影同一 agent loop 表面。 |
| 🔒 **沙箱化执行** | 工具子进程在 Linux 上通过原生 Node 扩展实现 landlock 隔离运行。 |

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`（`^22.19 || >=24`），然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 文档

| 主题 | 指南 |
| --- | --- |
| Web UI | [Web UI 使用指南](docs/user/guide/index.zh.md) |
| 模型配置 | [模型提供商指南](docs/user/guide/providers.zh.md) |
| Python SDK | [Python SDK 指南](docs/user/guide/python-sdk.zh.md) |
| 插件开发 | [扩展开发指南](docs/cookbook/extension-cookbook.zh.md) |

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
