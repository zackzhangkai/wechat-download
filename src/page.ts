/** 落地页：单篇下载 + 整号抓取（浏览器驱动内链遍历，对应本地 crawl_account.py）。Token 由服务端注入。 */

export const LANDING_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>微信文章下载</title>
<style>
  :root { color-scheme: light dark; }
  [hidden] { display: none !important; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: -apple-system, "PingFang SC", "Segoe UI", sans-serif;
    background: #f6f7f9; color: #1f2328;
  }
  @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } }
  main { width: min(560px, calc(100vw - 32px)); padding: 32px 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; font-size: 13px; opacity: .65; }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .tabs button {
    flex: 1; padding: 8px 0; font-size: 14px; cursor: pointer;
    border: 1px solid #d0d7de; border-radius: 8px; background: transparent; color: inherit;
  }
  .tabs button.active { background: #1f2328; color: #fff; border-color: #1f2328; }
  input, textarea {
    width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px;
    border: 1px solid #d0d7de; border-radius: 8px; background: transparent; color: inherit;
  }
  textarea { font-family: inherit; resize: vertical; }
  .opts { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-top: 12px; font-size: 13px; }
  .opts label { display: flex; align-items: center; gap: 6px; }
  .opts input, .opts select {
    padding: 6px 8px; font-size: 13px; border: 1px solid #d0d7de;
    border-radius: 6px; background: transparent; color: inherit;
  }
  .opts input[type=number] { width: 72px; }
  button.primary {
    margin-top: 16px; width: 100%; padding: 11px; font-size: 15px; cursor: pointer;
    border: 0; border-radius: 8px; background: #1f2328; color: #fff;
  }
  button.primary:disabled { opacity: .5; cursor: wait; }
  #crawl-resume button {
    padding: 6px 14px; font-size: 13px; cursor: pointer;
    border: 0; border-radius: 6px; background: #1f2328; color: #fff;
  }
  @media (prefers-color-scheme: dark) {
    input, textarea { border-color: #30363d; }
    .tabs button { border-color: #30363d; }
    .tabs button.active { background: #e6edf3; color: #0d1117; border-color: #e6edf3; }
    .opts input, .opts select { border-color: #30363d; }
    button.primary, #crawl-resume button { background: #e6edf3; color: #0d1117; }
    #crawl-resume { border-color: #30363d; }
  }
  #preview {
    margin-top: 14px; padding: 14px; border: 1px solid #d0d7de; border-radius: 8px;
    font-size: 13px; line-height: 1.8; display: none;
  }
  @media (prefers-color-scheme: dark) { #preview { border-color: #30363d; } }
  #preview .title { font-size: 15px; font-weight: 600; }
  #preview .desc { opacity: .7; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  #status { margin-top: 14px; font-size: 13px; white-space: pre-wrap; line-height: 1.7; }
  #status.err { color: #d1242f; }
  #crawl-resume {
    margin-top: 12px; padding: 10px 12px; border: 1px dashed #d0d7de; border-radius: 8px;
    font-size: 13px; line-height: 1.8; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  #crawl-progress { margin-top: 14px; }
  #crawl-bar { height: 6px; border-radius: 3px; background: rgba(127,127,127,.25); overflow: hidden; }
  #crawl-bar-fill { height: 100%; width: 0; background: #1f2328; transition: width .3s; }
  @media (prefers-color-scheme: dark) { #crawl-bar-fill { background: #e6edf3; } }
  #crawl-counts { margin-top: 8px; font-size: 13px; }
  #crawl-current { margin-top: 2px; font-size: 13px; opacity: .8; min-height: 1.4em; }
  #crawl-log {
    margin-top: 10px; max-height: 240px; overflow: auto; padding: 10px 12px;
    font: 12px/1.7 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap;
    background: rgba(127,127,127,.08); border-radius: 8px;
  }
  #help { margin-top: 24px; font-size: 13px; line-height: 1.8; }
  #help summary { cursor: pointer; opacity: .75; user-select: none; }
  #help .section { margin-top: 10px; }
  #help b { display: block; margin-bottom: 2px; }
  #help code { background: rgba(127,127,127,.15); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
<main>
  <h1>微信文章下载</h1>
  <p class="sub">公众号文章 → Markdown + 图片 zip，可直接解压进 Obsidian</p>

  <nav class="tabs">
    <button id="tab-single" class="active" type="button">单篇下载</button>
    <button id="tab-crawl" type="button">整号抓取</button>
  </nav>

  <section id="panel-single">
    <input id="url" placeholder="https://mp.weixin.qq.com/s/..." autofocus>
    <div id="preview"></div>
    <button id="go" class="primary" disabled>下载 zip</button>
  </section>

  <section id="panel-crawl" hidden>
    <textarea id="seeds" rows="3" placeholder="种子文章链接，每行一个（第一个决定目标公众号）&#10;https://mp.weixin.qq.com/s/..."></textarea>
    <div class="opts">
      <label>最多 <input id="max" type="number" min="1" max="200" value="20"> 篇</label>
      <label>起始日期 <input id="since" type="date"></label>
      <label>限速 <select id="speed">
        <option value="safe" selected>稳妥 8–15s/篇</option>
        <option value="fast">快速 4–8s/篇</option>
      </select></label>
    </div>
    <div id="crawl-resume" hidden>
      <span id="resume-text"></span>
      <button id="resume-continue" type="button">继续</button>
      <button id="resume-restart" type="button">重新开始</button>
    </div>
    <button id="crawl-go" class="primary" type="button">开始抓取</button>
    <button id="crawl-stop" class="primary" type="button" hidden>停止</button>
    <div id="crawl-progress" hidden>
      <div id="crawl-bar"><div id="crawl-bar-fill"></div></div>
      <div id="crawl-counts"></div>
      <div id="crawl-current"></div>
      <pre id="crawl-log"></pre>
    </div>
  </section>

  <details id="help">
    <summary>使用说明</summary>
    <div class="section">
      <b>单篇下载</b>
      微信里打开文章 → 点右上角「···」→「复制链接」→ 粘贴到输入框（自动解析预览）→ 回车或点「下载 zip」。
      zip 内是 <code>note.md</code> + <code>images/</code>，解压即可放进 Obsidian vault，元数据在 frontmatter 里。
    </div>
    <div class="section">
      <b>整号抓取</b>
      贴入该公众号的 1 篇或多篇文章链接（每行一个）作为种子。工具会沿着文章正文里互链的同号文章不断发现并下载，
      最后合成一个 zip：每篇一个文件夹，附 <code>index.md</code> 目录。<b>不保证抓到全部历史文章</b>（不用登录态，
      只能覆盖正文互链可达的部分）；提供不同时期的几篇种子能明显提高覆盖率。「起始日期」之前的文章只用于发现链接、不写入 zip。
    </div>
    <div class="section">
      <b>抓取中注意</b>
      请保持本页面打开（切到别的标签页不影响）；每篇之间自动等待以降低风控风险，20 篇约需 5–8 分钟；
      可随时点「停止」，进度保存在本浏览器，下次同号继续；网络抖动会自动重试，连续失败或疑似风控会自动中止。
    </div>
    <div class="section">
      <b>API</b>
      页面 Token 由服务端注入，无需手填；命令行调用 <code>/api/parse</code>、<code>/api/convert</code> 的方法见项目 README。
    </div>
  </details>

  <div id="status"></div>
</main>
<script>
const TOKEN = /*__TOKEN__*/null;
const $ = (id) => document.getElementById(id);
const API = { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" };

function showStatus(text, isErr) {
  $("status").className = isErr ? "err" : "";
  $("status").textContent = text;
}

async function post(path, body) {
  const resp = await fetch(path, { method: "POST", headers: API, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error((await resp.text()) || ("HTTP " + resp.status));
  return resp;
}

/* ---------- 标签切换 ---------- */

function switchTab(crawlMode) {
  $("tab-single").classList.toggle("active", !crawlMode);
  $("tab-crawl").classList.toggle("active", crawlMode);
  $("panel-single").hidden = crawlMode;
  $("panel-crawl").hidden = !crawlMode;
}
$("tab-single").addEventListener("click", () => switchTab(false));
$("tab-crawl").addEventListener("click", () => switchTab(true));

/* ---------- 单篇下载 ---------- */

function renderPreview(meta) {
  const pv = $("preview");
  pv.style.display = "block";
  pv.innerHTML = "";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = meta.title;
  pv.appendChild(title);
  const info = document.createElement("div");
  info.textContent = [
    meta.account, meta.author !== meta.account ? meta.author : "",
    meta.published ? "发布于 " + meta.published : "",
    meta.images + " 张图片",
  ].filter(Boolean).join(" · ");
  pv.appendChild(info);
  if (meta.description) {
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = meta.description;
    pv.appendChild(desc);
  }
  $("go").disabled = false;
}

let parseTimer = null, lastParsed = null;

async function parse() {
  const url = $("url").value.trim();
  if (!/^https?:\\/\\/mp\\.weixin\\.qq\\.com\\//.test(url)) { $("go").disabled = true; return; }
  if (url === lastParsed) return;
  lastParsed = url;
  showStatus("解析中…", false);
  try {
    const resp = await post("/api/parse", { url });
    renderPreview(await resp.json());
    showStatus("", false);
  } catch (err) {
    showStatus("❌ " + (err && err.message ? err.message : err), true);
  }
}

async function download() {
  const url = $("url").value.trim();
  if (!url) return;
  $("go").disabled = true;
  showStatus("打包中…（含图片下载，约需十几秒）", false);
  try {
    const resp = await post("/api/convert", { url });
    const blob = await resp.blob();
    const filename = decodeURIComponent((resp.headers.get("X-Filename") ?? "wechat-article") + ".zip");
    const meta = JSON.parse(decodeURIComponent(resp.headers.get("X-Meta") ?? "{}"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showStatus("✅ 已下载 " + filename + "\\n图片 " + meta.images + " 张" +
      (meta.failedImages ? "（" + meta.failedImages + " 张失败）" : ""), false);
  } catch (err) {
    showStatus("❌ " + (err && err.message ? err.message : err), true);
  } finally {
    $("go").disabled = false;
  }
}

$("url").addEventListener("input", () => {
  lastParsed = null;
  clearTimeout(parseTimer);
  parseTimer = setTimeout(parse, 700);
});
$("url").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); parse().then(download); } });
$("go").addEventListener("click", download);

/* ---------- 整号抓取（浏览器驱动内链遍历，对应本地 crawl_account.py） ---------- */

const FFLATE_URL = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js";
const SPEEDS = { safe: [8, 15], fast: [4, 8] };
const MAX_CONSECUTIVE_FAILURES = 3;

let fflateMod = null;
async function ensureFflate() {
  if (!fflateMod) fflateMod = await import(FFLATE_URL);
  return fflateMod;
}

/** 与服务端 canonicalArticleUrl / 本地 canonical_url 同一规则。 */
function canonicalUrl(raw) {
  try {
    const u = new URL(String(raw).split("#")[0].trim());
    const q = u.pathname.startsWith("/s/") ? "" : u.search;
    return "https://mp.weixin.qq.com" + u.pathname + q;
  } catch (e) { return ""; }
}

function seedUrl(raw) {
  let v = raw.trim();
  if (!v) return "";
  if (!/^https?:\\/\\//i.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    if (u.hostname !== "mp.weixin.qq.com") return "";
    return canonicalUrl(v);
  } catch (e) { return ""; }
}

/** 与服务端 safeFilename 同一规则。 */
function safeName(value, fallback) {
  let out = String(value)
    .replace(/[\\x00-\\x1f\\x7f]/g, "")
    .replace(/[\\\\/:*?"<>|#]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  out = out.replace(/^[.\\s]+|[.\\s]+$/g, "").slice(0, 100).trim();
  return out || fallback || "微信文章";
}

const crawl = {
  running: false, stopped: false,
  controller: null, delayClear: null, resumeCancel: null,
  account: "", accountDir: "",
  state: null, visitedSet: null, queueSet: null,
  files: null, folders: null, catalog: null,
  max: 20, since: "", delay: SPEEDS.safe,
  processed: 0, saved: 0, skippedOld: 0, foreign: 0, failedCount: 0, consecutiveFailures: 0,
  stopReason: "",
};

function crawlLog(line) {
  const el = $("crawl-log");
  const lines = (el.textContent + line + "\\n").split("\\n");
  el.textContent = lines.slice(-300).join("\\n");
  el.scrollTop = el.scrollHeight;
}

function crawlCounts() {
  const queued = crawl.state ? crawl.state.queue.length : 0;
  const visited = crawl.visitedSet ? crawl.visitedSet.size : 0;
  return "已保存 " + crawl.saved + " · 跳过旧文 " + crawl.skippedOld + " · 跳过非本号 " + crawl.foreign +
    " · 失败 " + crawl.failedCount + " · 队列 " + queued + " · 累计访问 " + visited;
}

function crawlUpdate(current) {
  $("crawl-counts").textContent = crawlCounts();
  if (current !== undefined) $("crawl-current").textContent = current;
  $("crawl-bar-fill").style.width = Math.min(100, Math.round(crawl.processed / crawl.max * 100)) + "%";
}

function stateKey() { return "wd-crawl:" + crawl.account; }

function loadCrawlState() {
  try {
    const s = JSON.parse(localStorage.getItem(stateKey()) || "null");
    if (!s || !Array.isArray(s.queue) || !Array.isArray(s.visited)) return null;
    return { queue: s.queue, visited: s.visited, failed: (s.failed && typeof s.failed === "object") ? s.failed : {} };
  } catch (e) { return null; }
}

function saveCrawlState() {
  try {
    localStorage.setItem(stateKey(), JSON.stringify({
      queue: crawl.state.queue, visited: Array.from(crawl.visitedSet), failed: crawl.state.failed,
    }));
  } catch (e) {
    crawlLog("⚠️ 进度保存失败（localStorage）：" + (e && e.message ? e.message : e));
  }
}

function shortUrl(url) { return url.length > 48 ? url.slice(0, 45) + "…" : url; }

function errorText(text, status) {
  try { const data = JSON.parse(text); if (data && data.error) return data.error; } catch (e) {}
  return text || ("HTTP " + status);
}

async function fetchArticleZip(url) {
  const resp = await fetch("/api/convert", {
    method: "POST", headers: API, signal: crawl.controller.signal,
    body: JSON.stringify({ url: url, withLinks: true }),
  });
  if (!resp.ok) throw new Error(errorText(await resp.text(), resp.status));
  const meta = JSON.parse(decodeURIComponent(resp.headers.get("X-Meta") || "{}"));
  const buf = new Uint8Array(await resp.arrayBuffer());
  const fflate = await ensureFflate();
  const entries = fflate.unzipSync(buf);
  let links = [];
  if (entries["links.json"]) {
    const data = JSON.parse(fflate.strFromU8(entries["links.json"]));
    if (data && Array.isArray(data.links)) links = data.links;
  }
  return { meta: meta, entries: entries, links: links };
}

/** 单篇结果写入批内 zip 条目：<公众号>/<标题>/note.md + images/…。 */
function addArticle(meta, entries, url) {
  let folder = safeName(meta.title, "未命名文章");
  if (crawl.folders.has(folder)) {
    let i = 2;
    while (crawl.folders.has(folder + "-" + i)) i++;
    folder = folder + "-" + i;
  }
  crawl.folders.add(folder);
  const prefix = crawl.accountDir + "/" + folder + "/";
  for (const name in entries) {
    if (name === "links.json") continue;
    crawl.files[prefix + name] = entries[name];
  }
  crawl.catalog.push({ title: meta.title, published: meta.published || "", url: url, folder: folder });
}

/** 篇间随机等待；停止按钮可立即打断。 */
function delayNext() {
  const secs = Math.floor(crawl.delay[0] + Math.random() * (crawl.delay[1] - crawl.delay[0]));
  return new Promise(function (resolve) {
    let remain = secs, timer = null;
    const tick = function () {
      if (crawl.stopped) { clearInterval(timer); resolve(); return; }
      $("crawl-current").textContent = "⏳ " + remain + "s 后抓取下一篇…（队列 " + crawl.state.queue.length + "）";
      remain -= 1;
      if (remain < 0) { clearInterval(timer); resolve(); }
    };
    crawl.delayClear = function () { clearInterval(timer); resolve(); };
    tick();
    timer = setInterval(tick, 1000);
  });
}

async function runCrawlLoop() {
  const queue = crawl.state.queue;
  while (queue.length && crawl.processed < crawl.max && !crawl.stopped) {
    const url = queue.shift();
    crawl.queueSet.delete(url);
    if (crawl.visitedSet.has(url)) continue;
    crawl.visitedSet.add(url);
    crawl.processed += 1;
    crawlUpdate("正在抓取：" + shortUrl(url));

    let article;
    try {
      article = await fetchArticleZip(url);
      crawl.consecutiveFailures = 0;
    } catch (err) {
      if (err && err.name === "AbortError") {
        queue.unshift(url); crawl.queueSet.add(url);
        crawl.processed -= 1; crawl.visitedSet.delete(url);
        crawl.stopReason = "已手动停止";
        return;
      }
      const msg = err && err.message ? err.message : String(err);
      crawl.state.failed[url] = msg;
      crawl.failedCount += 1;
      crawlLog("❌ 失败：" + msg + "（" + shortUrl(url) + "）");
      if (/风控|环境异常/.test(msg)) { crawl.stopReason = "疑似触发风控，已中止；稍后可再点「开始抓取」继续"; return; }
      crawl.consecutiveFailures += 1;
      if (crawl.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        crawl.stopReason = "连续 " + MAX_CONSECUTIVE_FAILURES + " 次失败，已中止";
        return;
      }
      saveCrawlState();
      await delayNext();
      continue;
    }

    const meta = article.meta;
    if (meta.account && meta.account !== crawl.account) {
      crawl.foreign += 1;
      crawlLog("↩️ 跳过（非目标公众号「" + meta.account + "」）：" + (meta.title || shortUrl(url)));
    } else {
      for (const link of article.links) {
        if (!crawl.visitedSet.has(link) && !crawl.queueSet.has(link)) {
          queue.push(link); crawl.queueSet.add(link);
        }
      }
      if (crawl.since && (!meta.published || meta.published < crawl.since)) {
        crawl.skippedOld += 1;
        crawlLog("⏭️ 跳过（发布于 " + (meta.published || "未知") + "，早于 " + crawl.since + "）：" + meta.title);
      } else {
        addArticle(meta, article.entries, url);
        crawl.saved += 1;
        crawlLog("✅ " + meta.title + "（" + (meta.published || "日期未知") + "，图片 " + meta.images +
          (meta.failedImages ? "，失败 " + meta.failedImages : "") + "）");
      }
    }
    saveCrawlState();
    crawlUpdate();
    if (queue.length && crawl.processed < crawl.max && !crawl.stopped) await delayNext();
  }
  if (!crawl.stopReason) {
    crawl.stopReason = crawl.stopped ? "已手动停止"
      : (crawl.processed >= crawl.max ? "达到本次上限（想继续就再点一次「开始抓取」）"
                                      : "队列已空：正文互链可达的文章已全部处理");
  }
}

function catalogMarkdown() {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "---",
    "account: " + JSON.stringify(crawl.account),
    "count: " + crawl.catalog.length,
    "created: " + today,
    "---",
    "",
    "# " + crawl.account + " 文章目录",
    "",
    "共 " + crawl.catalog.length + " 篇 · 生成于 " + today +
      "。仅覆盖正文互链可达的文章，不代表全部历史；完整元数据见各篇 note.md frontmatter。",
    "",
  ];
  for (const c of crawl.catalog) {
    lines.push("- [" + c.title + "](<" + crawl.accountDir + "/" + c.folder + "/note.md>)（" +
      (c.published || "日期未知") + "） [原文](<" + c.url + ">)");
  }
  lines.push("");
  return lines.join("\\n");
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function finishCrawl() {
  saveCrawlState();
  crawlLog("—— " + crawl.stopReason + " ——");
  crawlLog(crawlCounts());
  if (crawl.saved > 0) {
    crawlUpdate("正在合成 zip…");
    try {
      const fflate = await ensureFflate();
      crawl.files[crawl.accountDir + "/index.md"] = fflate.strToU8(catalogMarkdown());
      const zip = fflate.zipSync(crawl.files, { level: 0 });
      const name = safeName(crawl.account, "公众号") + "-" + crawl.saved + "篇-" +
        new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".zip";
      downloadBlob(new Blob([zip], { type: "application/zip" }), name);
      crawlLog("📦 已下载 " + name);
    } catch (err) {
      crawlLog("❌ zip 合成失败：" + (err && err.message ? err.message : err));
    }
  } else {
    crawlLog("⚠️ 本次没有保存任何文章，不生成 zip");
  }
  crawlUpdate("结束：" + crawl.stopReason);
  crawl.running = false;
  setCrawlUi(false);
}

function setCrawlUi(running) {
  $("crawl-go").hidden = running;
  $("crawl-stop").hidden = !running;
  $("seeds").disabled = running;
  $("max").disabled = running;
  $("since").disabled = running;
  $("speed").disabled = running;
  if (running) $("crawl-progress").hidden = false;
}

function askResume(counts) {
  return new Promise(function (resolve) {
    const bar = $("crawl-resume");
    $("resume-text").textContent = "发现「" + crawl.account + "」的上次进度：已访问 " + counts.visited +
      " · 队列剩余 " + counts.queue + "。从上次的队列继续吗？";
    bar.hidden = false;
    const done = function (value) { crawl.resumeCancel = null; bar.hidden = true; resolve(value); };
    crawl.resumeCancel = function () { done(null); };  // 停止按钮：取消整个本次抓取
    $("resume-continue").onclick = function () { done(true); };
    $("resume-restart").onclick = function () { done(false); };
  });
}

async function startCrawl() {
  if (crawl.running) return;
  const seeds = [];
  for (const raw of $("seeds").value.split(/\\s+/)) {
    const s = seedUrl(raw);
    if (s && seeds.indexOf(s) < 0) seeds.push(s);
  }
  if (!seeds.length) {
    showStatus("❌ 请先贴入至少一条 mp.weixin.qq.com 文章链接作为种子", true);
    return;
  }
  crawl.max = Math.min(200, Math.max(1, parseInt($("max").value, 10) || 20));
  crawl.since = $("since").value || "";
  crawl.delay = SPEEDS[$("speed").value] || SPEEDS.safe;

  crawl.running = true;
  crawl.stopped = false;
  crawl.controller = new AbortController();
  crawl.delayClear = null;
  crawl.resumeCancel = null;
  crawl.processed = crawl.saved = crawl.skippedOld = crawl.foreign = crawl.failedCount = crawl.consecutiveFailures = 0;
  // 先给空状态，进度条首次刷新（种子解析前）才有东西可读；续抓确认后再整体替换。
  crawl.state = { queue: [], visited: [], failed: {} };
  crawl.visitedSet = new Set();
  crawl.queueSet = new Set();
  crawl.stopReason = "";
  crawl.files = {}; crawl.folders = new Set(); crawl.catalog = [];
  $("crawl-log").textContent = "";
  setCrawlUi(true);
  crawlUpdate("正在解析种子，确定目标公众号…");

  try {
    const resp = await post("/api/parse", { url: seeds[0] });
    const meta = await resp.json();
    crawl.account = meta.account || "";
    if (!crawl.account) throw new Error("无法从种子文章识别公众号名称");
  } catch (err) {
    crawlLog("❌ 种子解析失败：" + (err && err.message ? err.message : err));
    crawl.running = false;
    setCrawlUi(false);
    return;
  }
  crawl.accountDir = safeName(crawl.account, "公众号");

  let state = loadCrawlState();
  if (state && (state.queue.length > 0 || state.visited.length > 0)) {
    const resume = await askResume({ visited: state.visited.length, queue: state.queue.length });
    if (resume === null) {  // 等待选择时点了「停止」：取消本次抓取
      crawl.running = false;
      setCrawlUi(false);
      crawlUpdate("已取消");
      return;
    }
    if (!resume) state = null;
  } else {
    state = null;
  }
  if (!state) state = { queue: [], visited: [], failed: {} };
  crawl.state = state;
  crawl.visitedSet = new Set(state.visited);
  crawl.queueSet = new Set(state.queue);
  for (const seed of seeds) {
    if (!crawl.visitedSet.has(seed) && !crawl.queueSet.has(seed)) {
      state.queue.push(seed); crawl.queueSet.add(seed);
    }
  }

  crawlLog("目标公众号：「" + crawl.account + "」，本次最多 " + crawl.max + " 篇" +
    (crawl.since ? "，起始日期 " + crawl.since : "") +
    "，限速 " + crawl.delay[0] + "–" + crawl.delay[1] + "s/篇");

  try {
    await ensureFflate();
  } catch (err) {
    crawlLog("❌ 无法加载打包组件（fflate CDN）：" + (err && err.message ? err.message : err));
    crawlLog("可刷新页面重试，或改用单篇下载");
    crawl.running = false;
    setCrawlUi(false);
    return;
  }

  await runCrawlLoop();
  await finishCrawl();
}

$("crawl-go").addEventListener("click", function () {
  startCrawl().catch(function (err) {
    crawlLog("❌ 未预期的错误：" + (err && err.message ? err.message : err));
    crawl.running = false;
    setCrawlUi(false);
  });
});
$("crawl-stop").addEventListener("click", function () {
  crawl.stopped = true;
  if (crawl.resumeCancel) crawl.resumeCancel();
  if (crawl.delayClear) crawl.delayClear();
  if (crawl.controller) { try { crawl.controller.abort(); } catch (e) {} }
});

/* ---------- 启动 ---------- */

if (!TOKEN) {
  showStatus("⚠️ 服务端未配置 API_TOKEN：请先 wrangler secret put API_TOKEN", true);
} else {
  const preset = new URLSearchParams(location.search).get("url");
  if (preset) {
    $("url").value = preset;
    parse().then(() => { if (!$("go").disabled) download(); });
  }
}
</script>
</body>
</html>
`;
