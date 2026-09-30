/**
 * 图片收集与并发下载。命名规则与 Python 版一致：sha1(url) 前 14 位 + 扩展名。
 * 免费版 Worker 每请求 50 个子请求：文章 1 + 图片上限 40，留出余量。
 */

import { El, walk } from "./extract";
import { imageSource } from "./markdown";

const MAX_IMAGES = 40;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const CONCURRENCY = 6;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
};

export function collectImageUrls(body: El): string[] {
  const urls: string[] = [];
  walk(body, (node) => {
    if (node.tag === "img") {
      const source = imageSource(node as El);
      if (/^https?:\/\//.test(source) && !urls.includes(source)) urls.push(source);
    }
  });
  return urls.slice(0, MAX_IMAGES);
}

function imageExtension(url: string, contentType: string, data: Uint8Array): string {
  const fmt = new URL(url).searchParams.get("wx_fmt")?.toLowerCase() ?? "";
  if (fmt && fmt !== "other") return "." + (fmt === "jpeg" ? "jpg" : fmt);
  const mainType = contentType.split(";")[0].trim().toLowerCase();
  if (IMAGE_EXT[mainType]) return IMAGE_EXT[mainType];
  const head = Array.from(data.slice(0, 8));
  const hex = head.map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.startsWith("89504e470d0a1a0a")) return ".png";
  if (hex.startsWith("ffd8ff")) return ".jpg";
  if (hex.startsWith("47494638")) return ".gif";
  return ".bin";
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ImageEntry {
  name: string;
  data: Uint8Array;
}

export interface ImageResult {
  entries: ImageEntry[];
  /** 远程 URL → zip 内路径（images/xxx.ext），仅含下载成功的。 */
  map: Map<string, string>;
  failed: number;
}

export async function downloadImages(urls: string[]): Promise<ImageResult> {
  const entries: ImageEntry[] = [];
  const map = new Map<string, string>();
  let failed = 0;
  let totalBytes = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": UA },
          redirect: "follow",
          signal: AbortSignal.timeout(25_000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = new Uint8Array(await resp.arrayBuffer());
        if (totalBytes + data.byteLength > MAX_TOTAL_BYTES) {
          throw new Error("超出总大小上限，跳过");
        }
        totalBytes += data.byteLength;
        const name = `images/${(await sha1Hex(url)).slice(0, 14)}${imageExtension(url, resp.headers.get("content-type") ?? "", data)}`;
        entries.push({ name, data });
        map.set(url, name);
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return { entries, map, failed };
}
