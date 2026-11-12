/**
 * 知識ガイドの 1 章（と、入口のページ・スタンプ早見表）を読み取る。
 *
 * ★ 中身の正本は `docs/guide/*.md`（知見ノートと同じく、Markdown をページが raw で読む）。
 * ★ Markdown の解釈は知見ノートの md.ts をそのまま使い、**md.ts は変えない**（知見ノートの表示を壊さない）。
 *   ガイドだけの書き方は、md.ts の前後の小さな変換でここが足す:
 *   - 行が `［図N: 題］` だけ → 図 N を埋め込む（src/pages/guide/figures/figN-*.svg）
 *   - 行が `［画像N: 題］` だけ → 撮影 N の画像。`［画像A1: 題］` は番号の囲みを描いた撮影（台帳は images.ts）
 *   - 行が `［スタンプ早見表］` だけ → スタンプ早見表（docs/guide/stamps.md）
 *   - 段落が `くわしく → 3.2` → その節へのリンク
 *   - 文中の `〔…〕`（確かさの印）→ 印の部品（文字は残す）
 *   - 見出し「ツール」の列がある表（第 9 章）→ パスで src/tools.ts を引いて「説明」の列を足す。
 *     説明文はガイドに書き写さない（ツールの説明を直せばガイドにも出る）
 *   - 自サイトの絶対 URL のリンク → サイトの中の移動にする（新しいタブで開かない）
 *   - 節の見出しの下に「ひとことで」（summary.md。summary.ts）、用語にタップで出る意味（第 8 章。glossary.ts）
 * ★ HTML 文字列は作らない（md.ts と同じ）。構造だけ返して、描画は React 側。
 */
import { SITE_URL } from "../../../lib/site";
import { TOOLS } from "../../../tools";
import { parseInline, parseMarkdown, type Block, type Inline } from "../../knowledge/lib/md";
import { guideImagesOf } from "./images";
import { parseRefs, type Ref } from "./refs";

/** 確かさの印。並びと説明は第 0 章 0.1 の表と同じ。 */
export const MARK_KINDS = [
  { key: "公式", tone: "firm", note: "公式サイトやゲーム内のお知らせ、公式の生放送の告知画像、ゲーム内のルール説明" },
  { key: "ゲームのデータ", tone: "firm", note: "ゲームのマスタデータと、その表からの計算" },
  { key: "このサイトの計算", tone: "firm", note: "このサイトのコードや実測・集計データ" },
  { key: "ゲームの画面", tone: "firm", note: "運営者が撮ったゲームの画面で確かめたこと" },
  { key: "走っている人の実感", tone: "soft", note: "周回の当事者である運営者の実感・慣習" },
  { key: "走っている人の見立て", tone: "soft", note: "運営者による推測" },
  { key: "プレイヤーの間で", tone: "soft", note: "プレイヤーの間で共有されている知識や慣習（公式の裏付けがないもの）" },
] as const;

export type MarkKind = (typeof MARK_KINDS)[number];

/** 印の中身（「公式・2024年9月から」など）から種類を引く。知らない印は undefined。 */
export function markKindOf(inner: string): MarkKind | undefined {
  return MARK_KINDS.find((k) => inner === k.key || inner.startsWith(`${k.key}・`));
}

/** 用語集（第 8 章）の 1 項目。 */
export interface GlossaryEntry {
  /** 見出しの語を「・」で割ったもの（「アンコ・アンコール」→ アンコ・アンコール）。 */
  terms: string[];
  /** 見出しの語そのまま。 */
  label: string;
  def: GuideInline[];
  refs: Ref[];
}

export type Leaf =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "mark"; text: string; mark: MarkKind | undefined }
  /** スタンプの絵（スタンプ早見表の「スタンプ」の列）。 */
  | { kind: "stamp"; asset: string; alt: string }
  /** タップで意味が出る用語。 */
  | { kind: "term"; text: string; entry: GlossaryEntry };

export type GuideInline =
  | Leaf
  /** to があればサイトの中の移動（Link）、無ければ外への新しいタブ。 */
  | { kind: "link"; href: string; to: string | null; parts: Leaf[] };

export type GuideBlock =
  | { kind: "heading"; level: 2 | 3; id: string; text: GuideInline[] }
  | { kind: "para"; text: GuideInline[] }
  | { kind: "list"; ordered: boolean; items: GuideInline[][] }
  | { kind: "table"; head: GuideInline[][]; rows: GuideInline[][][] }
  | { kind: "quote"; text: GuideInline[] }
  | { kind: "code"; text: string }
  | { kind: "rule" }
  | { kind: "figure"; n: number; title: string }
  /** key は撮影の番号（「3」）か、囲みを描いた撮影の番号（「A1」）。 */
  | { kind: "image"; key: string; title: string }
  | { kind: "stamps" }
  | { kind: "summary"; text: GuideInline[] }
  | { kind: "more"; refs: Ref[] };

export interface Chapter {
  n: number;
  /** 章の名前（「3. 」を除いたもの）。 */
  title: string;
  blocks: GuideBlock[];
  /** 節の見出し（### の行）。章の中の目次とアンカーに使う。 */
  sections: { id: string; label: string }[];
  /** 確かめ用（テストで落とす）。差し込みの番号に図・画像が無いもの、表のパスが tools.ts に無いもの。 */
  problems: string[];
}

export interface ParseOptions {
  /** 埋め込める図の番号（figures/ にある SVG）。 */
  figures: ReadonlySet<number>;
  /** 節のアンカー（s3-2）→「ひとことで」。 */
  summaries?: ReadonlyMap<string, GuideInline[]>;
  /** スタンプ早見表を差し込めるか（stamps.md を読めたか）。 */
  hasStamps?: boolean;
}

const INSERT_RE = /^［(図|画像)\s*([A-Z]?\d+)\s*[:：]\s*(.+?)\s*］$/;
const STAMPS_RE = /^［スタンプ早見表］$/;
const MORE_RE = /^くわしく\s*[:：]?\s*[→⇒]\s*(.+)$/;
const MARK_RE = /〔([^〕]+)〕/g;

/** 文字の中の〔…〕を印に割る。 */
function splitMarks(text: string): Leaf[] {
  const out: Leaf[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    out.push({ kind: "mark", text: m[1], mark: markKindOf(m[1]) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

function leaves(xs: Inline[]): Leaf[] {
  return xs.flatMap((x): Leaf[] => {
    if (x.kind === "text") return splitMarks(x.text);
    if (x.kind === "link") return [{ kind: "text", text: x.text }];
    // 太字の中の印（「**…です〔公式〕。**」）も印にする。太字の文字は太字のまま
    if (x.kind === "strong")
      return splitMarks(x.text).map((l): Leaf => (l.kind === "text" ? { kind: "strong", text: l.text } : l));
    return [x];
  });
}

/** 自サイトの URL ならサイトの中のパスを返す。外なら null。 */
export function internalPath(href: string): string | null {
  if (href.startsWith(SITE_URL)) {
    const rest = href.slice(SITE_URL.length);
    if (rest === "") return "/";
    if (rest.startsWith("/") || rest.startsWith("#")) return rest;
    return null;
  }
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return null;
}

/**
 * md.ts の行内の結果を、ガイドの行内にする。
 * ★ リンクの文字は md.ts では生のままなので（[`/knowledge/x`](…) のバッククォートが残る）、ここで読み直す。
 */
export function toGuideInline(xs: Inline[]): GuideInline[] {
  return xs.flatMap((x): GuideInline[] => {
    if (x.kind === "link")
      return [{ kind: "link", href: x.href, to: internalPath(x.href), parts: leaves(parseInline(x.text)) }];
    return leaves([x]);
  });
}

/** 行内の文字を集める（テストと目次で使う）。 */
export function inlineText(xs: GuideInline[]): string {
  return xs
    .map((x) => {
      if (x.kind === "link") return inlineText(x.parts);
      if (x.kind === "mark") return `〔${x.text}〕`;
      if (x.kind === "stamp") return x.alt;
      return x.text;
    })
    .join("");
}

/**
 * 節の見出し「3.2 スキルの発動」→ アンカー「s3-2」。
 * 入口のページの手順「1. ルームに入る」→「step1」。番号が無ければ並びの番号。
 */
export function sectionId(label: string, fallback: number): string {
  const step = /^(\d+)\.\s/.exec(label);
  if (step) return `step${step[1]}`;
  const m = /^(\d+(?:\.\d+)*)\s/.exec(label);
  return m ? `s${m[1].replace(/\./g, "-")}` : `h${fallback}`;
}

/**
 * 差し込みの行（［図N: 題］・［画像N: 題］・［スタンプ早見表］）の前後に空行を入れる。
 * ★ md.ts は空行の無い連続した行を 1 段落につなぐので、2 つの差し込みが続けて書かれていると
 *   「段落がそれだけ」の判定に掛からなくなる（原稿の第 4 章で実際にそうなっている）。
 */
export function isolateInserts(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => {
      const t = l.trim();
      return INSERT_RE.test(t) || STAMPS_RE.test(t) || MORE_RE.test(t) ? `\n${t}\n` : l;
    })
    .join("\n");
}

/** パスからツールを引く（「/border/history」のような 2 段のパスもそのまま）。 */
export function toolOfPath(path: string) {
  const p = path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  return TOOLS.find((t) => t.path === p);
}

/** 表の 1 行からツールのパスを探す。「パス」の列（`/deck`）か、ツールの列のリンク。 */
function pathOfRow(row: GuideInline[][], toolCol: number, pathCol: number): string | null {
  if (pathCol >= 0) {
    const t = inlineText(row[pathCol] ?? []).trim();
    if (t.startsWith("/")) return t;
    const p = internalPath(t);
    if (p) return p;
  }
  for (const x of row[toolCol] ?? []) {
    if (x.kind === "link" && x.to) return x.to;
  }
  return null;
}

/** 見出し「ツール」の列がある表に「説明」の列を足す（説明は tools.ts から）。 */
function withToolDescriptions(
  b: Extract<GuideBlock, { kind: "table" }>,
  problems: string[],
): Extract<GuideBlock, { kind: "table" }> {
  const heads = b.head.map((h) => inlineText(h).trim());
  const toolCol = heads.indexOf("ツール");
  if (toolCol < 0 || heads.includes("説明")) return b;
  const pathCol = heads.indexOf("パス");
  const at = (pathCol > toolCol ? pathCol : toolCol) + 1;
  const insert = <T>(xs: T[], v: T) => [...xs.slice(0, at), v, ...xs.slice(at)];
  return {
    kind: "table",
    head: insert(b.head, [{ kind: "text", text: "説明" }]),
    rows: b.rows.map((r) => {
      const path = pathOfRow(r, toolCol, pathCol);
      const tool = path ? toolOfPath(path) : undefined;
      if (!tool) problems.push(`表の行「${inlineText(r[toolCol] ?? [])}」のツールが tools.ts に無い（${path ?? "パスなし"}）`);
      return insert(r, tool ? [{ kind: "text", text: tool.description }] : []);
    }),
  };
}

/** 段落 1 つを差し込み（図・画像・早見表・くわしく）として読む。当てはまらなければ null。 */
function insertOf(plain: string, opts: ParseOptions, problems: string[]): GuideBlock | null {
  const m = INSERT_RE.exec(plain);
  if (m) {
    if (m[1] === "図") {
      const num = Number(m[2]);
      if (!/^\d+$/.test(m[2]) || !opts.figures.has(num)) problems.push(`図${m[2]} の SVG が無い`);
      return { kind: "figure", n: num, title: m[3] };
    }
    if (!guideImagesOf(m[2])) problems.push(`画像${m[2]} が台帳（images.ts）に無い`);
    return { kind: "image", key: m[2], title: m[3] };
  }
  if (STAMPS_RE.test(plain)) {
    if (opts.hasStamps === false) problems.push("スタンプ早見表（stamps.md）が無い");
    return { kind: "stamps" };
  }
  const more = MORE_RE.exec(plain);
  if (more) {
    const refs = parseRefs(more[1]);
    if (refs.length === 0) problems.push(`「くわしく」の行き先が読めない: ${more[1]}`);
    return { kind: "more", refs };
  }
  return null;
}

/**
 * 1 章（か、入口のページ・早見表）を読む。
 * 最初の `## ` 見出しは blocks から外し、title にする（「3. 」の番号は外す）。
 * summaries に節のアンカーがあれば、その見出しのすぐ下に「ひとことで」を置く。
 */
export function parseChapter(n: number, src: string, opts: ParseOptions): Chapter {
  const problems: string[] = [];
  const raw: Block[] = parseMarkdown(isolateInserts(src));
  let title = "";
  const blocks: GuideBlock[] = [];
  const sections: Chapter["sections"] = [];

  raw.forEach((b, i) => {
    switch (b.kind) {
      case "heading": {
        const text = toGuideInline(b.text);
        const label = inlineText(text).trim();
        if (b.level === 2 && !title) {
          title = label.replace(/^\d+\.\s*/, "");
          return;
        }
        const id = sectionId(label, i);
        if (b.level === 3) sections.push({ id, label });
        blocks.push({ kind: "heading", level: b.level, id, text });
        const summary = opts.summaries?.get(id);
        if (summary) blocks.push({ kind: "summary", text: summary });
        return;
      }
      case "para": {
        const plain = b.text.map((x) => x.text).join("").trim();
        blocks.push(insertOf(plain, opts, problems) ?? { kind: "para", text: toGuideInline(b.text) });
        return;
      }
      case "list":
        blocks.push({ kind: "list", ordered: b.ordered, items: b.items.map(toGuideInline) });
        return;
      case "table":
        blocks.push(
          withToolDescriptions(
            { kind: "table", head: b.head.map(toGuideInline), rows: b.rows.map((r) => r.map(toGuideInline)) },
            problems,
          ),
        );
        return;
      case "quote":
        blocks.push({ kind: "quote", text: toGuideInline(b.text) });
        return;
      case "code":
      case "rule":
        blocks.push(b);
        return;
    }
  });

  return { n, title: title || `第${n}章`, blocks, sections, problems };
}

/** 描画される文字を集める（テストで「記法・差し込みが生のまま残っていないか」を見る）。 */
export function chapterText(blocks: GuideBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "heading":
        case "para":
        case "quote":
        case "summary":
          return inlineText(b.text);
        case "list":
          return b.items.map(inlineText).join("\n");
        case "table":
          return [b.head, ...b.rows].map((r) => r.map(inlineText).join(" ")).join("\n");
        case "code":
          return b.text;
        case "figure":
          return `図${b.n} ${b.title}`;
        case "image":
          return `画像${b.key} ${b.title}`;
        case "more":
          return `くわしく ${b.refs.map((r) => r.label).join("・")}`;
        case "stamps":
        case "rule":
          return "";
      }
    })
    .join("\n");
}

/** URL の章の番号。1 桁の数字だけを受ける（「03」「1a」は見つからない扱い）。 */
export function chapterParam(raw: string | undefined): number | null {
  return raw != null && /^\d$/.test(raw) ? Number(raw) : null;
}

/** ファイル名「ch3.md」→ 3。読めなければ null。 */
export function chapterNumberOf(path: string): number | null {
  const m = /ch(\d+)\.md$/.exec(path);
  return m ? Number(m[1]) : null;
}

/** 図のファイル名「fig3-rooms.svg」→ 3。 */
export function figureNumberOf(path: string): number | null {
  const m = /fig(\d+)-[^/]*\.svg$/.exec(path);
  return m ? Number(m[1]) : null;
}
