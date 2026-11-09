/**
 * 遊んだ曲の一覧の書き出し（テキストのコピーと CSV）。
 * 画像は作らない（計画 2-5）。共有の文・画像には時刻を載せない決まり（持ち主の決定 3）だが、
 * これは自分の記録の書き出しなので、遊んだ日時を入れる。
 */
import type { BingoMusic } from "./bingoLogic";
import { UNIT_OPTIONS } from "./bingoConstants";
import { shortTime } from "./multiExport";
import type { PlayedEntry } from "./playedStorage";

export interface PlayedRow {
  /** 遊んだ順の番号（古いほうから 1）。 */
  no: number;
  at: number;
  music: BingoMusic;
  /** もとの 1 件（一覧から消すときに使う）。 */
  entry: PlayedEntry;
}

/** 一覧を画面・書き出し用の行にする。楽曲データに無い曲（配信が止まった など）は落とす（保存には残す）。 */
export function playedRows(entries: readonly PlayedEntry[], musicById: ReadonlyMap<string, BingoMusic>): PlayedRow[] {
  return entries
    .flatMap((e) => {
      const music = musicById.get(e.id);
      return music ? [{ at: e.at, music, entry: e }] : [];
    })
    .map((r, i) => ({ no: i + 1, ...r }));
}

/** 見出しの期間（「11/9 21:03〜11/10 08:05」）。 */
function spanText(rows: readonly PlayedRow[]): string {
  if (rows.length === 0) return "";
  const first = shortTime(rows[0].at);
  const last = shortTime(rows[rows.length - 1].at);
  return first === last ? `・${first}` : `・${first}〜${last}`;
}

/** テキストのコピー: 見出し（曲数と期間）と、古い順の番号・日時・曲名。 */
export function playedText(rows: readonly PlayedRow[]): string {
  const head = `遊んだ曲（${rows.length}曲${spanText(rows)}）`;
  return [head, ...rows.map((r) => `${r.no}. ${shortTime(r.at)} ${r.music.title}`)].join("\n");
}

/**
 * CSV の 1 欄。全部を " で囲み、" は 2 つに重ねる。
 * 頭が = + - @ TAB CR の欄は ' を付け、表計算に読ませたときに式として動かないようにする（OWASP の CSV Injection の推奨。計画のレビュー G-24）。
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const UNIT_LABEL = new Map(UNIT_OPTIONS.map((o) => [o.value, o.label]));
const pad = (n: number) => String(n).padStart(2, "0");

/** CSV の日時（「2026-11-09 21:03」。この端末の時刻）。 */
function csvTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** CSV: 番号・日時・曲名・作者・ユニット（表示名）。UTF-8 の BOM つき（Excel で開いたときに字が化けないように）。改行は CRLF。 */
export function playedCsv(rows: readonly PlayedRow[]): string {
  const lines = [
    ["番号", "日時", "曲名", "作者", "ユニット"],
    ...rows.map((r) => [
      String(r.no),
      csvTime(r.at),
      r.music.title,
      r.music.artistName ?? "",
      UNIT_LABEL.get(r.music.Unit) ?? r.music.Unit,
    ]),
  ];
  return `﻿${lines.map((cols) => cols.map(csvField).join(",")).join("\r\n")}`;
}

/** CSV のファイル名（bingo_played_YYYYMMDD.csv。この端末の日付）。 */
export function playedCsvFileName(now: Date): string {
  return `bingo_played_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
}

/** プレイ開始の文（「プレイ開始 11/12 15:03」）。fresh はこの画面を開いてから付いた時刻で、そのときだけ「！」を付ける。 */
export function playStartText(at: number, fresh: boolean): string {
  return `プレイ開始${fresh ? "！" : ""} ${shortTime(at)}`;
}
