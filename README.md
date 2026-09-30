# wechat-download

微信公众号文章 → Markdown 转换服务，部署于 Cloudflare Workers：<https://wechat-download.coderfather.com>

单篇转换 + 图片本地化打包 zip（`note.md` + `images/`），可直接解压进 Obsidian vault。图片命名为 `sha1(url)` 前 14 位，便于与其他管线互通去重。

## 使用

### 网页

打开 <https://wechat-download.coderfather.com>，贴入文章链接即自动解析预览（标题/公众号/作者/发布时间/图片数），点「下载 zip」或回车直接下载。也支持带参直达：`/?url=<文章链接>` 自动解析并下载。Token 由服务端注入页面，无需手填。

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
```

响应 zip 内含 `note.md`（YAML frontmatter：title/source/account/author/published/description）与 `images/`。元数据同时通过 `X-Meta` 响应头返回（URI 编码 JSON）。

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
├── convert.ts  # 编排：抓取 → 提取 → 图片 → Markdown → zip(fflate)
├── extract.ts  # HTMLRewriter 流式解析：元数据 + #js_content 轻量树（无 DOM 依赖）
├── markdown.ts # 树 → Markdown 渲染器（块/行内/列表/表格/引用/代码块）
├── images.ts   # 图片收集 + 并发下载（上限 40 张 / 50MB）
└── page.ts     # 落地页
```

已与 Python 版参照实现逐行对拍（272 行正文、35 张图片哈希与顺序完全一致）。

## 规划

- [ ] Chrome 插件：用户浏览器内直接抓取 DOM（服务端抓取被风控时的兜底）
- [ ] Obsidian 插件：直接写入 vault
- [ ] 账号历史批量：留在本地 skill 处理（微信凭证不上云）

## 免责声明

本工具仅用于个人学习与内容归档，请于下载后 24 小时内删除，并前往原发布渠道支持作者。
