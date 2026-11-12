/**
 * 知識ガイドの全章・入口のページ・スタンプ早見表と図を読み込む（ページ用）。
 *
 * - 本文の正本は docs/guide/chN.md。docs/ は src の外だが、知見ノート・更新履歴と同じく raw で読める
 * - 入口のページは docs/guide/start.md、スタンプ早見表は stamps.md、各節の「ひとことで」は summary.md
 * - 図は src/pages/guide/figures/figN-*.svg。**img ではなく SVG のまま埋め込む**。img で読むと
 *   サイトの CSS 変数（--neu-ink・--color-ln など）が効かず、ダークモードで崩れる
 * - 組み立ては buildGuide（テストからは fs で読んだ文字列を渡して同じものを作る）
 */
import { buildCards, type GuideCard } from "./cards";
import { annotateTerms, parseGlossary } from "./glossary";
import { chapterNumberOf, figureNumberOf, parseChapter, type Chapter, type GuideBlock } from "./guide";
import { stampTableBlocks } from "./stamps";
import { parseSummaryItems, type SummaryItem } from "./summary";

/** 第 4 章で、スタンプ早見表を出す節（この節の終わり＝次の見出しの前に置く）。 */
export const STAMPS_AFTER_SECTION = "s4-3";

export interface GuideSources {
  /** 章の番号 → Markdown。 */
  chapters: ReadonlyMap<number, string>;
  start?: string;
  stamps?: string;
  summary?: string;
  figures: ReadonlySet<number>;
}

export interface Guide {
  chapters: Chapter[];
  start: Chapter | null;
  /** スタンプ早見表の本文（表のセルは絵に置き換え済み）と題。 */
  stamps: GuideBlock[];
  stampsTitle: string;
  /** 組み立てで見つかった食い違い（テストで落とす）。 */
  problems: string[];
}

/** 節（id の見出し）の終わり、つまり次の見出しの直前に block を差し込む。 */
function insertAfterSection(blocks: GuideBlock[], id: string, block: GuideBlock): GuideBlock[] | null {
  const at = blocks.findIndex((b) => b.kind === "heading" && b.id === id);
  if (at < 0) return null;
  const next = blocks.findIndex((b, i) => i > at && b.kind === "heading");
  const end = next < 0 ? blocks.length : next;
  return [...blocks.slice(0, end), block, ...blocks.slice(end)];
}

/** 節の無い章の要点: summary.md の「N.1 名前」で、名前が章の名前と同じもの。 */
function chapterSummaryOf(c: Chapter, items: SummaryItem[]): SummaryItem | undefined {
  return items.find((x) => x.id === `s${c.n}-1` && x.label.replace(/^\d+\.\d+\s*/, "") === c.title);
}

export function buildGuide(src: GuideSources): Guide {
  const problems: string[] = [];
  const summaryItems = src.summary ? parseSummaryItems(src.summary) : [];
  const summaries = src.summary ? new Map(summaryItems.map((x) => [x.id, x.text])) : undefined;
  const glossary = parseGlossary(src.chapters.get(8) ?? "");
  const opts = { figures: src.figures, summaries, hasStamps: src.stamps != null };

  const chapters = [...src.chapters.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, md]) => {
      const c = parseChapter(n, md, opts);
      // 用語集そのもの（第 8 章）の中では語をボタンにしない
      let blocks = n === 8 ? c.blocks : annotateTerms(c.blocks, glossary);
      if (n === 4 && src.stamps != null) {
        const placed = insertAfterSection(blocks, STAMPS_AFTER_SECTION, { kind: "stamps" });
        if (placed) blocks = placed;
        else problems.push(`第 4 章に ${STAMPS_AFTER_SECTION} の節が無い（スタンプ早見表を置けない）`);
      }
      // 節の無い章（第 8・9 章）は、summary.md の「N.1 章の名前」を章の要点として先頭に出す
      const whole = c.sections.length === 0 ? chapterSummaryOf(c, summaryItems) : undefined;
      if (whole) blocks = [{ kind: "summary", text: whole.text }, ...blocks];
      return { ...c, blocks };
    });

  const startRaw = src.start != null ? parseChapter(0, src.start, opts) : null;
  const start = startRaw ? { ...startRaw, blocks: annotateTerms(startRaw.blocks, glossary) } : null;

  const stampsDoc = src.stamps != null ? parseChapter(0, src.stamps, opts) : null;
  const stamps = stampsDoc ? stampTableBlocks(stampsDoc.blocks, problems) : [];
  if (stampsDoc) problems.push(...stampsDoc.problems.map((x) => `stamps.md: ${x}`));
  if (startRaw) problems.push(...startRaw.problems.map((x) => `start.md: ${x}`));

  // summary.md の節が本文に無ければ落とす（節の名前を変えたのに要点が付いて来ない、を防ぐ）
  if (summaries) {
    const ids = new Set(chapters.flatMap((c) => c.sections.map((s) => s.id)));
    const whole = new Set(chapters.flatMap((c) => (c.sections.length === 0 ? [chapterSummaryOf(c, summaryItems)?.id] : [])));
    for (const id of summaries.keys())
      if (!ids.has(id) && !whole.has(id)) problems.push(`summary.md の ${id} が本文の節に無い`);
  }

  return { chapters, start, stamps, stampsTitle: stampsDoc?.title ?? "スタンプ早見表", problems };
}

// ---- ページ用（Vite が docs/ と figures/ を文字列で読み込む） ----

const DOCS = import.meta.glob("../../../../docs/guide/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SVGS = import.meta.glob("../figures/fig*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** 図の番号 → SVG の文字列。 */
export const FIGURES: ReadonlyMap<number, string> = new Map(
  Object.entries(SVGS).flatMap(([path, svg]) => {
    const n = figureNumberOf(path);
    return n == null ? [] : [[n, svg] as const];
  }),
);

const docOf = (name: string) => Object.entries(DOCS).find(([p]) => p.endsWith(`/${name}`))?.[1];

/** 章の生の Markdown（題と説明文を seo.ts と同じ作りで出すため）。 */
export const CHAPTER_SOURCES: ReadonlyMap<number, string> = new Map(
  Object.entries(DOCS).flatMap(([path, src]) => {
    const n = chapterNumberOf(path);
    return n == null ? [] : [[n, src] as const];
  }),
);

export const GUIDE: Guide = buildGuide({
  chapters: CHAPTER_SOURCES,
  start: docOf("start.md"),
  stamps: docOf("stamps.md"),
  summary: docOf("summary.md"),
  figures: new Set(FIGURES.keys()),
});

/** 章の番号順（0 が前置き）。 */
export const CHAPTERS: readonly Chapter[] = GUIDE.chapters;

/** まとめ画像の 6 枚（1 枚目の alt は入口のページの手順の題から）。 */
export const CARDS: GuideCard[] = buildCards(GUIDE.start?.sections.map((x) => x.label) ?? []);
