/**
 * イベントボーナスの計算。
 *
 * ★ この値は**カードだけで完全に決まる**（エリアアイテムもキャラクターランクも
 *   効かない）。総合力と違ってプレイヤー固有の入力が要らないので、ここは
 *   「組んでいない編成でも正確に出せる」。編成ビルダーの価値の中心。
 */

/** キャラ×ユニット → id の対応表。カードとボーナス行を突き合わせるのに要る。 */
export interface UnitCharacter {
  id: number;
  ch: number;
  unit: string;
}

/**
 * イベント×（キャラ・ユニット）×属性 のボーナス行。
 * 「キャラだけ」「属性だけ」「両方」の3種が混在する。
 */
export interface DeckBonusRow {
  eventId: number;
  unitCharacterId?: number;
  attr?: string;
  rate: number;
}

export interface CardBonusRow {
  eventId: number;
  cardId: number;
  rate: number;
  leaderRate: number;
}

export interface RarityBonusRow {
  rarity: string;
  masterRank: number;
  rate: number;
}

export interface BonusTables {
  deckBonuses: DeckBonusRow[];
  cardBonuses: CardBonusRow[];
  rarityBonuses: RarityBonusRow[];
  bonusLimits: { eventId: number; memberCountLimit: number }[];
  unitCharacters: UnitCharacter[];
}

export interface DeckCard {
  cardId: number;
  characterId: number;
  rarity: string;
  attr: string;
  /** ユニット限定カード（VS のキャラが他ユニット枠で出る場合など）。 */
  supportUnit?: string;
  /**
   * マスターランク。**未入力は undefined で渡すこと（0 と混同しない）。**
   *
   * ★ 検証中に実際にやらかした: マスターランクの記載が無い編成を 0 として計算し、
   *   5% ズレた原因を「データと実機の食い違い」だと疑って3つの仮説を立てた。
   *   実際はただの入力漏れだった。0 と未入力は別物として扱い、未入力があることを
   *   呼び出し側へ返す（画面で「未設定」と分かるようにするため）。
   */
  masterRank?: number;
}

export interface CardBonus {
  cardId: number;
  /** キャラ・属性の一致による分。 */
  deck: number;
  /** レアリティ×マスターランクの分。 */
  master: number;
  /** カード個別（ピックアップ等）の分。リーダー時の上乗せを含む。 */
  card: number;
  total: number;
}

export interface EventBonusResult {
  /** 合計(%)。サポート編成ぶんを渡していればそれも含む。 */
  total: number;
  /** 内訳。どこから来た数字かを画面で見せるため。 */
  perCard: CardBonus[];
  /** 対象人数の上限で切り捨てられた枚数（0 なら全員が効いている）。 */
  cappedOut: number;
  /** WL のサポート編成など、手入力で足したぶん。 */
  support: number;
  /**
   * マスターランクが未入力のカード。空でなければ合計は**暫定値**。
   * 0 として計算してしまうと、足りない数字に気付けない。
   */
  unsetMasterRank: number[];
}

/**
 * カードが名乗れる（キャラ, ユニット）の id。
 *
 * VS のキャラは複数ユニットに跨るので候補が複数になる。ユニット限定カードは
 * supportUnit でそのユニットに固定される。
 */
function unitCharacterIds(card: DeckCard, table: UnitCharacter[]): number[] {
  return table
    .filter((u) => u.ch === card.characterId && (!card.supportUnit || u.unit === card.supportUnit))
    .map((u) => u.id);
}

/**
 * キャラ・属性の一致による分。
 *
 * ★★ 一致する行を足してはいけない。★★
 *   「両方」の行は**合算済みの値**（実測: キャラ25 + 属性25 に対して両方=50）。
 *   全部足すと 25+25+50=100 になり、倍以上に膨らむ。
 *   **最も具体的に一致する1行だけ**を採る。
 *
 * 属性の行を持たないイベントもある（実測: 207, 211）ので、無くても壊れないこと。
 */
function deckBonusOf(card: DeckCard, rows: DeckBonusRow[], table: UnitCharacter[]): number {
  const ids = new Set(unitCharacterIds(card, table));
  let both = 0;
  let byChar = 0;
  let byAttr = 0;
  for (const r of rows) {
    const charHit = r.unitCharacterId != null && ids.has(r.unitCharacterId);
    const attrHit = r.attr != null && r.attr === card.attr;
    if (r.unitCharacterId != null && r.attr != null) {
      if (charHit && attrHit) both = Math.max(both, r.rate);
    } else if (r.unitCharacterId != null) {
      if (charHit) byChar = Math.max(byChar, r.rate);
    } else if (r.attr != null) {
      if (attrHit) byAttr = Math.max(byAttr, r.rate);
    }
  }
  // 具体的な順に採る。両方 > キャラ > 属性。
  if (both > 0) return both;
  if (byChar > 0) return byChar;
  return byAttr;
}

/**
 * 編成のイベントボーナスを出す。
 *
 * @param leaderCardId リーダーのカード。個別ボーナスにリーダー専用の上乗せがある
 * @param supportBonus WL のサポート編成ぶん。編成を組ませるのは現実的でないので手入力
 */
export function eventBonus(
  deck: DeckCard[],
  eventId: number,
  tables: BonusTables,
  opts: { leaderCardId?: number; supportBonus?: number } = {}
): EventBonusResult {
  const rows = tables.deckBonuses.filter((r) => r.eventId === eventId);
  const cardRows = tables.cardBonuses.filter((r) => r.eventId === eventId);
  const limit = tables.bonusLimits.find((l) => l.eventId === eventId)?.memberCountLimit;

  const perCard: CardBonus[] = deck.map((card) => {
    const deckRate = deckBonusOf(card, rows, tables.unitCharacters);
    // 未入力は 0 として足すが、黙って足したことを結果に残す。
    const master =
      card.masterRank == null
        ? 0
        : (tables.rarityBonuses.find(
            (r) => r.rarity === card.rarity && r.masterRank === card.masterRank
          )?.rate ?? 0);
    const cr = cardRows.find((r) => r.cardId === card.cardId);
    const cardRate =
      (cr?.rate ?? 0) + (cr && opts.leaderCardId === card.cardId ? cr.leaderRate : 0);
    return {
      cardId: card.cardId,
      deck: deckRate,
      master,
      card: cardRate,
      total: deckRate + master + cardRate,
    };
  });

  // ★ 対象人数に上限があるイベントがある。上限を超えたぶんは効かない。
  //   どれを残すかはプレイヤーに有利な側（大きい方）を採る。
  let counted = perCard;
  let cappedOut = 0;
  if (typeof limit === "number" && limit >= 0) {
    const contributing = perCard.filter((c) => c.total > 0);
    if (contributing.length > limit) {
      const keep = new Set(
        [...contributing].sort((a, b) => b.total - a.total).slice(0, limit).map((c) => c.cardId)
      );
      cappedOut = contributing.length - limit;
      counted = perCard.filter((c) => c.total === 0 || keep.has(c.cardId));
    }
  }

  const support = opts.supportBonus ?? 0;
  return {
    total: counted.reduce((s, c) => s + c.total, 0) + support,
    perCard,
    cappedOut,
    support,
    unsetMasterRank: deck.filter((c) => c.masterRank == null).map((c) => c.cardId),
  };
}
