/**
 * 转换编排：抓文章 → 提取 → 下载图片 → 渲染 Markdown → 打包 zip。
 * zip 结构：note.md + images/<sha1 前 14 位>.<ext>（可直接解压进 Obsidian vault）。
 */

import { zipSync, strToU8 } from "fflate";
import { extractArticle } from "./extract";
import { bodyToMarkdown, markdownNote, safeFilename } from "./markdown";
import { collectImageUrls, downloadImages } from "./images";

/** 与本地 skill (save_wechat_article.py) 完全一致的 UA：拿到相同页面变体，图片 URL/哈希与本地管线互通。 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface ConvertResult {
  filename: string;
  zip: Uint8Array;
  title: string;
  account: string;
  author: string;
  published: string;
  images: number;
  failedImages: number;
}

export function normalizeUrl(raw: string): string {
  const value = raw.trim().match(/^https?:\/\//i) ? raw.trim() : `https://${raw.trim()}`;
  const parsed = new URL(value);
  if (parsed.hostname.toLowerCase() !== "mp.weixin.qq.com") {
    throw new Error(`仅支持 mp.weixin.qq.com 文章，当前是 ${parsed.hostname || "空 host"}`);
  }
  parsed.protocol = "https:";
  return parsed.toString();
}

export interface ParseResult {
  title: string;
  account: string;
  author: string;
  published: string;
  description: string;
  images: number;
}

/** 仅抓取并解析元数据（不下载图片），用于页面预览。 */
export async function parseArticleMeta(rawUrl: string): Promise<ParseResult> {
  const url = normalizeUrl(rawUrl);
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`文章抓取失败：HTTP ${resp.status}`);
  const article = await extractArticle(url, await resp.text());
  return {
    title: article.title,
    account: article.account,
    author: article.author,
    published: article.published,
    description: article.description,
    images: collectImageUrls(article.body).length,
  };
}

export async function convertArticle(rawUrl: string): Promise<ConvertResult> {
  const url = normalizeUrl(rawUrl);
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`文章抓取失败：HTTP ${resp.status}`);
  const page = await resp.text();

  const article = await extractArticle(url, page);
  const urls = collectImageUrls(article.body);
  const { entries, map, failed } = await downloadImages(urls);

  const body = bodyToMarkdown(article.body, map);
  const note = markdownNote(article, body);

  const files: Record<string, Uint8Array> = { "note.md": strToU8(note) };
  for (const entry of entries) files[entry.name] = entry.data;
  const zip = zipSync(files, { level: 0 }); // 图片已压缩，仅存档

  return {
    filename: safeFilename(article.title),
    zip,
    title: article.title,
    account: article.account,
    author: article.author,
    published: article.published,
    images: urls.length,
    failedImages: failed,
  };
}
