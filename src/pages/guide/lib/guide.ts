/**
 * 知識ガイドの 1 章を読み取る。
 *
 * ★ 中身の正本は `docs/guide/chN.md`（知見ノートと同じく、Markdown をページが raw で読む）。
 * ★ Markdown の解釈は知見ノートの md.ts をそのまま使い、**md.ts は変えない**（知見ノートの表示を壊さない）。
 *   ガイドだけの書き方は、md.ts の前後の小さな変換でここが足す:
 *   - 行が `［図N: 題］` だけ → 図 N を埋め込む（src/pages/guide/figures/figN-*.svg）
 *   - 行が `［画像N: 題］` だけ → 撮影 N の画像（台帳は images.ts）
 *   - 文中の `〔…〕`（確かさの印）→ 印の部品（文字は残す）
 *   - 見出し「ツール」の列がある表（第 9 章）→ パスで src/tools.ts を引いて「説明」の列を足す。
 *     説明文はガイドに書き写さない（ツールの説明を直せばガイドにも出る）
 *   - 自サイトの絶対 URL のリンク → サイトの中の移動にする（新しいタブで開かない）
 * ★ HTML 文字列は作らない（md.ts と同じ）。構造だけ返して、描画は React 側。
 */
import { SITE_URL } from "../../../lib/site";
import { TOOLS } from "../../../tools";
import { parseInline, parseMarkdown, type Block, type Inline } from "../../knowledge/lib/md";
import { guideImagesOf } from "./images";

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

type Leaf =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "mark"; text: string; mark: MarkKind | undefined };

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
  | { kind: "image"; n: number; title: string };

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

const INSERT_RE = /^［(図|画像)\s*(\d+)\s*[:：]\s*(.+?)\s*］$/;
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
      return x.text;
    })
    .join("");
}

/** 節の見出し「3.2 スキルの発動」→ アンカー「s3-2」。番号が無ければ並びの番号。 */
export function sectionId(label: string, fallback: number): string {
  const m = /^(\d+(?:\.\d+)*)\s/.exec(label);
  return m ? `s${m[1].replace(/\./g, "-")}` : `h${fallback}`;
}

/**
 * 差し込みの行（［図N: 題］・［画像N: 題］）の前後に空行を入れる。
 * ★ md.ts は空行の無い連続した行を 1 段落につなぐので、2 つの差し込みが続けて書かれていると
 *   「段落がそれだけ」の判定に掛からなくなる（原稿の第 4 章で実際にそうなっている）。
 */
export function isolateInserts(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => (INSERT_RE.test(l.trim()) ? `\n${l.trim()}\n` : l))
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

/**
 * 1 章を読む。figures は埋め込める図の番号（figures/ にある SVG）。
 * 章の見出し（## N. 名前）は blocks から外し、title にする。
 */
export function parseChapter(n: number, src: string, figures: ReadonlySet<number>): Chapter {
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
        return;
      }
      case "para": {
        const plain = b.text.map((x) => x.text).join("").trim();
        const m = INSERT_RE.exec(plain);
        if (m) {
          const num = Number(m[2]);
          if (m[1] === "図") {
            if (!figures.has(num)) problems.push(`図${num} の SVG が無い`);
            blocks.push({ kind: "figure", n: num, title: m[3] });
          } else {
            if (!guideImagesOf(num)) problems.push(`画像${num} が台帳（images.ts）に無い`);
            blocks.push({ kind: "image", n: num, title: m[3] });
          }
          return;
        }
        blocks.push({ kind: "para", text: toGuideInline(b.text) });
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
          return `画像${b.n} ${b.title}`;
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
