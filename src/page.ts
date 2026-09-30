/** 落地页：贴地址自动解析信息，一键下载 zip。Token 由服务端注入，无需手填。 */

export const LANDING_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>微信文章下载</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: -apple-system, "PingFang SC", "Segoe UI", sans-serif;
    background: #f6f7f9; color: #1f2328;
  }
  @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } }
  main { width: min(560px, calc(100vw - 32px)); padding: 32px 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 24px; font-size: 13px; opacity: .65; }
  input {
    width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px;
    border: 1px solid #d0d7de; border-radius: 8px; background: transparent; color: inherit;
  }
  @media (prefers-color-scheme: dark) { input { border-color: #30363d; } }
  button {
    margin-top: 16px; width: 100%; padding: 11px; font-size: 15px; cursor: pointer;
    border: 0; border-radius: 8px; background: #1f2328; color: #fff;
  }
  @media (prefers-color-scheme: dark) { button { background: #e6edf3; color: #0d1117; } }
  button:disabled { opacity: .5; cursor: wait; }
  #preview {
    margin-top: 14px; padding: 14px; border: 1px solid #d0d7de; border-radius: 8px;
    font-size: 13px; line-height: 1.8; display: none;
  }
  @media (prefers-color-scheme: dark) { #preview { border-color: #30363d; } }
  #preview .title { font-size: 15px; font-weight: 600; }
  #preview .desc { opacity: .7; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  #status { margin-top: 14px; font-size: 13px; white-space: pre-wrap; line-height: 1.7; }
  #status.err { color: #d1242f; }
</style>
</head>
<body>
<main>
  <h1>微信文章下载</h1>
  <p class="sub">贴入公众号文章链接，自动解析，一键下载 Markdown + 图片</p>
  <input id="url" placeholder="https://mp.weixin.qq.com/s/..." autofocus>
  <div id="preview"></div>
  <button id="go" disabled>下载 zip</button>
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
