/**
 * 正文树 → Markdown 渲染。对应 Python 版 render_inline / render_blocks / render_block 系列。
 * 图片路径映射到 zip 内的 images/<hash>.<ext>；下载失败的图片回退远程 URL。
 */

import { BLOCK_TAGS, El, Node, TextNode } from "./extract";

const EMPHASIS_PLAIN = new Set(["strong", "b", "em", "i"]);

function isText(node: Node): node is TextNode {
  return node.tag === "#text";
}

export function cleanText(value: string): string {
  return value.replace(/[ \t\r\f\v]+/g, " ").replace(/\n/g, " ").trim();
}

/** BS4 get_text(" ", strip=True) 的近似：文本片段以空格连接后清洗。 */
export function spacedText(node: Node): string {
  const parts: string[] = [];
  walkText(node, (t) => parts.push(t));
  return cleanText(parts.join(" "));
}

/** BS4 get_text() 的近似：原文拼接（保留换行，用于 pre）。 */
export function rawText(node: Node): string {
  let out = "";
  walkText(node, (t) => { out += t; });
  return out;
}

function walkText(node: Node, fn: (text: string) => void): void {
  if (isText(node)) { fn(node.text); return; }
  for (const child of node.children) walkText(child, fn);
}

function childrenOf(node: Node): Node[] {
  return isText(node) ? [] : node.children;
}

export function imageSource(node: El): string {
  const source = (node.attrs["data-src"] || node.attrs["data-lazy-src"] || node.attrs["src"] || "").trim();
  return source.startsWith("//") ? "https:" + source : source;
}

function markdownTarget(path: string): string {
  return encodeURI(path);
}

function renderInline(node: Node, imageMap: Map<string, string>, inEmphasis = false): string {
  if (isText(node)) return cleanText(node.text);
  const name = node.tag;

  if (name === "br") return "  \n";
  if (name === "img") {
    const source = imageSource(node);
    const local = imageMap.get(source);
    const target = local ? markdownTarget(local) : source;
    const alt = cleanText(node.attrs["alt"] ?? "") || "图片";
    return `\n\n![${alt.replace(/\[/g, "(").replace(/\]/g, ")")}](${target})\n\n`;
  }

  const inner = node.children.map((c) => renderInline(c, imageMap, inEmphasis)).join("");
  if (EMPHASIS_PLAIN.has(name)) {
    if (inEmphasis) return cleanText(inner);
    const content = inner.trim();
    if (!content) return "";
    return name === "strong" || name === "b" ? `**${content}**` : `*${content}*`;
  }
  if (name === "code") {
    const content = inner.trim();
    return content ? `\`${content}\`` : "";
  }
  if (name === "a") {
    const href = (node.attrs["href"] ?? "").trim();
    const text = cleanText(inner);
    if (/^https?:\/\//.test(href) && text) return `[${text}](${href})`;
    return text;
  }
  return inner;
}

function hasBlockChild(node: El): boolean {
  return node.children.some((c) => !isText(c) && BLOCK_TAGS.has(c.tag));
}

function inlineParagraphs(node: El, imageMap: Map<string, string>): string[] {
  const raw = node.children.map((c) => renderInline(c, imageMap)).join("");
  return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function renderBlocks(parent: El, imageMap: Map<string, string>): string {
  const output: string[] = [];
  const buffer: string[] = [];
  const flush = () => {
    const text = cleanText(buffer.join(" "));
    if (text) output.push(text);
    buffer.length = 0;
  };

  for (const child of parent.children) {
    if (isText(child)) {
      buffer.push(cleanText(child.text));
      continue;
    }
    if (BLOCK_TAGS.has(child.tag)) {
      flush();
      const rendered = renderBlock(child, imageMap);
      if (rendered) output.push(rendered);
    } else {
      buffer.push(renderInline(child, imageMap));
    }
  }
  flush();
  return output.join("\n\n");
}

function renderList(node: El, imageMap: Map<string, string>, ordered: boolean): string {
  const lines: string[] = [];
  let index = 0;
  for (const item of node.children) {
    if (isText(item) || item.tag !== "li") continue;
    const content = renderBlocks(item, imageMap);
    if (!content) continue;
    index += 1;
    const prefix = ordered ? `${index}. ` : "- ";
    const itemLines = content.split("\n");
    lines.push(prefix + itemLines[0].replace(/^\s+/, ""));
    for (const line of itemLines.slice(1)) lines.push("  " + line.replace(/^\s+/, ""));
  }
  return lines.join("\n");
}

function tableText(node: El): string {
  return spacedText(node).replace(/\|/g, "\\|");
}

function findDescendants(node: Node, tags: string[], out: El[] = []): El[] {
  if (!isText(node)) {
    if (tags.includes(node.tag)) out.push(node);
    for (const child of node.children) findDescendants(child, tags, out);
  }
  return out;
}

function renderTable(node: El, imageMap: Map<string, string>): string {
  const rows = findDescendants(node, ["tr"]);
  if (!rows.length) return "";
  const rendered: string[] = [];
  for (const row of rows) {
    let cells = row.children.filter((c): c is El => !isText(c) && (c.tag === "th" || c.tag === "td"));
    if (!cells.length) cells = findDescendants(row, ["th", "td"]);
    rendered.push("| " + cells.map((c) => tableText(c)).join(" | ") + " |");
  }
  const headerCells = Math.max(rendered[0].split("|").length - 2, 1);
  rendered.splice(1, 0, "| " + Array.from({ length: headerCells }, () => "---").join(" | ") + " |");
  return rendered.join("\n");
}

const CONTAINER_TAGS = new Set(["p", "div", "section", "article", "figcaption", "figure", "dd", "dt", "center"]);

function renderBlock(node: El, imageMap: Map<string, string>): string {
  const name = node.tag;
  if (/^h[1-6]$/.test(name)) {
    return "#".repeat(Number(name[1])) + " " + spacedText(node);
  }
  if (CONTAINER_TAGS.has(name)) {
    if (hasBlockChild(node)) return renderBlocks(node, imageMap);
    return inlineParagraphs(node, imageMap).join("\n\n");
  }
  if (name === "ul" || name === "ol") {
    return renderList(node, imageMap, name === "ol");
  }
  if (name === "blockquote") {
    const content = renderBlocks(node, imageMap);
    return content ? content.split("\n").map((l) => "> " + l).join("\n") : "";
  }
  if (name === "pre") {
    const text = rawText(node).replace(/^\n+|\n+$/g, "");
    return text ? "```\n" + text + "\n```" : "";
  }
  if (name === "table") return renderTable(node, imageMap);
  if (name === "hr") return "---";
  return renderBlocks(node, imageMap);
}

export function bodyToMarkdown(body: El, imageMap: Map<string, string>): string {
  return renderBlocks(body, imageMap);
}

export function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function markdownNote(meta: {
  title: string;
  url: string;
  account: string;
  author: string;
  published: string;
  description: string;
}, body: string): string {
  const created = new Date().toISOString().slice(0, 10);
  return [
    "---",
    `title: ${yamlScalar(meta.title)}`,
    `source: ${yamlScalar(meta.url)}`,
    `account: ${yamlScalar(meta.account)}`,
    `author: ${yamlScalar(meta.author)}`,
    `published: ${meta.published || "null"}`,
    `created: ${created}`,
    `description: ${yamlScalar(meta.description)}`,
    "tags:",
    "  - clippings",
    "  - wechat",
    "---",
    "",
    body.trim(),
    "",
  ].join("\n");
}

/** 文件名清洗，对应 Python 版 safe_filename。 */
export function safeFilename(value: string, fallback = "微信文章"): string {
  let out = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/:*?"<>|#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  out = out.replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 100).trim();
  return out || fallback;
}
