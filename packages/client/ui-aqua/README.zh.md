# @deepseek-ai/dsh-client-ui-aqua

[English](README.md) | 中文

Aqua 主题插件：Web 端的主导玻璃视觉系统。自第三方 [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin) v1.3.0 吸收而来（MIT，© 上游作者；`LICENSE` 保留在本包内），并重接到 harness 的持久缝上。支持云母（磨砂悬浮卡片）与兼容（原生布局 + 通用玻璃材质）双模式；模糊度、磨砂度、背景亮度可调；WebGL 流体背景或自定义壁纸——图片或视频——经附件存储通过 `/backgrounds` 提供（POST 采用同源栅栏准入，GET 带 ETag 重校验与视频字节区间）。所有旋钮与总开关持久化在 `ui-aqua` 设置命名空间，偏好与壁纸在浏览器存储重置后依然保留并跟随账户；boot `tapIndex` 变换在客户端树激活前先画出玻璃令牌。跨页签切换以设置失效的形式到达；一次性迁移会在首次运行时采纳被吸收上游的 localStorage 旋钮（其 data-URL 壁纸会被上传）。

渲染全为效果：令牌覆盖走 theme 服务的覆盖栈（`overrideTokens`），样式表以 `<html>` 上的 `data-dsh-aqua` 属性为开关，环境场景随层挂载——关闭总开关即完整还原原生 UI。Space Grotesk 可变字体自托管内嵌（不依赖 shell）。

## 模型体验

无。该服务管理浏览器偏好；这里没有任何内容进入模型请求。

#### KV 缓存影响

无；该包既不组装也不发送提供方请求。

## 选择加入的表面

功能表面（抽屉、面板）通过两个稳定接缝加入玻璃皮肤：浮动卡片上的 `data-dsh-glass-panel`、边缘触发器上的 `data-dsh-glass-tab`。两者获得与 composer 卡片一致的配方——亮/暗玻璃、霜度乘数、composer 模糊、发丝边框、内侧高光——以及半透明的行/输入染色，让壁纸透过面板保持可见。仅门控于 `data-dsh-aqua`（不要求 float 模式），兼容模式同样上玻璃；关闭即 stock。当前占用者：今日待办抽屉与通知中心面板。

## 已知限制与暂缓事项

- 视频准入只证明容器格式良好（魔数字节），不证明编解码可播放；被存储的视频仍可能在客户端播放失败。
- 被替换的壁纸不做垃圾回收；孤立的存储对象会累积，但受上传大小上限约束。
- 被吸收的渲染引擎保留其无守卫的数组索引：包本地以 `noUncheckedIndexedAccess` 关闭编译，Host 面 tsconfig（Host 半拥有路由、设置命名空间与 boot tap）在基础 Host 配置之上补齐客户端覆盖——jsx 与 DOM lib。
- 吸收来的样式表通过 `[class*=…]` 子串选择器与盖缝 MutationObserver 寻址原生表面；兄弟包的重命名可能需要在这里跟进。
