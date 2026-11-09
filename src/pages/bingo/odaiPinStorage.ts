/**
 * 入れたいお題（作るカードに必ず入れるお題）の鍵を、この端末に残す。カードの途中経過（bingoStorage.ts）とは別のキー。
 *
 * ★ 保存キーを足したので src/pages/settings/lib/storedItems.ts の台帳にも登録してある
 *   （設定画面の一覧・削除・書き出しと、プライバシーポリシーの表に出る）。
 * ★ 設定画面は最初の読み込みに入る（遅延ロードしない）ので、ここではお題の定義や楽曲データを読み込まない。
 *   楽曲データに無い鍵は、読む側（BingoGenerator）が選べるお題と突き合わせて落とす。
 */

/** 入れたいお題の数の上限（Nori 2026-11-09）。 */
export const MAX_ODAI_PINS = 5;

export const ODAI_PINS_STORAGE_KEY = "sekaimaster:bingo:pins:v1";

/** お題の鍵の形（u1・s21・c286・a2024・dm32 など）。これに合わないものは壊れているとみなして落とす。 */
const KEY_PATTERN = /^[a-z][a-z0-9]{0,11}$/;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 保存された文字列を読む。配列でなければ空。形の合わない鍵・重複は黙って落とし、MAX_ODAI_PINS 個まで。 */
export function parseSavedPins(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const keys = v.filter((k): k is string => typeof k === "string" && KEY_PATTERN.test(k));
    return [...new Set(keys)].slice(0, MAX_ODAI_PINS);
  } catch {
    return [];
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadOdaiPins(storage: StorageLike | null = defaultStorage()): string[] {
  try {
    return parseSavedPins(storage?.getItem(ODAI_PINS_STORAGE_KEY) ?? null);
  } catch {
    return [];
  }
}

/** 空なら消す（設定画面の一覧に、空の項目を出さない）。 */
export function saveOdaiPins(keys: readonly string[], storage: StorageLike | null = defaultStorage()) {
  try {
    if (keys.length === 0) storage?.removeItem(ODAI_PINS_STORAGE_KEY);
    else storage?.setItem(ODAI_PINS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // 容量切れ・プライベートブラウズなど。残せないだけで作るのには困らない
  }
}

/** 設定画面とプライバシーポリシーの台帳用の要約。空なら null、配列でなければ broken。 */
export function summarizeSavedPins(raw: string, broken: string): string | null {
  try {
    if (!Array.isArray(JSON.parse(raw))) return broken;
  } catch {
    return broken;
  }
  const n = parseSavedPins(raw).length;
  return n === 0 ? null : `${n} 個`;
}
