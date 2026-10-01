/**
 * 正文内链收集：整号抓取（内链遍历）的链接发现层。
 * 规则与本地 skill (crawl_account.py canonical_url / discover_links) 一致，
 * 保证浏览器端 BFS 与本地管线拿到同一批 URL。
 */

import { El, walk } from "./extract";

/**
 * 规范化微信文章 URL：去 hash，强制 https + mp.weixin.qq.com；
 * /s/<token> 形式只保留 path（query 是分享追踪参数），/s?query 形式保留 query。
 */
export function canonicalArticleUrl(raw: string): string {
  const value = raw.split("#", 1)[0].trim();
  try {
    const parsed = new URL(value);
    const query = parsed.pathname.startsWith("/s/") ? "" : parsed.search;
    return `https://mp.weixin.qq.com${parsed.pathname}${query}`;
  } catch {
    return "";
  }
}

/** 收集正文树里的公众号文章内链（canonical 化、去重保序）。 */
export function collectArticleLinks(body: El): string[] {
  const links: string[] = [];
  walk(body, (node) => {
    if (node.tag !== "a") return;
    let href = (node.attrs["href"] ?? "").trim();
    if (href.startsWith("//")) href = "https:" + href;
    if (!href.startsWith("https://mp.weixin.qq.com/s")) return;
    const canonical = canonicalArticleUrl(href);
    if (canonical && !links.includes(canonical)) links.push(canonical);
  });
  return links;
}
