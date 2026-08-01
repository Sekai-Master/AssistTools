/**
 * 編成ビルダーのローカル保存。
 *
 * ── 2層に分けている理由（急所）────────────────────────────────
 * **カードの育成状態は「所持カード」に紐づけ、編成には持たせない。**
 * 同じカードが複数の編成に入るとき、現実の育成状態は1つしかない。編成側に持たせると
 * 「編成Aでマスターランクを直したのに編成Bが古いまま」が必ず起きて、しかも画面上は
 * それらしい数字が出るので気付けない。編成が持つのは cardId の参照だけにする。
 *
 * 壊れた JSON・型違い・プライベートモードは黙って初期値に倒す（planStorage.ts と同じ作法）。
 * 読み込みは外部由来なので**1件ずつ検証**する。
 */

/** 編成の枠数。 */
export const DECK_SIZE = 5;

/** カード1枚の育成状態。 */
export interface CardState {
  level: number;
  trained: boolean;
  /**
   * マスターランク（0〜5）。
   * ★ 画面では**既定を 0 にして「未設定」を持たない**（Nori 指示 2026-08-02）。
   *   計算モジュール側は未設定（undefined）を区別できるままにしてあるが、
   *   この画面からは常に値を渡す。0 は「まだ上げていない」の意味で実在する状態で、
   *   毎回5枚ぶん選ばせるほうが手間に見合わない、という判断。
   */
  masterRank?: number;
  /**
   * スキルレベル（1〜4）。
   * ★ カードが1意に決まっているので、これさえ入れれば内部値も実効値も計算できる。
   *   既定は 1（マスターランクと同じく「まだ上げていない」から始める）。
   */
  skillLevel?: number;
  /** 読了したサイドストーリー。入れ忘れると1編成で1万以上ずれる（docs/deck-builder.md）。 */
  episodes: { first: boolean; latter: boolean };
  canvas: boolean;
  /**
   * 絵だけ特訓前のものを出す。
   * ★ **計算には一切効かない、見た目だけの設定。** 特訓後の絵より前の絵が好き、
   *   というだけの理由で特訓フラグを外されると、上限レベルも後編も巻き添えで
   *   狂って数字が合わなくなる。だから絵の切り替えは別の設定として持つ。
   */
  artUntrained?: boolean;
}

export type CardStates = Record<number, CardState>;

export interface SavedDeck {
  name: string;
  /** 保存時刻(ms)。一覧の新しい順に使う。 */
  savedAt: number;
  /** 5枠。空き枠は null。 */
  cardIds: (number | null)[];
  /** リーダーの枠番号（0〜4）。イベントボーナスのリーダー上乗せに効く。 */
  leaderIndex: number;
  /** WL のサポート編成ぶん(%)。自動計算しないので手入力（docs の方針）。 */
  supportBonus: number;
  /** 最後に見ていたイベント。開き直したときに戻すためだけの補助情報。 */
  eventId?: number;
}

const CARDS_KEY = "sekaimaster:deck:cards:v1";
const DECKS_KEY = "sekaimaster:deck:decks:v1";

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function load(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過・ストレージ不可は無視（保存は best-effort）。
  }
}

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/* ---- カードの育成状態 ----------------------------------------------------- */

/**
 * 育成状態1件の検証。**範囲外は「その項目だけ捨てる」のではなく1件ごと落とす。**
 * レベルが壊れたカードを黙って Lv1 として計算すると、総合力が数万ずれたまま
 * それらしい数字が出てしまう（未設定は画面に出るが、誤った値は出ない）。
 */
export function isCardState(v: unknown): v is CardState {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<CardState>;
  if (!isFiniteNum(c.level) || c.level < 1 || c.level > 100) return false;
  if (typeof c.trained !== "boolean" || typeof c.canvas !== "boolean") return false;
  if (c.masterRank != null && (!isFiniteNum(c.masterRank) || c.masterRank < 0 || c.masterRank > 5)) {
    return false;
  }
  if (c.artUntrained != null && typeof c.artUntrained !== "boolean") return false;
  if (c.skillLevel != null && (!isFiniteNum(c.skillLevel) || c.skillLevel < 1 || c.skillLevel > 4)) {
    return false;
  }
  const e = c.episodes;
  if (!e || typeof e !== "object") return false;
  return typeof e.first === "boolean" && typeof e.latter === "boolean";
}

export function parseCardStates(raw: unknown): CardStates {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CardStates = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    // JSON のキーは文字列。数値でないキー（改竄・別バージョンの残骸）は捨てる。
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!isCardState(value)) continue;
    // 以前のバージョンは「未設定」を持っていた。読み込み時に既定へ寄せる。
    out[id] = {
      ...value,
      masterRank: value.masterRank ?? 0,
      skillLevel: value.skillLevel ?? 1,
      episodes: { ...value.episodes },
    };
  }
  return out;
}

export function readCardStates(): CardStates {
  return parseCardStates(load(CARDS_KEY));
}

export function writeCardStates(states: CardStates): void {
  save(CARDS_KEY, states);
}

/**
 * カードを初めて編成に入れたときの既定値。
 *
 * ★ レベルと前後編は**入っている側**に倒す。編成に入れるカードは育成済みが普通で、
 *   サイドストーリーの入れ忘れは1編成で1万以上ずれる（docs/deck-builder.md）。
 * ★ マスターランクは 0 から始める（未設定という状態を持たない）。
 *
 * @param maxLevel そのレアリティの上限（cards.json の power[0].length。★1=20 … ★4=60）
 * @param trainable 特訓の加算を持つか（★1・★2 は特訓しても加算が0）
 */
export function defaultCardState(maxLevel: number, trainable: boolean): CardState {
  return {
    level: maxLevel,
    trained: trainable,
    masterRank: 0,
    skillLevel: 1,
    episodes: { first: true, latter: true },
    canvas: false,
  };
}

/* ---- 名前付き編成 --------------------------------------------------------- */

/** 5枠に正規化する。長さ違い（別バージョンの残骸）でも落とさず形を揃える。 */
function normalizeCardIds(v: unknown): (number | null)[] | null {
  if (!Array.isArray(v)) return null;
  const ids = v.slice(0, DECK_SIZE).map((x) => (Number.isInteger(x) && (x as number) > 0 ? (x as number) : null));
  while (ids.length < DECK_SIZE) ids.push(null);
  return ids;
}

export function parseDecks(raw: unknown): SavedDeck[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedDeck[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const d = item as Partial<SavedDeck>;
    if (typeof d.name !== "string" || !d.name) continue;
    const cardIds = normalizeCardIds(d.cardIds);
    if (!cardIds) continue;
    const leader = isFiniteNum(d.leaderIndex) ? Math.trunc(d.leaderIndex) : 0;
    out.push({
      name: d.name,
      savedAt: isFiniteNum(d.savedAt) ? d.savedAt : 0,
      cardIds,
      leaderIndex: leader >= 0 && leader < DECK_SIZE ? leader : 0,
      supportBonus: isFiniteNum(d.supportBonus) && d.supportBonus >= 0 ? d.supportBonus : 0,
      ...(isFiniteNum(d.eventId) ? { eventId: d.eventId } : {}),
    });
  }
  return out;
}

/** 新しい順。 */
export function listDecks(): SavedDeck[] {
  return parseDecks(load(DECKS_KEY)).sort((a, b) => b.savedAt - a.savedAt);
}

/** 同名は上書き（upsert）。更新後の一覧を返す。planStorage.ts と同じ作法。 */
export function saveDeck(deck: SavedDeck): SavedDeck[] {
  const rest = parseDecks(load(DECKS_KEY)).filter((d) => d.name !== deck.name);
  save(DECKS_KEY, [...rest, deck]);
  return listDecks();
}

export function deleteDeck(name: string): SavedDeck[] {
  save(
    DECKS_KEY,
    parseDecks(load(DECKS_KEY)).filter((d) => d.name !== name)
  );
  return listDecks();
}

/** テスト・設定画面から参照する保存キー。 */
export const DECK_STORAGE_KEYS = { cards: CARDS_KEY, decks: DECKS_KEY } as const;
