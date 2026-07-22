/**
 * 周回プランの名前付きローカル保存（localStorage）。
 * タイムライン（segments）＋開始時刻＋設定スナップショットをまるごと保存する。
 * ストレージ不可（プライベートモード等）や壊れたJSONは黙って空扱いにフォールバック。
 */
import type { Segment } from "./timeline";

export interface SavedPlanInputs {
  songId: string;
  gauge: string;
  rate: string;
  currentPt: string;
  hourlyRate: string;
  refTaki: number;
}

export interface SavedPlan {
  name: string;
  /** 保存時刻(ms)。一覧の新しい順ソートに使う。 */
  savedAt: number;
  startTime: string;
  segments: Segment[];
  inputs: SavedPlanInputs;
}

const KEY = "sekaimaster:plans:v1";

function read(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SavedPlan =>
        !!p && typeof p.name === "string" && Array.isArray((p as SavedPlan).segments)
    );
  } catch {
    return [];
  }
}

function write(plans: SavedPlan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans));
  } catch {
    // 容量超過・ストレージ不可は無視（保存は best-effort）
  }
}

/** 新しい順の一覧。 */
export function listPlans(): SavedPlan[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

/** 同名は上書き（upsert）。更新後の一覧を返す。 */
export function savePlan(plan: SavedPlan): SavedPlan[] {
  const rest = read().filter((p) => p.name !== plan.name);
  rest.push(plan);
  write(rest);
  return listPlans();
}

export function deletePlan(name: string): SavedPlan[] {
  write(read().filter((p) => p.name !== name));
  return listPlans();
}
