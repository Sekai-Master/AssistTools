/**
 * 「この枠を別のカードに替えたら、どれだけ動くか」。
 *
 * ── なぜ総当たりではなくこれなのか ────────────────────────────
 * 全編成の総当たりは**所持カード全部の育成状態**が前提になる。数百枚ぶんの
 * Lv/特訓/MR/SL を入力してもらわないと「持っていないカードを含む最強編成」が出て
 * 使い物にならない。入力コストが価値を上回る（Nori と確認 2026-08-02）。
 *
 * 一方これは**すでに台帳にあるカード**（＝編成に入れたことがある＝持っている証拠が
 * あるカード）だけを候補にするので、追加の入力がゼロで済む。しかもゲームの
 * 「おまかせ編成」が出せないのは結局ここ ── 1枚入れ替えたときに
 * **ボーナスが下がっても総合力で勝つか**という判断だけなので、必要十分になる。
 *
 * ★ 式は持たない。既存の evaluateDeck（総合力・ボーナス・スキル）と
 *   compareDecks（スコア→イベントPt）をそのまま呼ぶ。
 */
import { compareDecks, type CompareCondition } from "./compare";
import { evaluateDeck, type EvalContext } from "./evaluate";
import type { EfficiencyEntry } from "../../ranking/lib/efficiency";
import type { CatalogCard } from "./deckInputs";

export interface SwapCandidate {
  cardId: number;
  /** 入れ替えたあとの値。 */
  power: number;
  bonus: number;
  /** いまの編成との差。 */
  deltaPower: number;
  deltaBonus: number;
  /** 楽曲を渡したときだけ出る最終Ptの差。**これが判断の本命**。 */
  deltaPt: number | null;
}

export interface SwapBaseline {
  power: number;
  bonus: number;
  pt: number | null;
}

/**
 * いまの編成と、1枠だけ入れ替えた場合を並べる。
 *
 * @param slotIndex 入れ替える枠
 * @param candidates 候補カード（呼び出し側が台帳などで絞ってから渡す）
 * @param entry 比べる曲。渡さなければ最終Ptは出さない（総合力とボーナスだけ）
 */
export function swapCandidates(
  cardIds: (number | null)[],
  slotIndex: number,
  candidates: CatalogCard[],
  ctx: EvalContext,
  opts: { leaderIndex: number; supportBonus: number; entry?: EfficiencyEntry | null; cond?: CompareCondition }
): { baseline: SwapBaseline; rows: SwapCandidate[] } {
  const evalAt = (ids: (number | null)[]) =>
    evaluateDeck(ids, opts.leaderIndex, opts.supportBonus, ctx);

  const ptOf = (ev: ReturnType<typeof evaluateDeck>): number | null => {
    if (!opts.entry || !opts.cond) return null;
    const [row] = compareDecks(
      [
        {
          name: "",
          power: ev.power.total,
          bonus: ev.bonus?.total ?? 0,
          skillLeader: ev.skill.leader,
          skillTotal: ev.skill.total,
        },
      ],
      opts.entry,
      opts.cond
    );
    return row?.eventPt ?? null;
  };

  const base = evalAt(cardIds);
  const baseline: SwapBaseline = {
    power: base.power.total,
    bonus: base.bonus?.total ?? 0,
    pt: ptOf(base),
  };

  const current = cardIds[slotIndex];
  const rows: SwapCandidate[] = [];
  for (const card of candidates) {
    // いま入っているカード自身は候補にしない（差が常に0で邪魔になる）。
    if (card.id === current) continue;
    // 他の枠に入っているキャラは選べない（ゲームの編成規則）。呼び出し側で
    // 絞られていることを前提にせず、ここでも弾く。
    const ids = cardIds.map((id, i) => (i === slotIndex ? card.id : id));
    const ev = evalAt(ids);
    const pt = ptOf(ev);
    rows.push({
      cardId: card.id,
      power: ev.power.total,
      bonus: ev.bonus?.total ?? 0,
      deltaPower: ev.power.total - baseline.power,
      deltaBonus: (ev.bonus?.total ?? 0) - baseline.bonus,
      deltaPt: pt == null || baseline.pt == null ? null : pt - baseline.pt,
    });
  }

  /**
   * ★ 並べ替えは**最終Ptの差**が第一。出せないときだけ代用する。
   *   総合力だけで並べると、このツールが一番言いたいこと
   *  （ボーナスを落として総合力を取る判断）がそのまま消える。
   *
   * ★ **上限のあるイベントでは総合力での代用をしない。**
   *   楽曲データ（428KB）が届く前と読み込み失敗時はこの経路を通るが、
   *   上限帯では総合力を盛っても1点も増えないので、総合力順に並べると
   *   **1点にもならない候補を最上位に並べてしまう**（破壊者指摘 2026-08-18）。
   *   その窓ではボーナスの差で代用する。
   */
  const capped = (opts.cond?.powerLimit ?? 0) > 0;
  rows.sort((a, b) => {
    if (a.deltaPt != null && b.deltaPt != null) return b.deltaPt - a.deltaPt;
    if (capped) return b.deltaBonus - a.deltaBonus;
    return b.deltaPower - a.deltaPower;
  });
  return { baseline, rows };
}
