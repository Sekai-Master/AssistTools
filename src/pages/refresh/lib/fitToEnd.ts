/**
 * 休憩の「自動」と、最後の稼働の「イベ乙まで」（2026-11-25、持ち主の決めた案 B）。
 *
 * 最後のブロックが「イベ乙まで」の稼働なら、その長さはイベ乙までの残り（ほかのブロックを積んだ後の残り）。
 * さらに休憩が 1 つだけ「自動」なら、その休憩の長さを、イベ乙でゲージがちょうど 100%（届かなければ一番近い手前）に
 * なるよう逆算する。寝る時間などは時間で固定し、自動は 1 つだけ、という使い方を想定する。
 *
 * ## 解き方
 * 基準は lib/restUntilEnd.ts と同じ: 終わりが 100% 以下になる、いちばん短い休憩 R（稼働がいちばん長い＝ポイントがいちばん多い）。
 * restUntilEnd.ts は「残りを休憩 R と稼働に分ける」閉じた式（段の数 n と R*）で解くが、ここでは自動の休憩の後にも
 * 時間・ゲージで決めたブロックが挟まり、30 分タイマーの繰り越しもブロックをまたぐので、simulateTimeline をそのまま物差しにする:
 * - 自動の休憩を R 分（整数）にして積み、ほかのブロックの後の残りを「イベ乙まで」の稼働の長さ L(R) にする
 * - 最後の稼働が 100% で頭打ちにならない（ムダが出ない）いちばん小さい R を、倍々に広げてから二分探索で探す
 *   （R を延ばすほど、段が下がり稼働が短くなるので、終わりのゲージは下がっていく）
 * 自動の休憩のすぐ後が最後の稼働のとき（間に何も挟まない）は、休憩中に 0% で下げ止まらない限り restUntilEnd.ts の答えと
 * 同じ分になる（試験で突き合わせる）。restUntilEnd.ts は休憩を高いゲージの所に置ける前提なので、低いゲージで自動の休憩を
 * 取ると 0% で下げ止まったぶん長くなる（置いた場所どおりに数える）。
 *
 * ## 解けないとき（画面は自動・イベ乙までの長さを「—」にするだけ）
 * - 自動の休憩が 2 つ以上: どれも 0 分（どう分けるかを決めない。1 つに絞ってもらう）
 * - 自動の休憩はあるが、最後が「イベ乙まで」の稼働でない: 自動は 0 分
 * - イベ乙の時刻か開始の日時が分からない: 自動もイベ乙までも 0 分
 * - 積んだブロックだけでイベ乙を過ぎる: 自動もイベ乙までも 0 分
 * 自動が無く最後が「イベ乙まで」だけなら、残りを走る（100% を越えればムダとして出る）。
 */
import { type Segment, simulateTimeline } from "./timeline";

export type FitStatus =
  /** 自動もイベ乙までも使っていない */
  | "off"
  /** 長さを入れた（自動が 1 つなら逆算、無ければイベ乙まで走るだけ） */
  | "solved"
  /** 自動の休憩が 2 つ以上 */
  | "many"
  /** 自動の休憩があるが、最後が「イベ乙まで」の稼働でない */
  | "needEnd"
  /** イベ乙の時刻か開始の日時が分からない */
  | "noEnd"
  /** 積んだブロックだけでイベ乙を過ぎる */
  | "past";

export interface FitResult {
  /** 自動の休憩とイベ乙までの稼働に長さ（minutes）を入れた写し。simulateTimeline にはこちらを渡す */
  segments: Segment[];
  status: FitStatus;
}

export interface FitOptions {
  startPercent: number;
  overheadSec: number;
  startDecayProgress: number;
  /** プランの開始からイベ乙までの分。分からなければ null */
  minutesToEnd: number | null;
}

/** i 番目のブロックが「イベ乙まで」の稼働として効いているか（最後のブロックのときだけ）。 */
export function isUntilEnd(segments: readonly Segment[], i: number): boolean {
  const g = segments[i];
  return i === segments.length - 1 && g?.kind === "play" && g.untilEnd === true;
}

/** 休憩が「自動」か。 */
export function isFitRest(g: Segment): boolean {
  return g.kind === "rest" && g.fitToEnd === true;
}

/** 最後の稼働が 100% で頭打ちになったとみなすムダ（分）。浮動小数の端数は拾わない */
const WASTE_EPS = 1e-9;

export function resolveFitToEnd(segments: readonly Segment[], opts: FitOptions): FitResult {
  const last = segments.length - 1;
  const endOn = isUntilEnd(segments, last);
  const autos = segments.flatMap((g, i) => (isFitRest(g) ? [i] : []));
  if (!endOn && autos.length === 0) return { segments: [...segments], status: "off" };

  /** 自動の休憩を rest 分、イベ乙までの稼働を play 分にした写し（目標%は外し、時間で積む）。 */
  const build = (rest: number, play: number): Segment[] =>
    segments.map((g, i) => {
      if (g.kind === "rest" && autos.includes(i)) return { ...g, minutes: rest, targetPercent: undefined };
      if (endOn && i === last && g.kind === "play") return { ...g, minutes: play, targetPercent: undefined };
      return g;
    });
  const simulate = (segs: readonly Segment[]) =>
    simulateTimeline(segs, opts.startPercent, opts.overheadSec, opts.startDecayProgress);
  const zero = (status: FitStatus): FitResult => ({ segments: build(0, 0), status });

  if (autos.length >= 2) {
    if (!endOn || !isKnown(opts.minutesToEnd)) return zero("many");
    return { segments: build(0, Math.max(0, opts.minutesToEnd - simulate(build(0, 0)).totalMinutes)), status: "many" };
  }
  if (!endOn) return zero("needEnd");
  if (!isKnown(opts.minutesToEnd)) return zero("noEnd");
  const total = opts.minutesToEnd;

  /** 自動を rest 分にしたときの、イベ乙までの稼働の長さ（負ならイベ乙を過ぎる）。 */
  const playLeft = (rest: number) => total - simulate(build(rest, 0)).totalMinutes;
  if (playLeft(0) < 0) return zero("past");
  if (autos.length === 0) return { segments: build(0, playLeft(0)), status: "solved" };

  /** 自動を rest 分にしたとき: 最後の稼働が頭打ちにならないか。イベ乙を過ぎるなら null。 */
  const fits = (rest: number): boolean | null => {
    const play = playLeft(rest);
    if (play < 0) return null;
    const r = simulate(build(rest, play));
    return r.points[last].wastedMinutes <= WASTE_EPS;
  };

  // fits は R を延ばすと false … false, true … true, null … null と並ぶ。最初の false でない R を探す
  if (fits(0) === true) return { segments: build(0, playLeft(0)), status: "solved" };
  let lo = 0; // fits(lo) === false
  let hi = 1;
  while (fits(hi) === false) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid) === false) lo = mid;
    else hi = mid;
  }
  // hi で頭打ちが消える。hi がイベ乙を過ぎる（残りが 1 分に満たず頭打ちのまま）なら、休める限りの lo
  const rest = fits(hi) === true ? hi : lo;
  return { segments: build(rest, Math.max(0, playLeft(rest))), status: "solved" };
}

function isKnown(v: number | null): v is number {
  return v != null && Number.isFinite(v);
}
