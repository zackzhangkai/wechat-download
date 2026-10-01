/**
 * 路由入口。
 * - GET  /             落地页（Token 由服务端注入，无需手填）
 * - POST /api/parse    Bearer Token 门 → 文章元数据（预览）
 * - POST /api/convert  Bearer Token 门 → 文章 zip（body 可带 withLinks:true 附 links.json）
 * - GET  /fetch-test   诊断端点（host 白名单，仅元数据）
 */

import { convertArticle, parseArticleMeta } from "./convert";
import { LANDING_HTML } from "./page";

export interface Env {
  API_TOKEN?: string;
}

const ALLOWED_HOSTS = new Set(["mp.weixin.qq.com", "mmbiz.qpic.cn"]);
const DEFAULT_TEST_URL = "https://mp.weixin.qq.com/s/ei1PTOYMmP8VRhoj_xOd0Q";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: JSON_HEADERS });
}

/** 统一鉴权：通过返回 null，否则返回对应错误响应。 */
function checkAuth(request: Request, env: Env): Response | null {
  if (!env.API_TOKEN) {
    return json({ error: "未配置 API_TOKEN，请先 wrangler secret put API_TOKEN" }, 503);
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.API_TOKEN}`) {
    return json({ error: "Token 无效" }, 401);
  }
  return null;
}

interface UrlBody {
  url: string;
  withLinks: boolean;
}

async function readUrlBody(request: Request): Promise<UrlBody> {
  const body = (await request.json()) as { url?: unknown; withLinks?: unknown };
  if (typeof body.url !== "string" || !body.url.trim()) throw new Error("缺少 url");
  return { url: body.url, withLinks: body.withLinks === true };
}

async function handleParse(request: Request, env: Env): Promise<Response> {
  const denied = checkAuth(request, env);
  if (denied) return denied;

  let url: string;
  try {
    ({ url } = await readUrlBody(request));
  } catch {
    return json({ error: '请求体应为 JSON：{ "url": "https://mp.weixin.qq.com/s/..." }' }, 400);
  }

  try {
    return json(await parseArticleMeta(url));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 422);
  }
}

async function handleConvert(request: Request, env: Env): Promise<Response> {
  const denied = checkAuth(request, env);
  if (denied) return denied;

  let url: string;
  let withLinks: boolean;
  try {
    ({ url, withLinks } = await readUrlBody(request));
  } catch {
    return json({ error: '请求体应为 JSON：{ "url": "https://mp.weixin.qq.com/s/...", "withLinks": true }' }, 400);
  }

  try {
    const result = await convertArticle(url, { withLinks });
    const meta = {
      title: result.title,
      account: result.account,
      author: result.author,
      published: result.published,
      images: result.images,
      failedImages: result.failedImages,
    };
    return new Response(result.zip, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="article.zip"; filename*=UTF-8''${encodeURIComponent(result.filename)}.zip`,
        "X-Filename": encodeURIComponent(result.filename),
        "X-Meta": encodeURIComponent(JSON.stringify(meta)),
      },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 422);
  }
}

async function handleFetchTest(url: URL): Promise<Response> {
  const target = url.searchParams.get("url") ?? DEFAULT_TEST_URL;
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return json({ error: "invalid url" }, 400);
  }
  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
    return json({ error: `allowed hosts: ${[...ALLOWED_HOSTS].join(", ")}` }, 400);
  }

  const started = Date.now();
  let resp: Response;
  try {
    resp = await fetch(targetUrl.toString(), {
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow",
    });
  } catch (err) {
    return json({ ok: false, fetchError: String(err), ms: Date.now() - started }, 502);
  }

  if (targetUrl.hostname === "mmbiz.qpic.cn") {
    const buf = await resp.arrayBuffer();
    return json({
      ok: true, kind: "image", upstreamStatus: resp.status,
      contentType: resp.headers.get("content-type"),
      bytes: buf.byteLength, ms: Date.now() - started,
    });
  }

  const html = await resp.text();
  return json({
    ok: true, kind: "article", upstreamStatus: resp.status,
    bytes: html.length, ms: Date.now() - started,
    title: /<h1[^>]*id="activity-name"[^>]*>([^<]+)<\/h1>/.exec(html)?.[1]?.trim() ?? null,
    hasJsContent: html.includes('id="js_content"'),
    riskControlMarked: html.includes("环境异常") || html.includes("操作频繁"),
  });
}

/** 落地页：把 API_TOKEN 注入页面脚本（页面本身即持有者可见的配置界面）。 */
function landingPage(env: Env): Response {
  const html = LANDING_HTML.replace("/*__TOKEN__*/null", JSON.stringify(env.API_TOKEN ?? null));
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return landingPage(env);
    }
    if (request.method === "POST" && url.pathname === "/api/parse") {
      return handleParse(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/convert") {
      return handleConvert(request, env);
    }
    if (request.method === "GET" && url.pathname === "/fetch-test") {
      return handleFetchTest(url);
    }
    return new Response("not found", { status: 404 });
  },
};
