/**
 * 終了して閉じた計測記録の保管。
 *
 * ★ 進行中の計測（`sekaimaster:lap:v1`）とは**別のキー**に置く。
 *   同じ器に入れると、次の計測を始めた瞬間に前回の記録を踏む。
 */
import type { LapRun } from "./lap";

export const LAP_RUNS_KEY = "sekaimaster:lap:runs:v1";

/**
 * 残す件数の上限。**古いものから捨てる。**
 * 1件あたりマーク列を持つので、無制限だと localStorage を静かに食い潰す
 *（書けなくなったときに壊れるのは記録そのものなので、上限で守る）。
 */
export const MAX_RUNS = 50;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numArr = (v: unknown): number[] => (Array.isArray(v) ? v.filter(isNum) : []);

/** 一覧・書き出しが前提にするフィールドをここで通す。欠けていれば捨てる。 */
function valid(v: unknown): v is LapRun {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<LapRun>;
  return (
    typeof r.id === "string" &&
    isNum(r.savedAt) &&
    isNum(r.startedAt) &&
    isNum(r.endedAt) &&
    isNum(r.laps) &&
    Array.isArray(r.marks)
  );
}

/** 保存済みの記録を新しい順で返す。 */
export function loadRuns(): LapRun[] {
  try {
    const raw = localStorage.getItem(LAP_RUNS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(valid)
      .map((r) => ({
        ...r,
        marks: numArr(r.marks),
        lapsPerSegment: numArr(r.lapsPerSegment),
        excluded: numArr(r.excluded),
        breaks: numArr(r.breaks),
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function write(runs: LapRun[]): boolean {
  try {
    localStorage.setItem(LAP_RUNS_KEY, JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
}

/**
 * 記録を1件足す。**書けたかどうかを返す**
 *（測り終えた記録が保存できていないことは黙っていてはいけない）。
 */
export function addRun(run: LapRun): { runs: LapRun[]; saved: boolean } {
  const runs = [run, ...loadRuns()].slice(0, MAX_RUNS);
  return { runs, saved: write(runs) };
}

export function removeRun(id: string): LapRun[] {
  const runs = loadRuns().filter((r) => r.id !== id);
  write(runs);
  return runs;
}
