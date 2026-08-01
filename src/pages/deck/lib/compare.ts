/**
 * 編成どうしの比較。
 *
 * ★★ ここがこのツールの存在意義。★★
 *   ゲーム内の「おまかせ編成」はイベントボーナスしか見ないので、
 *   **「ボーナスを5%落として総合力を盛った方が、最終的なイベントPtで勝つ」**が出せない。
 *   ボーナス最大化だけなら、おまかせで足りる。
 *
 * ★ 新しい式は作らない。スコア→イベントPt は効率曲ランキングで実測検証済みの
 *   calcScore / eventPtFor（src/pages/ranking/lib/efficiency.ts）をそのまま使う。
 *   ここでやるのは「編成ごとの総合力・ボーナスを差し替えて並べる」配線だけ。
 *
 * ★ スキル値は**編成ごとに計算している**（skill.ts）。カードが1意に決まっていて
 *   スキルレベルを入力してもらえるので、以前の「全編成共通の近似」は要らなくなった。
 *   同ユニット加算のように編成で変わるスキルも、ここでは正しく差が出る。
 */
import {
  calcScore,
  eventPtFor,
  type EfficiencyEntry,
  type EfficiencyParams,
  type LiveType,
} from "../../ranking/lib/efficiency";

/** 比較にかける編成1つぶん。 */
export interface DeckCandidate {
  /** 画面での識別（保存名など）。 */
  name: string;
  power: number;
  /** イベントボーナス(%)。**切り捨てず小数のまま渡す**（0.5刻みが結果に効く）。 */
  bonus: number;
  /**
   * 先頭スキル・内部値。
   * ★ カードが決まればスキルレベルから計算できるので、**編成ごとに違う値**を渡す。
   *   以前は全編成共通の近似だった（スキル表を配信していなかったため）。
   */
  skillLeader: number;
  skillTotal: number;
}

/** 全編成に共通の条件（叩き方の前提）。 */
export interface CompareCondition {
  live: LiveType;
  taki: number;
  overheadSec: number;
}

export interface CompareRow extends DeckCandidate {
  /** データが欠けていて計算できなければ null（黙って0にしない）。 */
  score: number | null;
  eventPt: number | null;
  /** 1プレイの所要秒。 */
  cycleSec: number;
  ptPerHour: number | null;
}

/**
 * 編成ごとのスコアと最終イベントPtを出す。**並び順は入力のまま**（比較は横並びで見るもので、
 * 勝手に並べ替えると「どれをいじったか」が分からなくなる）。
 */
export function compareDecks(
  decks: DeckCandidate[],
  entry: EfficiencyEntry,
  cond: CompareCondition
): CompareRow[] {
  const cycleSec = (entry.musicTime ?? 0) + cond.overheadSec;
  return decks.map((d) => {
    const params: EfficiencyParams = {
      power: d.power,
      bonus: d.bonus,
      taki: cond.taki,
      skillLeader: d.skillLeader,
      skillTotal: d.skillTotal,
      overheadSec: cond.overheadSec,
    };
    const score = calcScore(entry, params, cond.live);
    const eventPt =
      score == null || entry.eventRate == null ? null : eventPtFor(cond.live, score, entry.eventRate, params);
    return {
      ...d,
      score,
      eventPt,
      cycleSec,
      ptPerHour: eventPt == null || cycleSec <= 0 ? null : (eventPt / cycleSec) * 3600,
    };
  });
}

/** 最終Ptが一番大きい行の位置。全部計算できなければ -1。 */
export function bestIndex(rows: CompareRow[]): number {
  let best = -1;
  for (let i = 0; i < rows.length; i++) {
    const pt = rows[i].eventPt;
    if (pt == null) continue;
    if (best < 0 || pt > (rows[best].eventPt ?? -Infinity)) best = i;
  }
  return best;
}

/**
 * 「ボーナスは低いのに最終Ptで勝っている」行があるか。
 *
 * ★ これが出せることがこのツールの value proposition そのものなので、
 *   起きたときは画面で明示的に指摘する（数字を並べるだけだと見落とされる）。
 */
export function findUpset(rows: CompareRow[]): { winner: CompareRow; loser: CompareRow } | null {
  const usable = rows.filter((r) => r.eventPt != null);
  if (usable.length < 2) return null;
  const topBonus = usable.reduce((a, b) => (b.bonus > a.bonus ? b : a));
  const topPt = usable.reduce((a, b) => ((b.eventPt ?? 0) > (a.eventPt ?? 0) ? b : a));
  if (topPt === topBonus || topPt.bonus >= topBonus.bonus) return null;
  return { winner: topPt, loser: topBonus };
}
