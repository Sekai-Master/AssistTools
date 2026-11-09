/**
 * ボーダー予測のページに置く「いま使えるツール」（純粋関数）。
 *
 * ★ X から来た人の多くは /border に着くが、ほかのツールへ移る人がほぼいなかった
 *   （Cloudflare の refererPath で 30 日: /border → /plan が約 10、ほかはトップへ戻るだけ。2026-11-09）。
 *   開催中の回の時期から、その時期に開くツールを 2〜3 個だけ出す。
 * ★ 移動は refererPath（/border → 各ツール）で測る。リンクにクエリ文字列や計測用の印を付けない。
 * ★ ツールの名前・アイコン・説明の正本は src/tools.ts。ここでは id で引くだけで、二重に定義しない。
 */
import { TOOLS, type ToolDef } from "../../tools";
import { eventEndMs } from "../../../workers/border/src/model";
import type { Snapshot } from "./borderView";

/** early＝序盤（開始〜開始日の翌日いっぱい）・mid＝中盤・late＝終盤（集計日の前日 12:00〜集計まで） */
export type ToolPhase = "early" | "mid" | "late";

const H = 3_600_000;
const DAY = 24 * H;

/** その時刻を含む日本時間の日の 0:00（workers/border/src/intro.ts の jstDay と同じ書き方） */
const jstDay = (ms: number) => Math.floor((ms + 9 * H) / DAY) * DAY - 9 * H;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * いまの時期。開催中でなければ null（始まる前・終わった後・時刻が読めない）。
 *
 * - 日付は日本時間で数える。ワールドリンク（20:00 開始・19:59:59 集計）でも、開始日・集計日は日本時間の日付
 * - 終わりはページの「開催中」の判定（borderView.ts の phaseOf: 集計＋1分まで）とそろえる
 * - ★ 短い回では序盤と終盤が重なる（24 時間のチアフルは開始から終盤）。重なったら終盤。着地の調整のほうが時間に追われる
 */
export function toolPhaseOf(event: Pick<Snapshot["event"], "startAt" | "aggregateAt">, now: number): ToolPhase | null {
  const { startAt, aggregateAt } = event;
  if (!isNum(startAt) || !isNum(aggregateAt) || !isNum(now) || aggregateAt <= startAt) return null;
  if (now < startAt || now > eventEndMs({ aggregateAt })) return null;
  if (now >= jstDay(aggregateAt) - DAY + 12 * H) return "late";
  if (now < jstDay(startAt) + 2 * DAY) return "early";
  return "mid";
}

/**
 * 時期ごとに出すツール（src/tools.ts の id）。
 * 序盤は編成を決める、中盤は走る量を見積もる・曲を選ぶ、終盤は着地を合わせる。
 */
const SHELF: Record<ToolPhase, readonly string[]> = {
  early: ["deck", "compare", "plan"],
  mid: ["plan", "worktime", "ranking"],
  late: ["analyzer", "plan"],
};

/** 先頭に大きく出す（説明を 1 行添える）ツール。終盤のアナライザーだけ */
const LEAD: Partial<Record<ToolPhase, string>> = { late: "analyzer" };

export interface ShelfItem {
  tool: ToolDef;
  /** 先頭に大きく出す */
  lead: boolean;
}

export function shelfItems(phase: ToolPhase, tools: readonly ToolDef[] = TOOLS): ShelfItem[] {
  return SHELF[phase].flatMap((id) => {
    const tool = tools.find((t) => t.id === id && t.status === "ready");
    return tool ? [{ tool, lead: LEAD[phase] === id }] : [];
  });
}

export interface ToolShelf {
  phase: ToolPhase;
  items: ShelfItem[];
}

/**
 * ページが読む形。開催中の回が無い・終わった後は null（何も置かない）。
 * ★ snapshot は API の値を `as` で受けているだけなので、event が無い・時刻が数でない形もここで null にする。
 *   着地のページなので、ここで例外を出して予測ごと見えなくしない。
 */
export function toolShelf(snap: Snapshot | null, now: number): ToolShelf | null {
  const event: unknown = snap?.event;
  if (!event || typeof event !== "object") return null;
  const phase = toolPhaseOf(event as Snapshot["event"], now);
  if (!phase) return null;
  const items = shelfItems(phase);
  return items.length > 0 ? { phase, items } : null;
}
