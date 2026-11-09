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
import { type SavedMulti, parseMultiObject } from "./multiStorage";

export const EXPORT_APP = "sekaimaster-bingo";
export const EXPORT_VERSION = 1;
/** これより大きいファイルは読まない（壊れた・別のファイルでタブを固めない）。 */
export const MAX_EXPORT_BYTES = 2_000_000;

export interface MultiExport {
  app: typeof EXPORT_APP;
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  multi: SavedMulti;
  /** 遊んだ曲の一覧（{ id, at, cells? }）。一覧の PR まで空。 */
  played: unknown[];
}

export type ImportResult =
  | {
      ok: true;
      multi: SavedMulti;
      /** 書き出した時刻。読めなければ null。 */
      exportedAt: number | null;
      /** 形の合わないカードを落とした数（黙って捨てずに画面で知らせる）。 */
      dropped: number;
    }
  | { ok: false; error: string };

export function buildMultiExport(multi: SavedMulti, now: number): MultiExport {
  return { app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: now, multi, played: [] };
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

/** 遊んだ曲の欄を見る。無い・空なら null。 */
function playedError(v: unknown): string | null {
  if (v === undefined || (Array.isArray(v) && v.length === 0)) return null;
  // ★ この版には遊んだ曲の一覧の保存が無い。読むと一覧を黙って捨てることになるので、新しいページで読んでもらう
  if (Array.isArray(v)) return "遊んだ曲の一覧が入った、新しい版の書き出しです。ページを読み込み直してから試してください";
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

  const multi = parseMultiObject(r.multi);
  if (!multi) return fail("書き出しが壊れています（カードの欄が読めません）");
  if (multi.cards.length === 0) return fail("書き出しにカードが入っていません");
  const rawCards = (r.multi as Record<string, unknown>).cards;
  const given = Array.isArray(rawCards) ? rawCards.length : 0;
  return {
    ok: true,
    multi: { ...multi, open: true },
    exportedAt: typeof r.exportedAt === "number" && Number.isFinite(r.exportedAt) && r.exportedAt > 0 ? r.exportedAt : null,
    dropped: Math.max(0, given - multi.cards.length),
  };
}
