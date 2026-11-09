/**
 * まとめて遊ぶ（5 枚まで）の状態をこの端末に残す。1 枚で遊ぶの途中経過（bingoStorage.ts）とは別のキー。
 *
 * ★ 保存キーを足したので src/pages/settings/lib/storedItems.ts の台帳にも登録してある
 *   （設定画面の一覧・削除・書き出しと、プライバシーポリシーの表に出る）。
 * ★ 設定画面は最初の読み込みに入る（遅延ロードしない）ので、ここでは楽曲データ・お題の定義を読み込まない。
 *   コードが読めるか（楽曲データにある曲・お題か）は、読む側（useMultiSet）が確かめる。
 * ★ 読めないカード（配信が止まった曲が入った など）も、ここでは落とさない。楽曲データの側が変わっただけの
 *   正しいカードを消すと、名前ごと 1 週間分の途中経過が戻らない（計画のレビュー G-06）。
 */

export const MULTI_STORAGE_KEY = "sekaimaster:bingo:multi:v1";

/** まとめて遊ぶカードの上限（Nori 2026-11-09）。 */
export const MAX_MULTI_CARDS = 5;
/** カードの名前の上限（字数）。 */
export const MAX_CARD_NAME = 16;
/** 1 枚の休止の区間の上限（壊れた・作られた保存でタブを固めない）。 */
const MAX_PAUSES = 200;
/** コードは 25 マス × 数文字。これより長いものは壊れているとみなす（bingoStorage と同じ）。 */
const MAX_CODE_LENGTH = 400;

/** 休止の区間 [始まり, 終わり]（ミリ秒）。今の休止は終わりが null。 */
export type PauseRange = readonly [number, number | null];

export interface SavedMultiCard {
  /** カードを見分ける（外す・並べ替えで番号がずれるため）。 */
  id: string;
  /** 空なら「カード1」のように番号で出す。 */
  name: string;
  /** 今の ?card= と同じコード（曲名 50 文字・お題 OD1:…）。埋めた状態も入っている。 */
  code: string;
  /** 足した（開いた）時刻。遊んだ曲の一覧から埋めるとき、これより前の曲は使わない。読めなければ 0。 */
  addedAt: number;
  /** 最初に埋めた時刻（プレイ開始）。 */
  startedAt?: number;
  paused: PauseRange[];
}

export interface SavedMulti {
  /** まとめて遊ぶを見ていたか（開き直すとその画面で開く）。 */
  open: boolean;
  /** スマホで選んでいたカードの番号。 */
  active: number;
  /** 列の切り替え（0 は自動）。 */
  cols: number;
  cards: SavedMultiCard[];
}

export const EMPTY_MULTI: SavedMulti = { open: false, active: 0, cols: 0, cards: [] };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const ID_PATTERN = /^[a-z0-9]{1,16}$/i;
/** コードは表示できる ASCII だけ（空白なし）。 */
const CODE_PATTERN = /^[\x21-\x7e]+$/;
// 制御文字と、文字の向きを変える文字（U+202A〜U+202E・U+2066〜U+2069・U+200E/U+200F・U+061C）
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩؜]/g;

/** 時刻の上限。Date が表せる最大（8.64e15 ミリ秒）。これを超える値（1e300 など）を通すと、画面の時刻が NaN になる（検分 M2 安全の低-1）。 */
export const MAX_TIME = 8.64e15;

/** 時刻（ミリ秒）として使える数か。正の有限で、Date が表せる範囲。遊んだ曲・1 枚で遊ぶの時刻の読み込みも同じ決まり。 */
export const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_TIME;

/**
 * カードの名前を整える（ファイルや画面の入力から来る文字）。制御文字・向きを変える文字を落とし、
 * 前後の空白を除いて MAX_CARD_NAME 字まで（絵文字などのサロゲートペアも 1 字に数える）。文字列でなければ空。
 */
export function cleanCardName(v: unknown): string {
  if (typeof v !== "string") return "";
  return [...v.replace(UNSAFE_CHARS, "").trim()].slice(0, MAX_CARD_NAME).join("");
}

/**
 * 休止の区間を読む。新しい MAX_PAUSES 件だけ（古い方を落とす。今の休止は最後にあるので残る）。
 * 終わりが null の区間は最後の 1 件だけ。途中にあると、遊んだ曲の一覧から埋めるときにそこから先がずっと休止になる。
 */
function parsePauses(v: unknown): PauseRange[] {
  if (!Array.isArray(v)) return [];
  const out: PauseRange[] = [];
  for (const r of v.slice(-MAX_PAUSES)) {
    if (!Array.isArray(r) || !isTime(r[0])) continue;
    if (r[1] === null) out.push([r[0], null]);
    else if (isTime(r[1]) && r[1] >= r[0]) out.push([r[0], r[1]]);
  }
  return out.filter((r, i) => r[1] !== null || i === out.length - 1);
}

/** いま休止しているか（最後の区間の終わりが null）。 */
export function isPaused(c: Pick<SavedMultiCard, "paused">): boolean {
  const last = c.paused.at(-1);
  return last !== undefined && last[1] === null;
}

/**
 * 休止する／再開する。休止は終わりが null の区間を足し、再開はその区間を now で閉じる。同じ状態なら同じものを返す。
 * ★ 時計が戻っていても、終わりを始まりより前にしない（読む側が「終わり ≥ 始まり」でない区間を落とすため）。
 */
export function withPaused(c: SavedMultiCard, paused: boolean, now: number): SavedMultiCard {
  if (isPaused(c) === paused) return c;
  if (paused) return { ...c, paused: [...c.paused, [now, null] as const].slice(-MAX_PAUSES) };
  const [start] = c.paused[c.paused.length - 1];
  return { ...c, paused: [...c.paused.slice(0, -1), [start, Math.max(now, start)] as const] };
}

function parseCard(v: unknown): SavedMultiCard | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID_PATTERN.test(r.id)) return null;
  if (typeof r.code !== "string" || r.code.length > MAX_CODE_LENGTH || !CODE_PATTERN.test(r.code)) return null;
  return {
    id: r.id,
    name: cleanCardName(r.name),
    code: r.code,
    addedAt: isTime(r.addedAt) ? r.addedAt : 0,
    ...(isTime(r.startedAt) ? { startedAt: r.startedAt } : {}),
    paused: parsePauses(r.paused),
  };
}

/**
 * 解釈済みの値からセットを作る（保存の読み込みと、中断用の書き出しの読み込みで共通）。
 * オブジェクトでなければ null。カードは 1 件ずつ見て、id・コードの形が合わない件と同じ id の 2 件目だけ落とす。
 */
export function parseMultiObject(v: unknown): SavedMulti | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const seen = new Set<string>();
  const cards: SavedMultiCard[] = [];
  for (const item of Array.isArray(r.cards) ? r.cards : []) {
    const c = parseCard(item);
    if (!c || seen.has(c.id) || cards.length === MAX_MULTI_CARDS) continue;
    seen.add(c.id);
    cards.push(c);
  }
  const active = typeof r.active === "number" && Number.isInteger(r.active) ? r.active : 0;
  const cols = typeof r.cols === "number" && Number.isInteger(r.cols) && r.cols >= 0 && r.cols <= MAX_MULTI_CARDS ? r.cols : 0;
  return {
    open: r.open === true,
    active: Math.max(0, Math.min(active, cards.length - 1)),
    cols,
    cards,
  };
}

/** 保存された文字列を読む。読めなければ空のセット。 */
export function parseSavedMulti(raw: string | null): SavedMulti {
  if (raw === null) return EMPTY_MULTI;
  try {
    return parseMultiObject(JSON.parse(raw)) ?? EMPTY_MULTI;
  } catch {
    return EMPTY_MULTI;
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadMulti(storage: StorageLike | null = defaultStorage()): SavedMulti {
  try {
    return parseSavedMulti(storage?.getItem(MULTI_STORAGE_KEY) ?? null);
  } catch {
    return EMPTY_MULTI;
  }
}

export function saveMulti(saved: SavedMulti, storage: StorageLike | null = defaultStorage()) {
  try {
    storage?.setItem(MULTI_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // 容量切れ・プライベートブラウズなど。残せないだけで遊ぶのには困らない
  }
}

/** 設定画面とプライバシーポリシーの台帳用の要約。0 枚なら null、読めなければ broken。 */
export function summarizeSavedMulti(raw: string, broken: string): string | null {
  let parsed: SavedMulti | null;
  try {
    parsed = parseMultiObject(JSON.parse(raw));
  } catch {
    return broken;
  }
  if (!parsed) return broken;
  return parsed.cards.length === 0 ? null : `カード ${parsed.cards.length} 枚`;
}

/** カードを見分ける短い id（英数字 10 字）。 */
export function newCardId(rng: () => number = Math.random): string {
  return Array.from({ length: 10 }, () => Math.floor(rng() * 36).toString(36)).join("");
}
