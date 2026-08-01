/**
 * 自分で決めるイベントボーナス（「カスタム」）。
 *
 * ── なぜ要るか ────────────────────────────────────────────────
 * 実在のイベントを選ぶだけだと「次のイベントがこのメンバー・このタイプだったら
 * どの編成が強いか」を試せない。**発表前に手持ちで組めるかを見たい**のが編成ビルダーの
 * 使いどころなので、対象メンバーとタイプを手で置けるようにする（Nori 指示 2026-08-02）。
 *
 * ★ **未公開のイベント内容をここから出すわけではない。** 入れるのは利用者が自分で
 *   考えた条件で、配信データは一切見ない。名前も出さない（不可侵の制約と無関係）。
 *
 * ── 何を作るか ────────────────────────────────────────────────
 * eventBonus() が読む deckBonuses 行を、そのまま組み立てて渡す。
 * 計算式には手を入れない（「最も具体的に一致する1行だけを採る」も含めてそのまま効く）。
 */
import type { BonusTables, DeckBonusRow, UnitCharacter } from "./eventBonus";

/** 実在のイベント id と衝突しない値。 */
export const CUSTOM_EVENT_ID = -1;

export interface CustomEvent {
  /** 対象メンバー（キャラ id）。 */
  chars: number[];
  /** 対象タイプ。無指定なら属性ボーナスなし（実測 207・211 のように属性行が無いイベントもある）。 */
  attr?: string;
  /** キャラだけ一致・タイプだけ一致・両方一致の % 。 */
  rates: { char: number; attr: number; both: number };
}

/**
 * ★ 既定値。近年のイベントの標準的な配分（キャラ25 / タイプ25 / 両方50）。
 *   両方一致が「合算済み」なのは実測で確かめてある（docs/deck-builder.md）。
 */
export const DEFAULT_CUSTOM_RATES = { char: 25, attr: 25, both: 50 } as const;

export const emptyCustomEvent = (): CustomEvent => ({
  chars: [],
  attr: undefined,
  rates: { ...DEFAULT_CUSTOM_RATES },
});

/**
 * カスタムの条件から deckBonuses 行を組み立てる。
 *
 * ★ VS のキャラは複数ユニットに跨るので、1キャラにつき unitCharacterId が複数ある。
 *   どの枠で編成されても効くように**全部の枠ぶん行を作る**（eventBonus 側は
 *   一致した中で最も具体的な1行だけを採るので、重複しても二重には乗らない）。
 */
export function customDeckBonuses(custom: CustomEvent, unitCharacters: UnitCharacter[]): DeckBonusRow[] {
  const rows: DeckBonusRow[] = [];
  const chars = new Set(custom.chars);

  for (const uc of unitCharacters) {
    if (!chars.has(uc.ch)) continue;
    if (custom.rates.char > 0) {
      rows.push({ eventId: CUSTOM_EVENT_ID, unitCharacterId: uc.id, rate: custom.rates.char });
    }
    if (custom.attr && custom.rates.both > 0) {
      rows.push({
        eventId: CUSTOM_EVENT_ID,
        unitCharacterId: uc.id,
        attr: custom.attr,
        rate: custom.rates.both,
      });
    }
  }

  if (custom.attr && custom.rates.attr > 0) {
    rows.push({ eventId: CUSTOM_EVENT_ID, attr: custom.attr, rate: custom.rates.attr });
  }
  return rows;
}

/**
 * カスタム用のテーブル。
 * ★ カード個別（ピックアップ）と対象人数の上限は**持たない**。どのカードがPUかは
 *   利用者には決めようがないし、勝手に置くと「持っていないPU込みの数字」になる。
 */
export function customBonusTables(custom: CustomEvent, base: BonusTables): BonusTables {
  return {
    ...base,
    deckBonuses: customDeckBonuses(custom, base.unitCharacters),
    cardBonuses: [],
    bonusLimits: [],
  };
}

/** 保存・読み込み用の検証（外部由来）。 */
export function parseCustomEvent(v: unknown): CustomEvent | undefined {
  if (!v || typeof v !== "object") return undefined;
  const c = v as Partial<CustomEvent>;
  const num = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1000 ? x : fallback;
  return {
    chars: Array.isArray(c.chars)
      ? [...new Set(c.chars.filter((n): n is number => Number.isInteger(n) && n > 0 && n <= 100))]
      : [],
    attr: typeof c.attr === "string" && c.attr ? c.attr : undefined,
    rates: {
      char: num(c.rates?.char, DEFAULT_CUSTOM_RATES.char),
      attr: num(c.rates?.attr, DEFAULT_CUSTOM_RATES.attr),
      both: num(c.rates?.both, DEFAULT_CUSTOM_RATES.both),
    },
  };
}
