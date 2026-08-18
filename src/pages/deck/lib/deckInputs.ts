/**
 * 画面の入力 → 計算モジュールの引数への詰め替え。
 *
 * ★ ここを純関数として切り出す理由: 詰め替えの取りこぼし（マスターランクを 0 で埋める、
 *   特訓フラグを渡し忘れる）は**画面上まったく異常に見えない**まま数字だけ狂う。
 *   docs/deck-builder.md の検証でも「未入力を0と混同した」ズレに3つも仮説を立てて
 *   しまった実績がある。UI から切り離してテストできる形にしておく。
 */
import type { DeckCard } from "./eventBonus";
import type { DeckPowerCard, PowerCardData } from "./power";
import type { CardState, CardStates } from "./deckStore";

/** cards.json のカード1枚。power.ts が使う分＋画面表示に要る分。 */
export interface CatalogCard extends PowerCardData {
  name: string;
  skillId?: number;
  asset?: string;
}

/** 特訓まで済ませたときの上限レベル。★1=20 / ★2=30 / ★3=50 / ★4・birthday=60。 */
export function maxLevelOf(card: PowerCardData): number {
  return card.power[0]?.length ?? 1;
}

/** 特訓前の上限は10下がる（★3=40 / ★4=50）。 */
export const UNTRAINED_LEVEL_GAP = 10;

/**
 * いまの育成状態で到達できる上限レベル。
 *
 * ★ 特訓できるカード（★3・★4）は、**特訓前は上限が10低い**。
 *   ここを見ずに「レアリティの上限」で入力させると、実機では作れない
 *   ★4 Lv60・特訓なしのような編成の数字が出てしまう。
 *   特訓の加算を持たないカード（★1・★2・birthday）は特訓の概念自体が無いので変わらない。
 */
export function levelCapOf(card: PowerCardData, trained: boolean): number {
  const max = maxLevelOf(card);
  return isTrainable(card) && !trained ? Math.max(1, max - UNTRAINED_LEVEL_GAP) : max;
}

/**
 * 特訓の加算を持つか。
 * ★1・★2 は特訓しても加算が 0 なので、既定で特訓済みにしても意味がない
 * （measurements.json のレオニ5枚でも1★・2★は trained:false で実機と一致している）。
 */
export function isTrainable(card: PowerCardData): boolean {
  return card.trained.some((v) => v > 0);
}

/** 枠に入っているカード（空き枠は落とす）。並び順は枠の順を保つ。 */
export function filledCards(slots: (CatalogCard | null)[]): CatalogCard[] {
  return slots.filter((c): c is CatalogCard => !!c);
}

/**
 * イベントボーナス用の詰め替え。
 * ★ マスターランクは画面では常に値を持つ（既定 0・未設定という状態を置かない）。
 *   台帳にまだ無いカードも 0 として渡す。
 */
export function toBonusDeck(cards: CatalogCard[], states: CardStates): DeckCard[] {
  return cards.map((card) => ({
    cardId: card.id,
    characterId: card.ch,
    rarity: card.rarity,
    attr: card.attr,
    ...(card.supportUnit ? { supportUnit: card.supportUnit } : {}),
    masterRank: states[card.id]?.masterRank ?? 0,
  }));
}

/**
 * 総合力用の詰め替え。
 *
 * ★ 育成状態が未登録のカードは「上限レベル・前後編読了・特訓済み」で仮に置く
 *   （defaultCardState と同じ既定）。ここで level を 1 に倒すと総合力が数万ずれるが
 *   画面はそれらしく見えてしまう。
 */
export function toPowerDeck(cards: CatalogCard[], states: CardStates): DeckPowerCard[] {
  return cards.map((card) => {
    const s: CardState | undefined = states[card.id];
    return {
      cardId: card.id,
      level: s?.level ?? maxLevelOf(card),
      masterRank: s?.masterRank ?? 0,
      trained: s?.trained ?? isTrainable(card),
      episodes: s?.episodes ?? { first: true, latter: true },
      canvas: s?.canvas ?? false,
    };
  });
}

/**
 * 特訓の切り替えに伴って、他の項目も現実に合わせる。
 *
 * ★ 特訓を外すと**上限レベルが10下がる**ので、それを超えていたレベルは連れて下げる。
 *   放っておくと「特訓なしで Lv60」という実機では存在しない状態のまま計算され、
 *   総合力だけが数千多く出る（画面は何も警告しない）。
 * ★ **後編は特訓後にしか読めない**ので、特訓を外したら未読に戻す。
 *   サイドストーリーは1編成で1万以上動くので、ここのズレは大きい。
 * ★ 絵だけ特訓前に戻す設定（artUntrained）は見た目の話なので、ここでは触らない。
 */
export function applyTrained(state: CardState, card: PowerCardData, trained: boolean): CardState {
  const cap = levelCapOf(card, trained);
  return {
    ...state,
    trained,
    level: Math.min(state.level, cap),
    episodes: trained ? state.episodes : { ...state.episodes, latter: false },
  };
}

export interface EventRow {
  id: number;
  name: string;
  type: string;
  unit: string;
  startAt: number;
  aggregateAt: number;
  /** ロゴを引くためのアセット名（画像は public/CardDatas/logo に自前配信）。 */
  asset?: string;
  /**
   * 「発揮可能総合力」の上限。**この欄があるイベントでは、編成の総合力がこの値を超えても
   * 超えたぶんはスコアに乗らない**（ワールドリンク第3弾で入った仕様。実測は全件 336,000）。
   *
   * ★ **ワールドリンクなら必ず付く、ではない。** 旧ワールドリンクには上限が無いので、
   *   `type === "world_bloom"` で代用してはいけない。欄の有無だけで判断すること。
   */
  powerLimit?: number;
}

/**
 * 既定で選ぶイベント。
 *
 * ★ 「開催中（開始済みで集計前）」があればそれ、無ければ**開始済みのうち最新**。
 *   未来のイベントを既定にしない。配信データには公開済みのイベントしか入っていないが
 *   （ビルド時に落としている）、既定の選択で未開催のものを指してしまうと
 *   「まだ始まっていないイベントの編成が組めてしまう」ように見える。
 */
export function defaultEventId(events: EventRow[], now: number): number | undefined {
  const started = events.filter((e) => e.startAt <= now);
  const live = started.filter((e) => e.aggregateAt >= now);
  const pick = (live.length ? live : started).reduce<EventRow | undefined>(
    (best, e) => (!best || e.startAt > best.startAt ? e : best),
    undefined
  );
  return pick?.id;
}

/**
 * 数値入力から数字と小数点1つだけを残す。
 * ★ "1.2.3" のような入力をそのまま通すと `Number()` が NaN になり、**黙って 0 として**
 *   計算される。打ち間違いが数字に出ないのが一番たちが悪いので、入口で潰す。
 */
export function sanitizeDecimal(v: string): string {
  const s = v.replace(/[^0-9.]/g, "");
  const i = s.indexOf(".");
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
}

/**
 * イベントボーナスの表示値。
 * ★ ゲーム内は**合計だけ切り捨て**て出す（内部 156.5% → 表示 156%）。
 *   カードごとの値は小数のまま表示と一致する（docs/deck-builder.md 実測）。
 */
export function displayBonus(total: number): number {
  return Math.floor(total);
}
