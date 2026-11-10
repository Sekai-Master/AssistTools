/**
 * まとめて遊ぶの、中断・再開用の完全な書き出し（ファイル）。
 *
 * 共有のリンク（?card=）で渡すのはマスと埋まり具合だけ（持ち主 2026-11-10）。名前・休止の区間・プレイ開始の時刻・
 * 遊んだ曲の一覧まで持って、別の端末やみんなで遊ぶ回の続きから遊ぶためのものはこちら。
 * ★ 形はファイル（JSON）。遊んだ曲の一覧が 1 週間で数百〜1000 件になり、コードにするとチャットに貼れる長さを超える。
 *   版の欄を持たせて、別の版を読んだときに理由を出す。先例は設定画面の書き出し（settings/lib/backup.ts）。
 * ★ 読み込みは外部の入力（人が編集できる・別のファイルを掴める）。読めないときはセットを作らずに理由を返し、
 *   今のセットを壊さない。カードは multiStorage の決まりで 1 件ずつ読み、楽曲データで読めるかはここでは見ない
 *   （読めないカードも落とさずに持ってくる。計画のレビュー G-06）。
 */
import { type SavedMulti, isImportTime, parseMultiObject } from "./multiStorage";
import { type PlayedEntry, parsePlayedArray } from "./playedStorage";

export const EXPORT_APP = "sekaimaster-bingo";
export const EXPORT_VERSION = 1;
/** これより大きいファイルは読まない（壊れた・別のファイルでタブを固めない）。 */
export const MAX_EXPORT_BYTES = 2_000_000;

export interface MultiExport {
  app: typeof EXPORT_APP;
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  multi: SavedMulti;
  /**
   * 遊んだ曲の一覧（{ id, at, cells? }。形は playedStorage.ts）。1 枚で遊ぶ・まとめて遊ぶで共通の、この端末の一覧の全部。
   * ★ 版は 1 のまま。#231（M2）の版は、ここに曲が入った書き出しを「新しい版」と断って読まない作りにしてある
   */
  played: PlayedEntry[];
}

export type ImportResult =
  | {
      ok: true;
      multi: SavedMulti;
      /** 書き出した時刻。読めなければ null。 */
      exportedAt: number | null;
      /** 形の合わない・6 枚目より後のカードを落とした数（黙って捨てずに画面で知らせる）。 */
      dropped: number;
      /**
       * 遊んだ曲の一覧。書き出しに曲が入っていなければ null（今の一覧を変えない。曲の欄が空の書き出しは、
       * 一覧が空だったのか、一覧を持たない前の版の書き出しかを見分けられないため）。
       */
      played: PlayedEntry[] | null;
      /** 形の合わない遊んだ曲を落とした数。 */
      droppedPlayed: number;
    }
  | { ok: false; error: string };

export function buildMultiExport(multi: SavedMulti, now: number, played: readonly PlayedEntry[] = []): MultiExport {
  return { app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: now, multi, played: [...played] };
}

export function exportFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  return `sekaimaster-bingo-${day}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** 書き出した時刻の短い形（「11/12 15:03」。この端末の時刻）。 */
export function shortTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const fail = (error: string): ImportResult => ({ ok: false, error });

/** 版の欄を見る。読める版なら null、読めなければ理由。 */
function versionError(v: unknown): string | null {
  if (v === EXPORT_VERSION) return null;
  if (typeof v === "number" && Number.isInteger(v) && v > EXPORT_VERSION) {
    return "新しい版の書き出しです。ページを読み込み直してから試してください";
  }
  return "書き出しが壊れています（版が読めません）";
}

/** 遊んだ曲の欄を見る。無い・配列なら null。 */
function playedError(v: unknown): string | null {
  if (v === undefined || Array.isArray(v)) return null;
  return "書き出しが壊れています（遊んだ曲の欄が読めません）";
}

/** 書き出しのファイルの中身を読む。localStorage にも画面にも触らない（置き換えるかは呼ぶ側が確かめてから）。 */
export function parseMultiExport(text: string): ImportResult {
  if (text.length > MAX_EXPORT_BYTES) return fail("ファイルが大きすぎます（2MB まで）");
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return fail("ファイルを読めませんでした（ビンゴの書き出しではありません）");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail("ビンゴの書き出しではありません");
  const r = v as Record<string, unknown>;
  if (r.app !== EXPORT_APP) return fail("ビンゴの書き出しではありません");
  const bad = versionError(r.version) ?? playedError(r.played);
  if (bad) return fail(bad);

  // ファイルは人が作れるので、時刻は厳しい範囲（2020-09-30 以後・今から 1 日先まで）で読む。この端末の保存の読み込みは緩いまま（検分 P2 中-1）
  const multi = parseMultiObject(r.multi, isImportTime);
  if (!multi) return fail("書き出しが壊れています（カードの欄が読めません）");
  if (multi.cards.length === 0) return fail("書き出しにカードが入っていません");
  const rawCards = (r.multi as Record<string, unknown>).cards;
  const given = Array.isArray(rawCards) ? rawCards.length : 0;
  const played = parsePlayedArray(r.played, isImportTime);
  const hasPlayed = Array.isArray(r.played) && r.played.length > 0;
  // 空でない配列が 1 件も読めなければ、カードの欄と同じく読まない（今の一覧を 0 曲で置き換えない。検分 P 安全の低-2）
  if (hasPlayed && played.entries.length === 0) return fail("書き出しが壊れています（遊んだ曲の欄が読めません）");
  return {
    ok: true,
    multi: { ...multi, open: true },
    exportedAt: isImportTime(r.exportedAt) ? r.exportedAt : null,
    dropped: Math.max(0, given - multi.cards.length),
    played: hasPlayed ? played.entries : null,
    droppedPlayed: played.dropped,
  };
}
