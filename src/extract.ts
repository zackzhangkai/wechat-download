/**
 * 文章提取：HTMLRewriter 流式解析微信文章页，产出元数据 + #js_content 轻量树。
 * 对应 Python 版 extract_article（save_wechat_article.py）。
 */

export interface El {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}

export interface TextNode {
  tag: "#text";
  text: string;
}

export type Node = El | TextNode;

export interface Article {
  url: string;
  title: string;
  account: string;
  author: string;
  published: string;
  description: string;
  body: El;
}

/** 块级标签（与 Python 版 BLOCK_TAGS 一致）。 */
export const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "center", "dd", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "li", "ol", "p", "pre", "section", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "ul",
]);

const VOID_TAGS = new Set(["br", "img", "hr", "input", "source", "embed"]);

/** 正文内直接丢弃的标签（Python 版 decompose 列表）。 */
const DROP_TAGS = new Set(["script", "style", "svg", "iframe"]);
const DROP_CLASSES = [
  "qr_code_pc_outer", "js_pc_qr_code", "rich_media_tool",
  "js_tags", "reward_area", "content_bottom_area",
];

/** HTMLRewriter 只提供按名取值，这里枚举需要的属性。 */
const KEEP_ATTRS = [
  "src", "data-src", "data-lazy-src", "alt", "href", "class", "id",
  "colspan", "rowspan", "data-width", "data-type",
];

/** HTMLRewriter 的 text chunk 不解码实体，入树前统一解码。 */
function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

export function scriptValue(page: string, names: string[]): string {
  // 与 Python 版一致：按名字优先级逐个找，首个匹配即返回（避免撞上混淆 JS 的同名变量）。
  for (const name of names) {
    const pattern = new RegExp(`var\\s+${name}\\s*=\\s*["']?(.*?)["']?\\s*;`, "i");
    const match = pattern.exec(page);
    if (match) return decodeEntities(match[1]).trim().replace(/^['"]|['"]$/g, "");
  }
  return "";
}

export function parseDate(raw: string): string {
  const value = raw.trim();
  const textual = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/.exec(value);
  if (textual) {
    const [, y, m, d] = textual;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const ts = /^(\d{10})(?:000)?$/.exec(value);
  if (ts) {
    // 微信 ct 为北京时间纪元，固定 +8 转换，避免 Workers(UTC) 与本地时区差一天。
    return new Date(Number(ts[1]) * 1000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return "";
}

interface Capture {
  text: string;
  done: boolean;
}

function textCapture(store: Map<string, Capture>, key: string) {
  const cap: Capture = { text: "", done: false };
  store.set(key, cap);
  return {
    element() {
      cap.text = "";
    },
    text(t: { text: string; lastInTextNode?: boolean }) {
      cap.text += t.text;
      if (t.lastInTextNode) cap.done = true;
    },
  };
}

/**
 * 从页面 HTML 提取文章。抛错条件与 Python 版一致（缺标题/缺正文）。
 */
export async function extractArticle(url: string, page: string): Promise<Article> {
  const metas = new Map<string, string>();
  const caps = new Map<string, Capture>();
  const root: El = { tag: "#js_content", attrs: {}, children: [] };
  const stack: El[] = [];
  let inContent = false;
  let dropDepth = 0;
  let sawContent = false;
  let riskMarked = page.includes("环境异常");

  function shouldDrop(tag: string, attrs: Record<string, string>): boolean {
    if (DROP_TAGS.has(tag)) return true;
    const cls = attrs["class"] ?? "";
    return DROP_CLASSES.some((c) => cls.split(/\s+/).includes(c));
  }

  const bodyHandler = {
    element(el: { tagName: string; getAttribute(k: string): string | null; onEndTag(cb: () => void): void }) {
      const attrs: Record<string, string> = {};
      for (const key of KEEP_ATTRS) {
        const value = el.getAttribute(key);
        if (value !== null) attrs[key] = value;
      }
      // 属性值同样带 HTML 实体（&amp; 等）：解码后哈希/抓取才能与 BS4 管线一致。
      for (const key of ["alt", "href", "src", "data-src", "data-lazy-src"]) {
        if (attrs[key]) attrs[key] = decodeEntities(attrs[key]);
      }
      if (!inContent) return;
      if (dropDepth > 0 || shouldDrop(el.tagName, attrs)) {
        dropDepth += 1;
        if (VOID_TAGS.has(el.tagName)) dropDepth -= 1;
        else el.onEndTag(() => { dropDepth -= 1; });
        return;
      }
      const node: El = { tag: el.tagName, attrs, children: [] };
      const parent = stack.length ? stack[stack.length - 1] : root;
      parent.children.push(node);
      if (!VOID_TAGS.has(el.tagName)) {
        stack.push(node);
        el.onEndTag(() => { stack.pop(); });
      }
    },
    text(t: { text: string }) {
      if (!inContent || dropDepth > 0) return;
      const parent = stack.length ? stack[stack.length - 1] : root;
      parent.children.push({ tag: "#text", text: decodeEntities(t.text) });
    },
  };

  const rewriter = new HTMLRewriter()
    .on('meta[name="description"]', {
      element(el) { const c = el.getAttribute("content"); if (c) metas.set("description", c); },
    })
    .on('meta[property="og:description"]', {
      element(el) { const c = el.getAttribute("content"); if (c && !metas.has("description")) metas.set("description", c); },
    })
    .on('meta[property="og:title"]', {
      element(el) { const c = el.getAttribute("content"); if (c) metas.set("og:title", c); },
    })
    .on('meta[property="og:article:author"]', {
      element(el) { const c = el.getAttribute("content"); if (c) metas.set("og:author", c); },
    })
    .on("#activity-name", textCapture(caps, "title"))
    .on("#js_name", textCapture(caps, "account"))
    .on("#js_author_name", textCapture(caps, "author"))
    .on("#publish_time", textCapture(caps, "published"))
    .on("#js_content", {
      element(el) {
        inContent = true;
        sawContent = true;
        const cls = el.getAttribute("class") ?? "";
        if (cls) root.attrs["class"] = cls;
        el.onEndTag(() => { inContent = false; });
      },
      // 嵌套文本会同时冒泡到本 handler 与 `#js_content *` 的内层 handler；
      // 仅当栈为空（正文直接挂根上的裸文本）时处理，避免重复入树。
      text(t) { if (stack.length === 0) bodyHandler.text(t); },
    })
    .on("#js_content *", bodyHandler);

  await rewriter.transform(new Response(page)).arrayBuffer();

  let title = (caps.get("title")?.text ?? "").trim() || metas.get("og:title") || "";
  title = decodeEntities(title);
  if (!title) title = scriptValue(page, ["msg_title", "msgTitle"]);
  if (!title) throw new Error("未找到文章标题，可能不是普通公众号文章页");

  let account = (caps.get("account")?.text ?? "").trim() || metas.get("og:author") || "";
  account = decodeEntities(account);
  if (!account) account = scriptValue(page, ["nickname", "nickName"]);

  let author = decodeEntities((caps.get("author")?.text ?? "")).trim();
  if (!author) author = account;

  let published = (caps.get("published")?.text ?? "").trim();
  if (!published) published = scriptValue(page, ["createTime", "create_time", "publish_time", "ct"]);
  published = parseDate(published);

  const description = decodeEntities(metas.get("description") ?? "").trim();

  if (!sawContent) {
    const hint = riskMarked ? "（页面提示：环境异常）" : "";
    throw new Error(`未找到 #js_content 正文${hint}`);
  }

  return { url, title, account, author, published, description, body: root };
}

export function isText(node: Node): node is TextNode {
  return node.tag === "#text";
}

/** 遍历树（深度优先，含文本节点）。 */
export function walk(node: Node, fn: (n: Node) => void): void {
  fn(node);
  if (!isText(node)) {
    for (const child of node.children) walk(child, fn);
  }
}
