/** 极简落地页：贴链接 → 下载 zip。Token 仅存浏览器 localStorage。 */

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
  label { display: block; font-size: 13px; margin: 14px 0 6px; opacity: .8; }
  input {
    width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px;
    border: 1px solid #d0d7de; border-radius: 8px; background: transparent; color: inherit;
  }
  @media (prefers-color-scheme: dark) { input { border-color: #30363d; } }
  button {
    margin-top: 20px; width: 100%; padding: 11px; font-size: 15px; cursor: pointer;
    border: 0; border-radius: 8px; background: #1f2328; color: #fff;
  }
  @media (prefers-color-scheme: dark) { button { background: #e6edf3; color: #0d1117; } }
  button:disabled { opacity: .5; cursor: wait; }
  #status { margin-top: 16px; font-size: 13px; white-space: pre-wrap; line-height: 1.7; }
  #status.err { color: #d1242f; }
</style>
</head>
<body>
<main>
  <h1>微信文章下载</h1>
  <p class="sub">公众号文章 → Markdown + 图片（zip），可直接导入 Obsidian</p>
  <label for="url">文章链接</label>
  <input id="url" placeholder="https://mp.weixin.qq.com/s/..." autofocus>
  <label for="token">访问 Token</label>
  <input id="token" type="password" placeholder="API Token">
  <button id="go">下载 zip</button>
  <div id="status"></div>
</main>
<script>
const $ = (id) => document.getElementById(id);
const tokenKey = "wechat-download-token";
$("token").value = localStorage.getItem(tokenKey) ?? "";
$("go").addEventListener("click", async () => {
  const token = $("token").value.trim();
  localStorage.setItem(tokenKey, token);
  const status = $("status");
  status.className = "";
  status.textContent = "转换中…（含图片下载，约需十几秒）";
  $("go").disabled = true;
  try {
    const resp = await fetch("/api/convert", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ url: $("url").value.trim() }),
    });
    if (!resp.ok) throw new Error((await resp.text()) || ("HTTP " + resp.status));
    const blob = await resp.blob();
    const filename = decodeURIComponent(
      (resp.headers.get("X-Filename") ?? "wechat-article") + ".zip");
    const meta = JSON.parse(decodeURIComponent(resp.headers.get("X-Meta") ?? "{}"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    status.textContent = [
      "✅ " + filename,
      "标题：" + (meta.title ?? ""),
      "公众号：" + (meta.account ?? ""),
      meta.published ? "发布：" + meta.published : "",
      "图片：" + meta.images + " 张" + (meta.failedImages ? "（" + meta.failedImages + " 张失败）" : ""),
    ].filter(Boolean).join("\\n");
  } catch (err) {
    status.className = "err";
    status.textContent = "❌ " + (err && err.message ? err.message : err);
  } finally {
    $("go").disabled = false;
  }
});
</script>
</body>
</html>
`;
