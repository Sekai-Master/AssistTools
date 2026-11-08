/**
 * ビンゴの途中経過（作ったカードと埋めた状態）をこの端末に残す。
 * 中身はカードのコード（リンクと同じもの）。お題・曲名を 1 枚ずつ持つ。
 *
 * ★ 保存キーを足したので src/pages/settings/lib/storedItems.ts の台帳にも登録してある
 *   （設定画面の一覧・削除・書き出しと、プライバシーポリシーの表に出る）。
 */
import type { CardKind } from "./bingoShare";

export const BINGO_STORAGE_KEY = "sekaimaster:bingo:v1";

export interface SavedBingo {
  /** 最後に見ていた種類。 */
  kind: CardKind;
  odai?: string;
  song?: string;
}

/** コードは 25 マス × 数文字。これより長いものは壊れているとみなす。 */
const MAX_CODE_LENGTH = 400;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const isCode = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_CODE_LENGTH;

/** 保存された文字列を読む。形が違えば null（壊れた値は無視する）。 */
export function parseSavedBingo(raw: string | null): SavedBingo | null {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const r = v as Record<string, unknown>;
    if (r.kind !== "odai" && r.kind !== "song") return null;
    if (r.odai !== undefined && !isCode(r.odai)) return null;
    if (r.song !== undefined && !isCode(r.song)) return null;
    return {
      kind: r.kind,
      ...(r.odai !== undefined ? { odai: r.odai as string } : {}),
      ...(r.song !== undefined ? { song: r.song as string } : {}),
    };
  } catch {
    return null;
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadBingo(storage: StorageLike | null = defaultStorage()): SavedBingo | null {
  try {
    return parseSavedBingo(storage?.getItem(BINGO_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveBingo(saved: SavedBingo, storage: StorageLike | null = defaultStorage()) {
  try {
    storage?.setItem(BINGO_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // 容量切れ・プライベートブラウズなど。残せないだけで遊ぶのには困らない
  }
}

/** 設定画面とプライバシーポリシーの台帳用の要約。カードが無ければ null、読めなければ broken。 */
export function summarizeSavedBingo(raw: string, broken: string): string | null {
  const saved = parseSavedBingo(raw);
  if (!saved) return broken;
  const names = [saved.odai && "お題ビンゴ", saved.song && "曲名ビンゴ"].filter(Boolean);
  return names.length === 0 ? null : names.join("・");
}
