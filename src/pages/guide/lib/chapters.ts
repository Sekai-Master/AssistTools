/**
 * 知識ガイドの全章と図を読み込む（ページ用）。
 *
 * - 本文の正本は docs/guide/chN.md。docs/ は src の外だが、知見ノート・更新履歴と同じく raw で読める
 * - 図は src/pages/guide/figures/figN-*.svg。**img ではなく SVG のまま埋め込む**。img で読むと
 *   サイトの CSS 変数（--neu-ink・--color-ln など）が効かず、ダークモードで崩れる
 */
import { chapterNumberOf, figureNumberOf, parseChapter, type Chapter } from "./guide";

const DOCS = import.meta.glob("../../../../docs/guide/ch*.md", {
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

const figureNumbers = new Set(FIGURES.keys());

/** 章の番号順（0 が前置き）。 */
export const CHAPTERS: readonly Chapter[] = Object.entries(DOCS)
  .flatMap(([path, src]) => {
    const n = chapterNumberOf(path);
    return n == null ? [] : [parseChapter(n, src, figureNumbers)];
  })
  .sort((a, b) => a.n - b.n);

/** 章の生の Markdown（題と説明文を seo.ts と同じ作りで出すため）。 */
export const CHAPTER_SOURCES: ReadonlyMap<number, string> = new Map(
  Object.entries(DOCS).flatMap(([path, src]) => {
    const n = chapterNumberOf(path);
    return n == null ? [] : [[n, src] as const];
  }),
);
