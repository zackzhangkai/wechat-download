# wechat-download

微信公众号文章 → Markdown 转换服务，部署于 Cloudflare Workers：<https://wechat-download.coderfather.com>

单篇转换 + 图片本地化打包 zip（`note.md` + `images/`），可直接解压进 Obsidian vault。图片命名为 `sha1(url)` 前 14 位，便于与其他管线互通去重。

## 使用

### 网页

打开 <https://wechat-download.coderfather.com>，两个模式：

- **单篇下载**：贴入文章链接即自动解析预览（标题/公众号/作者/发布时间/图片数），点「下载 zip」或回车直接下载。也支持带参直达：`/?url=<文章链接>` 自动解析并下载。Token 由服务端注入页面，无需手填。
- **整号抓取**：贴入该公众号的 1 篇或多篇文章链接（每行一个）作种子，页面沿正文互链的同号文章做广度遍历（内链遍历，无登录态），逐篇调用 `/api/convert`，最后在浏览器合成一个大 zip（每篇一个文件夹 + `index.md` 目录）。可设篇数上限与起始日期；篇间随机等待（稳妥 8–15s / 快速 4–8s）降低风控风险；进度存 localStorage，可随时停止、下次同号续抓。**只覆盖正文互链可达的文章，不保证全量**；不同时期的多种子能提高覆盖率。

页面底部有完整使用说明（如何复制链接、zip 结构、注意事项）。

### API

```bash
# 元数据预览（不下载图片，秒回）
curl -X POST https://wechat-download.coderfather.com/api/parse \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mp.weixin.qq.com/s/xxxx"}'

# 转 Markdown + 图片 zip
curl -X POST https://wechat-download.coderfather.com/api/convert \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mp.weixin.qq.com/s/xxxx"}' \
  -o article.zip

# 整号抓取的单篇请求：附正文内链（links.json），供遍历方发现下一批
curl -X POST https://wechat-download.coderfather.com/api/convert \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mp.weixin.qq.com/s/xxxx", "withLinks": true}' \
  -o article.zip
```

响应 zip 内含 `note.md`（YAML frontmatter：title/source/account/author/published/description）与 `images/`；`withLinks: true` 时追加 `links.json`（canonical 化的正文内链）。元数据同时通过 `X-Meta` 响应头返回（URI 编码 JSON）。

诊断端点：`GET /fetch-test?url=<mp 文章或图片 URL>`（白名单域，仅返回元数据）。

## 部署

```bash
npm install
npx wrangler secret put API_TOKEN   # 访问令牌
npm run deploy
```

本地开发：`npm run dev`（Token 放 `.dev.vars`：`API_TOKEN=xxx`）。

## 实测指标

- 文章抓取 5.1MB / ~2s，无风控拦截（CF 数据中心 IP）
- 图片 35 张并发下载（限 6），全部成功
- 全流程 ~2s（本地）/ ~9s（生产），CPU ~330ms（需 Workers Paid）

## 架构

```
src/
├── index.ts    # 路由：落地页（Token 注入）/ POST /api/parse / POST /api/convert / fetch-test
├── convert.ts  # 编排：抓取 → 提取 → 图片 → Markdown → zip(fflate)；withLinks 附 links.json
├── extract.ts  # HTMLRewriter 流式解析：元数据 + #js_content 轻量树（无 DOM 依赖）
├── markdown.ts # 树 → Markdown 渲染器（块/行内/列表/表格/引用/代码块）
├── images.ts   # 图片收集 + 并发下载（上限 40 张 / 50MB）
├── links.ts    # 正文内链收集（canonical 化），整号抓取的发现层
└── page.ts     # 落地页：单篇下载 + 整号抓取（浏览器 BFS，状态存 localStorage）
```

已与 Python 版参照实现逐行对拍（272 行正文、35 张图片哈希与顺序完全一致）。

## 规划

- [x] 账号历史批量：网页「整号抓取」（正文内链遍历，无登录态、不承诺全量；编排在浏览器，服务端仍单篇单请求，绕开 Worker 子请求/时长限制）
- [ ] Chrome 插件：用户浏览器内直接抓取 DOM（服务端抓取被风控时的兜底）
- [ ] Obsidian 插件：直接写入 vault

## 免责声明

本工具仅用于个人学习与内容归档，请于下载后 24 小时内删除，并前往原发布渠道支持作者。
