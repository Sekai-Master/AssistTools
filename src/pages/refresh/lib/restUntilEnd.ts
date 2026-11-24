/**
 * イベント終了（イベ乙）までに、あと合計何分休めば、残りを走りっぱなしで終了時刻にゲージ 100% ちょうど（以下）になるか。
 *
 * 起点（ゲージ G0・繰り越しのタイマー p 分・終了までの残り T 分）からの残りを、休憩の合計 R 分と稼働 T − R 分に分ける。
 * - 稼働はゲージを一定の速さ v（= ライブ 1 回の増加 ÷ 1 周の分）で上げる。周回は timeline.ts と同じく割り算のまま
 * - 休憩は p と合わせて累計 30 分たまるごとに一段（decayPer30min）下げる。n 段に要るいちばん短い休憩は
 *   R(0) = 0、R(n) = 30n − p（n ≥ 1）
 * - 100% に届く前（かつ 0% を割らない所）に休むなら、休憩をどこに置いても終わりのゲージは同じ:
 *   終わり = G0 + v × (T − R) − n × 一段
 * 段の数 n を 0 から増やし、n 段になる範囲 R(n) ≤ R < R(n+1) で、終わりが 100% 以下になるいちばん短い R を探す:
 *   ちょうど 100% にする休憩 R* = T − (100% − G0 + n × 一段) ÷ v
 *   R* < R(n+1) なら R = max(R(n), R*)。R* が R(n) 以上ならちょうど 100%、下なら段の刻みで 100% 未満で終わる
 * R がいちばん短い＝稼働がいちばん長いので、ポイントもいちばん多い。R* ≤ T なので、R(n) が T を超える前に必ず見つかる
 * （段が来なくても、100% で止まって残りを休めば届かない）。
 */
import { DECAY_INTERVAL_MIN, GAUGE_SPEC, type GaugeSpec, internalFromPercent, liveGaugeInternal } from "./gaugeModel";
import { playSeconds } from "./sessionPlanner";
import { fmtDuration } from "./format";

export interface RestUntilEndInput {
  /** 起点のゲージ（表示% 0〜100） */
  startPercent: number;
  /** 起点で繰り越している減少タイマーの進捗（分, 0〜30）。「次の回復まで」から作る */
  decayProgressMin: number;
  /** 起点からイベント終了までの分 */
  minutesLeft: number;
  /** 残りを走る曲 */
  refreshConstant: number;
  songLengthSec: number;
  /** 周回ペースから出したロス（ひとりでライブ／みんなでライブで違う） */
  overheadSec: number;
}

export type RestUntilEnd =
  /** 休まず走っても終了時刻に 100% 以下 */
  | { kind: "noRest"; finalPercent: number }
  /**
   * 合計 restMinutes 分休めば 100% 以下で終わる（分は切り上げ）。ticks はそのうち下がる段の数。
   * exact は「ちょうど 100%」（false は段の刻みでちょうどにならず、終わりは finalPercent）
   */
  | { kind: "rest"; restMinutes: number; ticks: number; exact: boolean; finalPercent: number };

/**
 * ゲーム内の「次の回復まで 0分」は 1 分未満の残り。休憩の分は切り上げて出すので、最初の段に 1 分は休む扱いにする
 * （繰り越し 30 のまま数えると「0分休めば」になる）。
 */
const MAX_CARRY_MIN = DECAY_INTERVAL_MIN - 1;
const EPS = 1e-9;

/** いまの起点から、イベ乙で 100% ちょうど（以下）にするための合計の休憩。終了が過ぎている・曲が無いときは null。 */
export function restUntilEnd(input: RestUntilEndInput, spec: GaugeSpec = GAUGE_SPEC): RestUntilEnd | null {
  const left = input.minutesLeft;
  if (!Number.isFinite(left) || !(left > 0)) return null;
  const per = liveGaugeInternal(input.refreshConstant, spec);
  const secPerPlay = playSeconds(input.songLengthSec, input.overheadSec);
  if (!(per > 0) || !(secPerPlay > 0) || !(spec.decayPer30min > 0)) return null;

  const speed = per / (secPerPlay / 60);
  const g0 = internalFromPercent(input.startPercent, spec);
  const carry = Math.max(0, Math.min(MAX_CARRY_MIN, Number.isFinite(input.decayProgressMin) ? input.decayProgressMin : 0));
  const minRest = (n: number) => (n === 0 ? 0 : n * DECAY_INTERVAL_MIN - carry);
  const finalOf = (rest: number, n: number) =>
    (Math.max(0, Math.min(spec.max, g0 + speed * Math.max(0, left - rest) - n * spec.decayPer30min)) / spec.max) * 100;

  // R* ≤ T なので、R(n) が T を超える前に必ず返る（上限は念のため）
  const maxTicks = Math.ceil((left + carry) / DECAY_INTERVAL_MIN) + 1;
  for (let n = 0; n <= maxTicks; n++) {
    const lo = minRest(n);
    const hi = minRest(n + 1);
    const exactRest = left - (spec.max - g0 + n * spec.decayPer30min) / speed;
    if (exactRest >= hi) continue;
    const exact = exactRest >= lo - EPS;
    let rest = Math.ceil(Math.max(lo, exactRest) - EPS);
    // 切り上げで次の段の境目に乗ると 1 段多く下がる。1 分戻す（届くのは 1 分未満の稼働ぶん）
    if (rest >= hi) rest -= 1;
    if (rest <= 0) return { kind: "noRest", finalPercent: finalOf(0, 0) };
    return { kind: "rest", restMinutes: rest, ticks: n, exact, finalPercent: finalOf(rest, n) };
  }
  return null;
}

/** 表示%（小数第 2 位切り捨て。ゲーム内の表示と同じ）。 */
const fmtPercent = (p: number) => (Math.floor(p * 10 + EPS) / 10).toFixed(1);

/** 1 行の文を [前, 強調する値, 後] に分けたもの。endLabel は formatEventEnd の「11/29 20:59」。 */
export function restUntilEndParts(r: RestUntilEnd, endLabel: string): [string, string, string] {
  if (r.kind === "noRest") return ["休まず走り切れます（イベ乙で ", `${fmtPercent(r.finalPercent)}%`, "）"];
  const tail = r.exact ? "100% ちょうど" : `${fmtPercent(r.finalPercent)}%`;
  return [`イベ乙（${endLabel}）までに、あと合計 `, fmtDuration(r.restMinutes), `休めば ${tail}`];
}

/** 1 行の文。 */
export function restUntilEndText(r: RestUntilEnd, endLabel: string): string {
  return restUntilEndParts(r, endLabel).join("");
}

/** イベ乙の時刻（集計の aggregateAt, ms）を日本時間の「11/29 20:59」に。 */
export function formatEventEnd(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * 時計の時刻（その日の分）→ 日時(ms)。周回プランの開始時刻は日付を持たないので、
 * いまの 1 時間前から先の 23 時間のうちのその時刻とする（ゲージ・タイマーは「いま」の値を開始に使うので、開始は先の予定とみなす）。
 */
export function clockToMs(minOfDay: number, nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(Math.floor(minOfDay / 60), minOfDay % 60, 0, 0);
  if (d.getTime() < nowMs - 60 * 60_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}
