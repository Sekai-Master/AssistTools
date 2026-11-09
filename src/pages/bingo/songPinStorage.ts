/**
 * 曲名ビンゴの入れたい曲（作るカードに必ず入れる曲）の id を、この端末に残す。
 * カードの途中経過（bingoStorage.ts）・入れたいお題（odaiPinStorage.ts）とは別のキー。
 *
 * ★ 保存キーを足したので src/pages/settings/lib/storedItems.ts の台帳にも登録してある
 *   （設定画面の一覧・削除・書き出しと、プライバシーポリシーの表に出る）。
 * ★ 設定画面は最初の読み込みに入る（遅延ロードしない）ので、ここでは楽曲データを読み込まない。
 *   楽曲データに無い id は、読む側（useSongPins）が resolveSavedSongPins で落とす。
 */

/** 入れたい曲の数の上限（Nori 2026-11-09）。中央を除く 24 マスぶん。 */
export const MAX_SONG_PINS = 24;

export const SONG_PINS_STORAGE_KEY = "sekaimaster:bingo:songPins:v1";

/** 曲 id の形（"001"〜"828" など。楽曲データの id は 3 桁の 0 埋め、コードの上限は 2047）。 */
const ID_PATTERN = /^\d{1,4}$/;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 保存された文字列を読む。配列でなければ空。形の合わない id・重複は黙って落とし、MAX_SONG_PINS 個まで。 */
export function parseSavedSongPins(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const ids = v.filter((id): id is string => typeof id === "string" && ID_PATTERN.test(id));
    return [...new Set(ids)].slice(0, MAX_SONG_PINS);
  } catch {
    return [];
  }
}

/** 楽曲データにある id だけを残す（配信停止・公開前の曲は黙って落とす。楽曲データは公開曲だけ）。 */
export function resolveSavedSongPins(ids: readonly string[], known: ReadonlyMap<string, unknown>): string[] {
  return ids.filter((id) => known.has(id));
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSongPins(storage: StorageLike | null = defaultStorage()): string[] {
  try {
    return parseSavedSongPins(storage?.getItem(SONG_PINS_STORAGE_KEY) ?? null);
  } catch {
    return [];
  }
}

/** 空なら消す（設定画面の一覧に、空の項目を出さない）。 */
export function saveSongPins(ids: readonly string[], storage: StorageLike | null = defaultStorage()) {
  try {
    if (ids.length === 0) storage?.removeItem(SONG_PINS_STORAGE_KEY);
    else storage?.setItem(SONG_PINS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 容量切れ・プライベートブラウズなど。残せないだけで作るのには困らない
  }
}

/** 設定画面とプライバシーポリシーの台帳用の要約。空なら null、配列でなければ broken。 */
export function summarizeSavedSongPins(raw: string, broken: string): string | null {
  try {
    if (!Array.isArray(JSON.parse(raw))) return broken;
  } catch {
    return broken;
  }
  const n = parseSavedSongPins(raw).length;
  return n === 0 ? null : `${n} 曲`;
}
