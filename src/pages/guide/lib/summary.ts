/**
 * 各節の「ひとことで」。正本は docs/guide/summary.md（`### N.M 節名` の次の行が要点）。
 * 本文の Markdown は変えず、ページが節の見出しのすぐ下に差し込む（guide.ts の parseChapter）。
 * summary.md に無い節には何も出さない。summary.md にあって本文に無い節はテストで落とす。
 */
import { parseInline } from "../../knowledge/lib/md";
import { sectionId, toGuideInline, type GuideInline } from "./guide";

export interface SummaryItem {
  id: string;
  label: string;
  text: GuideInline[];
}

export function parseSummaryItems(src: string): SummaryItem[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: SummaryItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = /^###\s+(.+)$/.exec(lines[i].trim());
    if (!h) continue;
    const label = h[1].trim();
    // 次の空でない行。見出しが先に来たら、その節の要点は無い
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const body = lines[j]?.trim() ?? "";
    if (!body || body.startsWith("#")) continue;
    out.push({ id: sectionId(label, i), label, text: toGuideInline(parseInline(body.replace(/^[-*>]\s+/, ""))) });
  }
  return out;
}

export function parseSummaries(src: string): Map<string, GuideInline[]> {
  return new Map(parseSummaryItems(src).map((s) => [s.id, s.text]));
}
