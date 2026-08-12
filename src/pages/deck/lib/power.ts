/**
 * 総合力の計算。
 *
 * ★ イベントボーナス（eventBonus.ts）と違い、**プレイヤー固有の入力が要る**。
 *   エリアアイテム・キャラクターランク・ゲート・家具・称号は手元の育成状況なので、
 *   カードだけでは決まらない。だから「他人の編成の総合力」は正確には出せない。
 *
 * ══ 丸めの規則（実測でそう出ている。単位を間違えると数十〜数百ずれる）══════
 *   エリアアイテム … カードごと・**パラメータごと**に floor
 *   キャラランク   … カードごと・**パラメータごと**に floor
 *   ゲート         … カードごと・**3パラの合計**に対して floor
 *   家具           … カードごと・**3パラの合計**に対して floor
 *   称号           … 編成に1回だけ足す固定値
 * ═══════════════════════════════════════════════════════════════════
 */

/** ゲーム内の割合は float32 で計算されている。→ ratePower のコメント参照。 */
const f = Math.fround;

/**
 * 「基礎値の n%」を**ゲーム本体と同じ float32 で**求める。
 *
 * ★★ ここが「キャラクターランク 5% だと実測より1多い」の正体。★★
 *   float32 では 0.01 が 0.009999999776… になるため 5% は 0.049999998882… になり、
 *   ちょうど割り切れる値で floor が1つ下がる（例: 11540 → 577 ではなく 576）。
 *   `percent * 0.01 * base` と書くと実機と1ずれる。**この関数を通すこと。**
 *
 * 参考にした先駆者の実装も同じ形をしている（lwh-440/pjsktools の froundRatePower）。
 */
export function ratePower(percent: number, base: number): number {
  return f(f(f(percent) * f(0.01)) * base);
}

/** カタログのカード（deriveCardData.slimCard の出力）。 */
export interface PowerCardData {
  id: number;
  ch: number;
  rarity: string;
  attr: string;
  /** ユニット限定カード。VS のキャラが他ユニット枠で出る場合など。 */
  supportUnit?: string;
  /** 特訓による固定加算（param1/2/3）。 */
  trained: number[];
  /** power[パラメータ][レベル-1]。index 0 が Lv1。 */
  power: number[][];
}

export interface PowerTables {
  cards: PowerCardData[];
  /** マスターランクの固定加算。**累積**（MR3 は MR1+2+3 を足す）。 */
  masterBonuses: { rarity: string; masterRank: number; power: number[] }[];
  /** サイドストーリーの固定加算（前編 first_part / 後編 second_part）。 */
  episodes: { cardId: number; part: string; power: number[] }[];
  /** マイセカイキャンバスの固定加算（レアリティで額が違う）。 */
  canvasBonuses: { rarity: string; power: number[] }[];
  characterRanks: { ch: number; rank: number; rate: number[] }[];
  /** マイセカイのゲート。rates[0] が Lv1。**5基のみで VS のゲートは無い。** */
  gates: { id: number; unit: string; rates: number[] }[];
  unitCharacters: { id: number; ch: number; unit: string }[];
}

/** 編成に入れたカードと、その育成状況。 */
export interface DeckPowerCard {
  cardId: number;
  level: number;
  /** ★ 未入力は undefined で渡すこと（0 と混同しない）。eventBonus.ts と同じ扱い。 */
  masterRank?: number;
  trained?: boolean;
  /** 読了したサイドストーリー。前編・後編で別。**入れ忘れると1編成で1万以上ずれる。** */
  episodes?: { first?: boolean; latter?: boolean };
  canvas?: boolean;
}

/**
 * エリアアイテムの効果1行。
 *
 * ★ 入力の粒度をこのモジュールでは決めない。ゲーム内の「効果一覧」から読める
 *   対象ごとの合計%を1行として渡してもよいし、アイテムごとに1行渡してもよい。
 *   （マスタ上は対象37種に対してアイテムが55個ある＝1対象に複数アイテム）
 */
export interface AreaRate {
  /** 対象ユニット。全ユニット対象なら undefined か "any"。 */
  unit?: string;
  /** 対象属性。同上。 */
  attr?: string;
  /** 対象キャラ。 */
  ch?: number;
  /** パラメータ3本ぶんの%。 */
  rate: number[];
  /** 5枚全員が一致したときの%。省略時は rate と同じ。 */
  allMatch?: number[];
}

/**
 * マイセカイの家具のうち、パフォーマンスボーナスを持つもののサイズ別の率(%)。
 *
 * ★ ボーナスを持つのは「◯◯のぬいぐるみ」と「◯◯のダイヤモンドオブジェ」だけ
 *   （1499個中525個）。置いたキャラにだけ乗る。普通の家具では上がらない。
 *
 * ★★ マスタの `bonusRate` は 1 / 3 / 6 だが、**単位は % ではなく 0.1%**。★★
 *   実測: 咲希のぬいぐるみ/S（bonusRate=1）を1個置いたら、
 *   カード合計 19994 に対して +19 だった。1% なら 199 になる。
 *   ここを % として扱うと家具ボーナスが10倍に膨らむ。
 */
export const FIXTURE_RATE_BY_SIZE = { S: 0.1, M: 0.3, L: 0.6 } as const;

/**
 * ゲーム内の「エリアアイテム効果一覧」に出ている値をそのまま写したもの。
 *
 * ★ スクショ解析はしない（アイコンに文字が無く、色と並び順に頼る読み取りになる）。
 *   画面の数字を手で入れてもらう。
 */
export interface AreaEffects {
  /** ユニット内部名（piapro / light_sound / idol / street / theme_park / school_refusal）→ %。 */
  units?: Record<string, number>;
  /** 属性（cool / cute / pure / happy / mysterious）→ %。 */
  attrs?: Record<string, number>;
  /** キャラ（1〜26）→ %。 */
  chars?: Record<number, number>;
}

/**
 * 効果一覧の値を計算用の行に直す。
 *
 * ★ 「同ユニット/同タイプのみで編成するとさらに◯%」は画面に出ていないが、
 *   マスタ上は**ユニット・タイプのアイテムは必ず通常の2倍**（キャラのアイテムは
 *   全一致でも増えない）。配信データの全行でそうなっていることを
 *   power.real.test.ts が確認しているので、ここで 2 倍にしてしまってよい。
 */
export function areaRatesFromEffects(e: AreaEffects): AreaRate[] {
  const rate3 = (v: number) => [v, v, v];
  return [
    ...Object.entries(e.units ?? {}).map(([unit, v]) => ({
      unit,
      rate: rate3(v),
      allMatch: rate3(v * 2),
    })),
    ...Object.entries(e.attrs ?? {}).map(([attr, v]) => ({
      attr,
      rate: rate3(v),
      allMatch: rate3(v * 2),
    })),
    ...Object.entries(e.chars ?? {}).map(([ch, v]) => ({ ch: Number(ch), rate: rate3(v) })),
  ];
}

/** プレイヤー固有の入力。**すべて省略可**（省略した項目は 0 として扱う）。 */
export interface PlayerState {
  areaRates?: AreaRate[];
  /** キャラ → キャラクターランク。CR50 で上限5%、それ以上は伸びない。 */
  characterRanks?: Record<number, number>;
  /** ユニット → ゲートのレベル（1〜40）。 */
  gateLevels?: Record<string, number>;
  /**
   * キャラ → 家具ボーナス(%)。**単位は % なので、S のぬいぐるみ1個なら 0.1。**
   * サイズと率の対応は FIXTURE_RATE_BY_SIZE。
   */
  fixtureRates?: Record<number, number>;
  /**
   * 称号ボーナス（プレイヤー固有の固定値）。
   * ★ マスタDB に power 系の欄が無く導出できないので手入力。
   */
  honorBonus?: number;
}

export interface CardPower {
  cardId: number;
  /** ゲート・エリアの判定に使ったユニット枠。 */
  unit: string;
  /** パラメータ3本の内訳。 */
  performance: number[];
  performanceTotal: number;
  areaItem: number;
  characterRank: number;
  gate: number;
  fixture: number;
  /** 称号を除いたこのカードぶんの総合力。 */
  total: number;
}

export interface DeckPowerResult {
  total: number;
  performance: number;
  areaItem: number;
  characterRank: number;
  gate: number;
  fixture: number;
  honor: number;
  perCard: CardPower[];
  /** 5枚全員が同じユニット枠か。★ 5枚揃って初めて成立する。 */
  sameUnit: boolean;
  /** 5枚全員が同じ属性か。同上。 */
  sameAttr: boolean;
  /** マスターランク未入力のカード。空でなければ合計は暫定値。 */
  unsetMasterRank: number[];
  /**
   * 計算できなかったもの。**黙って0にしない。**
   * カタログに無いカード、範囲外のレベル、表に無いキャラランクなど。
   */
  missing: string[];
}

/**
 * カードが名乗るユニット枠。**エリアアイテムもゲートもこの1枠だけを見る。**
 *
 * ユニット限定カードは supportUnit に固定。VS のキャラは複数ユニットに跨るので
 * piapro（＝ユニットのゲートを持たない側）として扱う。
 *
 * ★ 「VS のキャラなんだから VIRTUAL SINGER のエリア効果も重なるのでは」は**否**。
 *   レン「放課後のひととき」(id 471・supportUnit=light_sound) の実測エリア 13664 は
 *   レオニ15% + キュート8.5% + レン16% ＝ 39.5% でぴったり一致し、
 *   VS の 11% を足すと 17469 になって合わない。ゲートも同じで、レオニだけが効いていた。
 */
function resolveUnit(card: PowerCardData, table: PowerTables["unitCharacters"]): string {
  if (card.supportUnit) return card.supportUnit;
  const units = table.filter((u) => u.ch === card.ch).map((u) => u.unit);
  return units.length === 1 ? units[0] : "piapro";
}

/**
 * **エリアアイテムだけ**が見るユニット枠。ゲートとは別物。
 *
 * ★ ユニット限定カード（＝VS のキャラが他ユニットの衣装を着たカード。247枚あり、
 *   VS 以外のキャラには存在しない）は、**そのユニットと piapro の両方に属する**。
 *   マスタの unitCharacters でも VS のキャラは6ユニット全部に行がある。
 *   実測すると、**ユニット効果が高いほうだけが乗る**（足し算ではない）。
 *
 *   確定に使った実機4編成（2026-08-12）:
 *   - ミク・リン（supportUnit=モモジャン 9%）+ ピアプロ 11% → **11% が乗る**。
 *     これを 9% で計算していたためエリアが 1,335 不足していた
 *   - 622/900/471（supportUnit=レオニ 15%）+ ピアプロ 11% → **15% が乗る**。
 *     「常に piapro」にするとこちらの編成が 3万近くずれて壊れる
 *
 *   片側だけなら「常に supportUnit」でも「常に piapro」でも説明できるが、
 *   両側の実測があるので**高いほう**以外に説明がつかない。
 *
 * ★ ゲートはこの規則に従わない。同じ編成でゲートは supportUnit 側（モモジャン）の
 *   値が実機と一致していた。エリアとゲートで枠の決め方が違う。
 */
function areaUnitOf(
  card: PowerCardData,
  table: PowerTables["unitCharacters"],
  rates: AreaRate[]
): string {
  const nominal = resolveUnit(card, table);
  if (!card.supportUnit) return nominal;
  // ユニット行の効き目。入力は3パラ同値だが、念のため合計で比べる。
  const strength = (unit: string) =>
    rates
      .filter((r) => r.unit === unit)
      .reduce((s, r) => s + (r.rate?.reduce((a, b) => a + b, 0) ?? 0), 0);
  return strength("piapro") > strength(nominal) ? "piapro" : nominal;
}

/**
 * ゲートの率(%)。
 *
 * ★ VS（piapro）のゲートは存在しない。実測では**全ゲートのうち一番高いもの**が効く
 *  （レン単体 34596 のとき、レオニだけ Lv2 で 69 ＝ 34596×0.2% だった）。
 *   ユニット限定カードはそのユニットのゲートだけを見る（モモジャンのリンが
 *   レオニ Lv2 に引っ張られず 0.1% ぶんだった）。
 */
function gateRateOf(
  unit: string,
  levels: Record<string, number> | undefined,
  gates: PowerTables["gates"]
): number {
  if (!levels) return 0;
  const rateOf = (g: PowerTables["gates"][number]) => {
    const lv = levels[g.unit];
    return typeof lv === "number" && lv >= 1 ? (g.rates[lv - 1] ?? 0) : 0;
  };
  const own = gates.find((g) => g.unit === unit);
  if (own) return rateOf(own);
  return gates.reduce((max, g) => Math.max(max, rateOf(g)), 0);
}

/** レベル・特訓・サイドストーリー・マスターランク・キャンバスを足したパフォーマンス。 */
function performanceOf(
  card: PowerCardData,
  owned: DeckPowerCard,
  tables: PowerTables,
  missing: string[]
): number[] {
  const perf = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const byLevel = card.power[i] ?? [];
    const base = byLevel[owned.level - 1];
    if (base == null) {
      if (i === 0) missing.push(`カード${card.id}: Lv${owned.level} の基礎値が無い`);
      continue;
    }
    perf[i] = base;
    if (owned.trained) perf[i] += card.trained[i] ?? 0;
  }

  // ★ サイドストーリーは読了したぶんだけ。4★ は前編250+後編600（1パラメータあたり）。
  for (const e of tables.episodes) {
    if (e.cardId !== card.id) continue;
    const read = e.part === "first_part" ? owned.episodes?.first : owned.episodes?.latter;
    if (!read) continue;
    for (let i = 0; i < 3; i++) perf[i] += e.power[i] ?? 0;
  }

  // ★ マスターランクは累積。MR3 なら MR1・2・3 の行をすべて足す。
  const mr = owned.masterRank ?? 0;
  for (const m of tables.masterBonuses) {
    if (m.rarity !== card.rarity || m.masterRank > mr) continue;
    for (let i = 0; i < 3; i++) perf[i] += m.power[i] ?? 0;
  }

  if (owned.canvas) {
    const c = tables.canvasBonuses.find((x) => x.rarity === card.rarity);
    if (!c) missing.push(`カード${card.id}: レアリティ${card.rarity} のキャンバス加算が無い`);
    else for (let i = 0; i < 3; i++) perf[i] += c.power[i] ?? 0;
  }

  return perf;
}

/** 対象がこのカードに当たるか。"any" と undefined は「全対象」。 */
function hits(row: AreaRate, card: PowerCardData, unit: string): boolean {
  if (row.unit && row.unit !== "any" && row.unit !== unit) return false;
  if (row.attr && row.attr !== "any" && row.attr !== card.attr) return false;
  if (row.ch != null && row.ch !== card.ch) return false;
  return true;
}

/**
 * 編成の総合力を出す。
 *
 * @param deck 編成に入れたカード（1〜5枚。全一致の判定は5枚のときだけ成立する）
 */
export function deckPower(
  deck: DeckPowerCard[],
  player: PlayerState,
  tables: PowerTables
): DeckPowerResult {
  const missing: string[] = [];
  const resolved = deck.map((owned) => {
    const card = tables.cards.find((c) => c.id === owned.cardId);
    if (!card) missing.push(`カード${owned.cardId}: カタログに無い`);
    return { owned, card };
  });
  const usable = resolved.filter((r): r is { owned: DeckPowerCard; card: PowerCardData } => !!r.card);

  // ★ 全一致は5枚揃って初めて付く（実測で確認済み）。1枚・2枚では付かない。
  const units = usable.map((r) => resolveUnit(r.card, tables.unitCharacters));
  const full = deck.length === 5 && usable.length === 5;
  const sameUnit = full && units.every((u) => u === units[0]);
  const sameAttr = full && usable.every((r) => r.card.attr === usable[0].card.attr);

  const perCard: CardPower[] = usable.map(({ owned, card }, idx) => {
    const unit = units[idx];
    const perf = performanceOf(card, owned, tables, missing);
    const perfTotal = perf[0] + perf[1] + perf[2];

    // エリアアイテム: パラメータごとに積んでから floor。
    // ★ 枠は areaUnitOf（ゲートで使う unit とは別）。理由は関数のコメント。
    const areaUnit = areaUnitOf(card, tables.unitCharacters, player.areaRates ?? []);
    const acc = [0, 0, 0];
    for (const row of player.areaRates ?? []) {
      if (!hits(row, card, areaUnit)) continue;
      const all =
        (!!row.unit && row.unit !== "any" && sameUnit) ||
        (!!row.attr && row.attr !== "any" && sameAttr);
      const rates = (all ? row.allMatch : undefined) ?? row.rate;
      for (let i = 0; i < 3; i++) acc[i] = f(acc[i] + ratePower(rates[i] ?? 0, perf[i]));
    }
    const areaItem = acc.reduce((s, v) => s + Math.floor(v), 0);

    // キャラクターランク: 同じくパラメータごとに floor。
    const rank = player.characterRanks?.[card.ch];
    let characterRank = 0;
    if (typeof rank === "number") {
      const row = tables.characterRanks.find((r) => r.ch === card.ch && r.rank === rank);
      if (!row) missing.push(`キャラ${card.ch}: ランク${rank} の倍率が無い`);
      else characterRank = perf.reduce((s, v, i) => s + Math.floor(ratePower(row.rate[i] ?? 0, v)), 0);
    }

    // ゲート・家具: 3パラの合計に対して、カードごとに floor。
    const gate = Math.floor(ratePower(gateRateOf(unit, player.gateLevels, tables.gates), perfTotal));
    // マスタ上の理論最大は1キャラ 60〜70（＝6.0〜7.0%）なので、この上限は普通は効かない。
    const fixtureRate = Math.min(player.fixtureRates?.[card.ch] ?? 0, 100);
    const fixture = Math.floor(ratePower(fixtureRate, perfTotal));

    return {
      cardId: card.id,
      unit,
      performance: perf,
      performanceTotal: perfTotal,
      areaItem,
      characterRank,
      gate,
      fixture,
      total: perfTotal + areaItem + characterRank + gate + fixture,
    };
  });

  const sum = (pick: (c: CardPower) => number) => perCard.reduce((s, c) => s + pick(c), 0);
  const honor = player.honorBonus ?? 0;
  return {
    total: sum((c) => c.total) + honor,
    performance: sum((c) => c.performanceTotal),
    areaItem: sum((c) => c.areaItem),
    characterRank: sum((c) => c.characterRank),
    gate: sum((c) => c.gate),
    fixture: sum((c) => c.fixture),
    honor,
    perCard,
    sameUnit,
    sameAttr,
    unsetMasterRank: deck.filter((c) => c.masterRank == null).map((c) => c.cardId),
    missing,
  };
}
