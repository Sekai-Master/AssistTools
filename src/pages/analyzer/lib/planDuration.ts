import { ADJUST_LIVE_OVERHEAD_SEC } from "./constants";
import type { MultiLivePlan } from "./multiLiveAdjust";

/**
 * 調整プランの所要時間の導出。
 *
 * ## なぜ探索結果（MultiLiveUnit）に時間を持たせないか
 *
 * ユニットが確定させるのは「基礎点」までで、実際に叩く曲はユーザーが選び直せる
 * （同じ基礎点130でも 74.8 秒の曲と 182.1 秒の曲がある）。探索時点の曲で秒数を
 * 焼き込むと、曲を変えた瞬間に表示が嘘になる。そこで時間は「採択曲 → 秒数」の
 * 対応（TimeForBase）を受け取る純関数として表示層で導出する。
 * これにより calculator.ts / MusicData / 探索本体は時間を一切知らなくて済む。
 *
 * ## なぜ回数ではなく時間が要るか
 *
 * 基礎点が高い曲ほど長い（基礎点130=メルト182.1秒 / 基礎点100=独りんぼエンヴィー74.8秒）
 * ため、回数は時間の代理指標にならない。「本数を増やしてLBを節約」案が実際に
 * 何分余計にかかるかは、この関数を通してしか出せない。
 */

/**
 * 基礎点 → 採択曲の演奏秒数。曲が引けない・music_time が欠損しているときは undefined。
 * UI 側で「採択曲があればそれ、なければ同一基礎点の最短曲」を解決して渡す。
 */
export type TimeForBase = (basePoint: number) => number | undefined;

/** 1条件（同一曲・同一LB・同一スコア帯）ぶんの所要秒 = (演奏秒 + オーバーヘッド) × 回数。 */
export function unitDurationSec(musicTimeSec: number, count: number): number {
  return (musicTimeSec + ADJUST_LIVE_OVERHEAD_SEC) * count;
}

/**
 * プラン全体の所要秒。
 * どれか1ユニットでも時間不明なら undefined を返す（不明ぶんを 0 秒として足すと
 * 「短くて得なプラン」に見えてしまい、この改修の判断材料を逆に壊すため）。
 */
export function planDurationSec(
  plan: Pick<MultiLivePlan, "units">,
  timeForBase: TimeForBase
): number | undefined {
  let total = 0;
  for (const unit of plan.units) {
    const sec = timeForBase(unit.basePoint);
    // music_time は 0 や欠損を取りうるマスタ由来の値なので、正の有限値だけを信じる
    if (sec === undefined || !Number.isFinite(sec) || sec <= 0) return undefined;
    total += unitDurationSec(sec, unit.count);
  }
  return total;
}

/**
 * 「約N分」表記。切り上げ（実戦では過小申告の方が痛い）かつ最低1分。
 * 「約0分」は情報量がなく誤解を招くので出さない。
 */
export function formatApproxMinutes(sec: number): string {
  const safe = Number.isFinite(sec) ? sec : 0;
  return `約${Math.max(1, Math.ceil(safe / 60))}分`;
}
