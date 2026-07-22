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
    // 呼び出し側(loadPlan/parseClock)が前提にする全フィールドをここで検証する。
    // startTime欠けはparseClock(undefined).trim()で、inputs欠けはplan.inputs.songId参照で
    // それぞれ実行時クラッシュになるため、name/segmentsだけでは不十分。
    return parsed.filter((p): p is SavedPlan => {
      if (!p || typeof p !== "object") return false;
      const c = p as Partial<SavedPlan>;
      return (
        typeof c.name === "string" &&
        typeof c.startTime === "string" &&
        Array.isArray(c.segments) &&
        !!c.inputs &&
        typeof c.inputs === "object"
      );
    });
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
