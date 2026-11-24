/**
 * 周回プランの名前付きローカル保存（localStorage）。
 * タイムライン（segments）＋開始時刻＋設定スナップショットをまるごと保存する。
 * ストレージ不可（プライベートモード等）や壊れたJSONは黙って空扱いにフォールバック。
 */
import type { Segment } from "./timeline";
import type { PassCourse } from "../../ranking/lib/lbRun";
import type { LiveAssumption } from "./liveAssumption";

/** 休憩中オートの設定（プラン全体で1つ）。2026-08-27 追加。 */
export interface SavedAutoInputs {
  course: PassCourse;
  usedToday: string;
  taki: number;
  songKey: string;
  skillLeader: string;
  skillTotal: string;
  ptOverride: string;
  cycleOverride?: string;
}

export interface SavedPlanInputs {
  songId: string;
  gauge: string;
  /** 「次の回復まで ○分」。2026-08-27 に追加したので、旧データには無い。 */
  nextDecay?: string;
  /** 周回ペース（エビ基準・回/時）。live の想定の欄の値。 */
  rate: string;
  /**
   * どちらのライブの想定で組んだか。2026-11-24 に追加したので旧データには無い（liveOfSavedPlan で読む）。
   */
  live?: LiveAssumption;
  currentPt: string;
  hourlyRate: string;
  refTaki: number;
  /** マイセカイ単価用。2026-08-27 に追加したので旧データには無い。 */
  talent?: string;
  bonus?: string;
  hasWorldPass?: boolean;
  auto?: SavedAutoInputs;
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

/**
 * 保存したプランの想定。想定が無い・読めない値なら "multi"。
 * ★ 想定を足す前の周回プランは、みんなでライブのペース（既定 28 回/時）で保存していた。
 *   ひとりでライブの欄に戻すと、みんなでライブのペースに「ひとりでライブ想定」の札が付き、画像にもそう書かれる。
 */
export function liveOfSavedPlan(inputs: SavedPlanInputs): LiveAssumption {
  return inputs.live === "solo" ? "solo" : "multi";
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
