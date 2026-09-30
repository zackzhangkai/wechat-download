# wechat-download

微信公众号文章 → Markdown 转换服务。部署于 Cloudflare Workers（`wechat-download.coderfather.com`）。

## 状态

🧪 **Spike 阶段** —— 正在验证 Worker 数据中心 IP 直接抓取微信文章的存活率。

规划中的形态：

- `POST /api/convert`：文章 URL → Markdown（含图片本地化打包 zip）
- Chrome 插件：用户浏览器内直接抓取（绕开服务端 IP 风控）
- Obsidian 插件：直接写入 vault

## 免责声明

本工具仅用于个人学习与内容归档，请于下载后 24 小时内删除，并前往原发布渠道支持作者。
