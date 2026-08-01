/**
 * 編成のスキル値。
 *
 * ── なぜ出せるか ──────────────────────────────────────────────
 * カードが1意に定まっているので、スキルレベルさえ入れれば**内部値も実効値も計算できる**。
 * 他のツール（ランキング・アナライザー）は「150/710」を手で入れる前提だったが、
 * 編成ビルダーはカードを持っているので、そこを自動で埋められる。
 *
 * ── 何を「スキル値」と呼ぶか ──────────────────────────────────
 * **そのスキルレベルで出るスコアアップの上限%**。ゲーム内の表示も上限
 *（「最大◯%」）で書かれていて、編成を比べる用途ではそれが基準になる。
 * 条件付き（ライフ依存・GOOD を出すまで）は上限側を採る。実際の平均は叩き方で
 * 変わるので、ここでは決められない。
 *
 * ── 編成に依存するスキルがある ────────────────────────────────
 * 「自身を除き◯◯のメンバー1人ごとに+10%」「自身と異なるユニット1種類ごとに+30%」
 * のように、**同じカードでも編成によって値が変わる**ものがある。編成ビルダーは
 * 5枚を知っているので、そこまで含めて出す。
 */
import { multiEffectiveSkill } from "../../ranking/lib/efficiency";

export interface SkillEnhance {
  type: "sub_unit" | "unit_count" | "reference" | "character_rank";
  /** sub_unit: 対象ユニットの内部名。 */
  unit?: string;
  /** sub_unit: 1人あたりの%。 */
  per?: number;
  /** unit_count: 数える上限の種類数と、その上限に達したときの%。 */
  maxKinds?: number;
  max?: number;
  /**
   * reference: 参照する割合(%)と、上乗せの上限(%)。**どちらもスキルレベル別**。
   * ★ 上限は SL1=60 / SL2=65 / SL3=70 / SL4=70 と変わる（実データ）。
   *   1つの値で持つと SL3・SL4 で10低く出る。
   */
  rates?: number[];
  caps?: number[];
  /** character_rank: ランクの段ごとの%。 */
  steps?: { rank: number; value: number }[];
}

export interface SkillRow {
  id: number;
  /** スキルレベル1〜4のスコアアップ%。 */
  base: number[];
  enhance?: SkillEnhance;
  desc?: string;
}

/** スキルレベルの上限（マスタが4段しか持っていない）。 */
export const MAX_SKILL_LEVEL = 4;

export interface SkillDeckCard {
  cardId: number;
  ch: number;
  skillId?: number;
  /** power.ts の resolveUnit と同じ「そのカードが名乗るユニット枠」。 */
  unit: string;
  level: number;
}

export interface CardSkill {
  cardId: number;
  /** 素のスコアアップ%（スキルレベルぶんだけ）。 */
  base: number;
  /** 編成によって上乗せされたぶん。 */
  bonus: number;
  value: number;
  /** 上乗せの理由（画面に出す。黙って増えていると信用できない）。 */
  note?: string;
}

export interface DeckSkillResult {
  perCard: CardSkill[];
  /** 内部値＝5枚のスコアアップ合計。 */
  total: number;
  /** 先頭（リーダー）のスキル値。 */
  leader: number;
  /** 協力ライブの実効値。効率曲ランキングと同じ式を使う。 */
  effective: number;
  /** スキルが分からなかったカード。**黙って0にしない。** */
  missing: number[];
}

const clampLevel = (level: number, len: number) => Math.min(Math.max(Math.trunc(level) || 1, 1), len);

/** 素のスコアアップ%（編成の影響を入れない値）。参照系スキルの計算にも使う。 */
function baseOf(card: SkillDeckCard, skills: Map<number, SkillRow>): number | null {
  const s = card.skillId == null ? undefined : skills.get(card.skillId);
  if (!s || s.base.length === 0) return null;
  return s.base[clampLevel(card.level, s.base.length) - 1] ?? 0;
}

/**
 * 編成のスキル値を出す。
 *
 * @param leaderCardId 先頭のカード。協力ライブの実効値は先頭だけ重みが違う
 * @param characterRanks キャラクターランク（ランク依存のスキル用。無くても動く）
 */
export function deckSkill(
  deck: SkillDeckCard[],
  skills: SkillRow[],
  opts: { leaderCardId?: number; characterRanks?: Record<number, number> } = {}
): DeckSkillResult {
  const table = new Map(skills.map((s) => [s.id, s]));
  const missing: number[] = [];

  const bases = deck.map((c) => baseOf(c, table));

  const perCard: CardSkill[] = deck.map((card, i) => {
    const base = bases[i];
    if (base == null) {
      missing.push(card.cardId);
      return { cardId: card.cardId, base: 0, bonus: 0, value: 0 };
    }
    const skill = table.get(card.skillId!)!;
    const e = skill.enhance;
    let bonus = 0;
    let note: string | undefined;

    if (e?.type === "sub_unit" && e.unit && e.per) {
      // 自身を除く同ユニットの人数ぶん。5枚全員がそのユニットなら、さらにもう1回。
      const others = deck.filter((_, j) => j !== i).filter((c) => c.unit === e.unit).length;
      const all = deck.length === 5 && deck.every((c) => c.unit === e.unit);
      bonus = e.per * others + (all ? e.per : 0);
      note = `同ユニット${others}人${all ? "・全員一致" : ""}`;
    } else if (e?.type === "unit_count" && e.maxKinds && e.max) {
      // 自身と異なるユニットの種類数（上限あり）。
      const kinds = new Set(deck.filter((_, j) => j !== i).map((c) => c.unit));
      kinds.delete(card.unit);
      const n = Math.min(kinds.size, e.maxKinds);
      bonus = (e.max / e.maxKinds) * n;
      note = `異なるユニット${n}種類`;
    } else if (e?.type === "reference" && e.rates?.length) {
      // 他メンバーのスキル値を参照する。**ランダムなので上限側**（＝一番高い人）を採る。
      // ★ 割合も上限も**スキルレベル別**。固定値で持つと SL3・SL4 で10低く出る。
      const lv = clampLevel(card.level, e.rates.length) - 1;
      const rate = e.rates[lv] ?? 0;
      const cap = e.caps?.[lv] ?? Infinity;
      const othersMax = Math.max(0, ...bases.filter((v, j) => j !== i && v != null).map((v) => v!));
      bonus = Math.min((othersMax * rate) / 100, cap);
      note = "他メンバー参照（上限）";
    } else if (e?.type === "character_rank" && e.steps?.length) {
      const rank = opts.characterRanks?.[card.ch] ?? 0;
      const hit = e.steps.filter((s) => s.rank <= rank).map((s) => s.value);
      bonus = hit.length ? Math.max(...hit) : 0;
      note = `キャラクターランク${rank}`;
    }

    return { cardId: card.cardId, base, bonus, value: base + bonus, note };
  });

  const total = perCard.reduce((s, c) => s + c.value, 0);
  const leader = perCard.find((c) => c.cardId === opts.leaderCardId)?.value ?? perCard[0]?.value ?? 0;
  return { perCard, total, leader, effective: multiEffectiveSkill(leader, total), missing };
}
