/**
 * 協力ライブのアンコール（6 回目のスキル発動）を誰が取るとよいかの判断（純関数）。
 *
 * 前提（根拠の台帳 guide-2026-11/facts.md の 2.4・3.2・4.5）:
 *   - 協力のスキルの発動は 6 か所。参加 5 人が 1 回ずつ＋アンコールの 1 回。
 *     各回に乗るのは、その回を担当した人の実効値（efficiency.ts）
 *   - アンコールを担当するのは、その直前にスコアがいちばん高かった人（運営者の実感・
 *     プレイヤーの間のガイド 3 本。**公式の説明は無い**）。ここで決まり方は計算しない。
 *     「実効値で比べて誰が取ると部屋が得か」だけを出す
 *
 * ★ スコアの式はここに書かない。efficiency.ts の calcScore を、重みを差し替えた曲の写しで
 *   呼んで差を取る（式を二重に持たない）。calcScore の協力の枝は 6 枠に同じ実効値を置くので、
 *   「アンコールの枠だけ」「通常の 5 枠だけ」の重みにした写しを作ればそれぞれの寄与が取れる。
 *   calcScore は floor するので、差は ±1〜2 点ずれる（画面は「約」で出す）。
 */
import {
  calcScore,
  DEFAULT_PARAMS,
  DECK_SIZE,
  SKILL_SLOTS,
  skillWeights,
  type EfficiencyEntry,
} from "../ranking/lib/efficiency";
import { PROFILE_FIELDS } from "../../lib/profiles";
import { toHalfWidthNumber } from "./evcLogic";

/** アンコールの枠（skillScoreMulti の 6 番目＝最後）。 */
const ENCORE_SLOT = SKILL_SLOTS - 1;

/** 実効値の欄の上限。編成の先頭スキルの上限（PROFILE_FIELDS）と同じ。 */
export const ROOM_BEST_MAX = PROFILE_FIELDS.find((f) => f.key === "skillLeader")?.max ?? 1000;

/** 部屋でいちばん高い実効値の欄の読み取り結果。空は 0 にしない（#239 と同じ考え方）。 */
export type RoomBestInput =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "negative" }
  | { kind: "tooLarge"; max: number }
  | { kind: "ok"; value: number };

export function parseRoomBest(raw: string): RoomBestInput {
  if ((raw ?? "").trim() === "") return { kind: "empty" };
  // 全角のマイナス（－・−）も負として扱う
  const signed = raw.replace(/[－−]/g, "-");
  const v = toHalfWidthNumber(signed);
  if (v === null) return { kind: "invalid" };
  // 16 進（0x1F4）・指数（1e3）は Number() が読んでしまうので、数字と小数点だけに絞る
  const half = signed.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^-?[0-9,，]*\.?[0-9]+$/.test(half.trim())) return { kind: "invalid" };
  if (v < 0) return { kind: "negative" };
  if (v > ROOM_BEST_MAX) return { kind: "tooLarge", max: ROOM_BEST_MAX };
  return { kind: "ok", value: v };
}

export type EncoreVerdict = "take" | "yield" | "split";

/**
 * 自分の実効値が部屋の最高と同じか上なら取りに行ってよい、下なら譲る。
 *
 * @param range 実効値の候補が複数ある編成（特訓前のユニットキャラ）の [最小, 最大]。
 *              部屋の最高が候補の幅の中にあれば、どちらとも言い切らない（split）
 */
export function encoreVerdict(mine: number, roomBest: number, range?: readonly [number, number]): EncoreVerdict {
  if (range) {
    if (range[0] >= roomBest) return "take";
    if (range[1] < roomBest) return "yield";
    return "split";
  }
  return mine >= roomBest ? "take" : "yield";
}

/** 曲（1 難易度）のアンコールの重み。協力の重みが無い曲は null。 */
export function encoreWeight(entry: EfficiencyEntry): number | null {
  return skillWeights(entry, "multi")?.[ENCORE_SLOT] ?? null;
}

export interface EncoreGap {
  /** 1 人あたりのスコアの差（最高の人が取った場合 − 自分が取った場合）。総合力が無ければ null。 */
  points: number | null;
  /** 自分が取ったときの 1 人あたりのスコアに対する、差の割合。 */
  ratio: number;
}

/** 総合力が無いときに割合だけを出すための内部の総合力（画面には出さない。floor の誤差を小さくするため大きく取る）。 */
const RATIO_POWER = 1_000_000;

/** 重みを差し替えた写しで、6 枠すべてに同じ実効値を置いたスコアを出す。 */
function scoreWith(entry: EfficiencyEntry, weights: number[], effective: number, power: number): number | null {
  return calcScore(
    { ...entry, skillScoreMulti: weights },
    // skillLeader = skillTotal = E なら multiEffectiveSkill は E を返す
    { ...DEFAULT_PARAMS, power, skillLeader: effective, skillTotal: effective },
    "multi",
  );
}

/**
 * 部屋の最高の人がアンコールを取った場合と、自分が取った場合の 1 人あたりのスコアの差。
 *
 * - 差はアンコールの枠だけで決まる（ほかの 5 回は誰が取っても同じ人の実効値が乗る）
 * - 割合の分母（自分が取ったときのスコア）には通常の 5 回の実効値が要る。発動順はランダムなので
 *   5 人の平均を置き、分からないほかの 3 人は**部屋の最高と同じ**とする（強い部屋を仮に置き、
 *   譲る得を大きく見せない側に倒す）
 */
export function encoreGap(
  entry: EfficiencyEntry,
  mine: number,
  roomBest: number,
  power: number | null,
): EncoreGap | null {
  const weights = skillWeights(entry, "multi");
  const encore = encoreWeight(entry);
  if (weights == null || encore == null) return null;
  const encoreOnly = weights.map((_, i) => (i === ENCORE_SLOT ? encore : 0));
  const regularOnly = weights.map((w, i) => (i === ENCORE_SLOT ? 0 : w));
  const none = weights.map(() => 0);

  const gapAt = (p: number): { gap: number; mineTakes: number } | null => {
    const bestEncore = scoreWith(entry, encoreOnly, roomBest, p);
    const mineEncore = scoreWith(entry, encoreOnly, mine, p);
    const regularAvg = (mine + roomBest * (DECK_SIZE - 1)) / DECK_SIZE;
    const regular = scoreWith(entry, regularOnly, regularAvg, p);
    const baseOnly = scoreWith(entry, none, 0, p);
    if (bestEncore == null || mineEncore == null || regular == null || baseOnly == null) return null;
    // base が 2 回入るので 1 回ぶん引く
    return { gap: bestEncore - mineEncore, mineTakes: regular + mineEncore - baseOnly };
  };

  const hasPower = power != null && power > 0;
  const forRatio = gapAt(hasPower ? power : RATIO_POWER);
  if (forRatio == null) return null;
  // 分母は実効値の低いほうが取ったときのスコア（「替えると何 % 上がるか」の、替える前）。
  // 自分が低ければ自分が取ったとき、自分が高ければ最高の人が取ったとき（= 自分が取ったとき + 差）
  const denom = forRatio.gap >= 0 ? forRatio.mineTakes : forRatio.mineTakes + forRatio.gap;
  const ratio = denom > 0 ? forRatio.gap / denom : 0;
  return { points: hasPower ? forRatio.gap : null, ratio };
}
