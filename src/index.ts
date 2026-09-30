/**
 * Spike worker: 验证 Cloudflare 数据中心 IP 直接抓取微信公众号文章是否触发风控。
 * 仅返回元数据（标题/大小/风控标记），不回传全文，避免变成开放代理。
 */

const ALLOWED_HOSTS = new Set(["mp.weixin.qq.com", "mmbiz.qpic.cn"]);
const DEFAULT_TEST_URL = "https://mp.weixin.qq.com/s/ei1PTOYMmP8VRhoj_xOd0Q";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("wechat-download spike online. See /fetch-test\n", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/fetch-test") {
      const target = url.searchParams.get("url") ?? DEFAULT_TEST_URL;
      let targetUrl: URL;
      try {
        targetUrl = new URL(target);
      } catch {
        return Response.json({ error: "invalid url" }, { status: 400 });
      }
      if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
        return Response.json(
          { error: `allowed hosts: ${[...ALLOWED_HOSTS].join(", ")}` },
          { status: 400 },
        );
      }

      const started = Date.now();
      let resp: Response;
      try {
        resp = await fetch(targetUrl.toString(), {
          headers: {
            "User-Agent": UA,
            "Accept-Language": "zh-CN,zh;q=0.9",
          },
          redirect: "follow",
        });
      } catch (err) {
        return Response.json(
          { ok: false, fetchError: String(err), ms: Date.now() - started },
          { status: 502 },
        );
      }

      if (targetUrl.hostname === "mmbiz.qpic.cn") {
        const buf = await resp.arrayBuffer();
        return Response.json({
          ok: true,
          kind: "image",
          upstreamStatus: resp.status,
          contentType: resp.headers.get("content-type"),
          bytes: buf.byteLength,
          ms: Date.now() - started,
        });
      }

      const html = await resp.text();
      const title =
        /<h1[^>]*id="activity-name"[^>]*>([^<]+)<\/h1>/.exec(html)?.[1]?.trim() ??
        /property="og:title"\s+content="([^"]+)"/.exec(html)?.[1] ??
        null;

      return Response.json({
        ok: true,
        kind: "article",
        upstreamStatus: resp.status,
        bytes: html.length,
        ms: Date.now() - started,
        title,
        hasJsContent: html.includes('id="js_content"'),
        riskControlMarked:
          html.includes("环境异常") ||
          html.includes("操作频繁") ||
          html.includes("访问过于频繁"),
        head: html.slice(0, 300),
      });
    }

    return new Response("not found", { status: 404 });
  },
};
