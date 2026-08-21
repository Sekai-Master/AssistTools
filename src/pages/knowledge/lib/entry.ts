/**
 * 知見ノートの1本を読み取る。
 *
 * 書式の正本は docs/knowledge/README.md。先頭は必ずこの形になっている:
 *
 *   # タイトル
 *
 *   - **状態**: 確定
 *   - **確かめ方**: …
 *   - **出典**: …
 *   - **最終更新**: 2026-08-21
 *   - **関係するツール**: /ranking
 *
 * ★ **状態（確定・有力・未検証・誤り）はこのノートの背骨**なので、読めなければ
 *   「未検証」に倒す。分からないものを「確定」に見せるより、控えめに出すほうが正しい。
 */
import { parseInline, parseMarkdown, type Block, type Inline } from "./md";

export const STATUSES = ["確定", "有力", "未検証", "誤り"] as const;
export type Status = (typeof STATUSES)[number];

/** 状態ごとの色。**確定を派手にしない** ── 目立たせたいのは弱いほうの印。 */
export const STATUS_TONE: Record<
  Status,
  { bg: string; fg: string; note: string }
> = {
  確定: {
    bg: "bg-emerald-100",
    fg: "text-emerald-800",
    note: "独立した2つ以上の根拠が一致しています",
  },
  有力: {
    bg: "bg-amber-50",
    fg: "text-amber-700",
    note: "根拠は1つ。反証は見つかっていません",
  },
  未検証: {
    bg: "bg-rose-50",
    fg: "text-rose-600",
    note: "見聞きした段階です。計算にそのまま使わないでください",
  },
  誤り: {
    bg: "bg-rose-50",
    fg: "text-rose-600",
    note: "広まっていますが、違うと分かったものです",
  },
};

export interface Entry {
  slug: string;
  title: string;
  status: Status;
  /** 見出し4行（状態を除く）。ラベル→中身。 */
  meta: { label: string; value: Inline[] }[];
  updated: string;
  /** 本文（見出し4行より後ろ）。 */
  body: Block[];
  /** 一覧に出す要約＝本文の最初の段落。 */
  summary: Inline[];
}

const isStatus = (v: string): v is Status =>
  (STATUSES as readonly string[]).includes(v);

export function parseEntry(slug: string, src: string): Entry {
  const text = src.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  const titleLine = lines.find((l) => /^#\s+/.test(l)) ?? "";
  const title = titleLine.replace(/^#\s+/, "").trim() || slug;

  // 見出しの箇条書きは、H1 のあと最初の空行までの `- **ラベル**: 中身`。
  const meta: { label: string; value: Inline[] }[] = [];
  let status: Status = "未検証";
  let updated = "";
  let bodyStart = 0;
  for (let i = lines.indexOf(titleLine) + 1; i < lines.length; i++) {
    const m = /^-\s+\*\*(.+?)\*\*\s*[:：]\s*(.*)$/.exec(lines[i]);
    if (m) {
      const [, label, value] = m;
      if (label === "状態") {
        // 「確定（ただし前提つき）」のような書き方も拾う。
        const found = STATUSES.find((s) => value.includes(s));
        if (found && isStatus(found)) status = found;
        meta.push({ label, value: parseInline(value) });
      } else {
        if (label === "最終更新") updated = value.trim();
        meta.push({ label, value: parseInline(value) });
      }
      bodyStart = i + 1;
      continue;
    }
    if (meta.length && lines[i].trim() === "") continue;
    if (meta.length) break;
  }

  const body = parseMarkdown(lines.slice(bodyStart).join("\n"));
  const firstPara = body.find((b) => b.kind === "para");
  return {
    slug,
    title,
    status,
    meta: meta.filter((m) => m.label !== "状態"),
    updated,
    body,
    summary: firstPara && firstPara.kind === "para" ? firstPara.text : [],
  };
}

/**
 * 記事をまとめて読む。**並びは最終更新の新しい順**。
 * 日付が読めないものは最後に回す（並びのために順序を捏造しない）。
 */
export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const ta = Date.parse(a.updated);
    const tb = Date.parse(b.updated);
    if (Number.isNaN(ta) && Number.isNaN(tb))
      return a.title.localeCompare(b.title, "ja");
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}
