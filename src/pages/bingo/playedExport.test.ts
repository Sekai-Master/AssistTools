/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusics } from "./useBingoMusics";
import type { PlayedEntry } from "./playedStorage";
import { csvField, playedCsv, playedCsvFileName, playedRows, playedText } from "./playedExport";

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const BY_ID = new Map(MUSICS.map((m) => [m.id, m]));
const byTitle = (t: string) => MUSICS.find((m) => m.title === t)!;
// この端末の時刻で 2026-11-09 21:03 と 11-10 08:05
const T1 = new Date(2026, 10, 9, 21, 3).getTime();
const T2 = new Date(2026, 10, 10, 8, 5).getTime();
const e = (id: string, at: number): PlayedEntry => ({ id, at });

describe("playedRows", () => {
  it("遊んだ順に番号を振り、楽曲データに無い曲は落とす", () => {
    const a = byTitle("Hello, Worker");
    const rows = playedRows([e(a.id, T1), e("9999", T1 + 1), e(a.id, T2)], BY_ID);
    expect(rows.map((r) => [r.no, r.at, r.music.id])).toEqual([
      [1, T1, a.id],
      [2, T2, a.id],
    ]);
  });
});

describe("テキストのコピー", () => {
  it("見出しに曲数と期間、古い順に番号・日時・曲名", () => {
    const a = byTitle("Hello, Worker");
    const b = byTitle("Help me, ERINNNNNN!!");
    const text = playedText(playedRows([e(a.id, T1), e(b.id, T2)], BY_ID));
    expect(text).toBe(["遊んだ曲（2曲・11/9 21:03〜11/10 08:05）", "1. 11/9 21:03 Hello, Worker", "2. 11/10 08:05 Help me, ERINNNNNN!!"].join("\n"));
  });

  it("1 曲なら期間は 1 つ、0 曲なら見出しだけ", () => {
    const a = byTitle("Hello, Worker");
    expect(playedText(playedRows([e(a.id, T1)], BY_ID)).split("\n")[0]).toBe("遊んだ曲（1曲・11/9 21:03）");
    expect(playedText([])).toBe("遊んだ曲（0曲）");
  });
});

describe("CSV", () => {
  it("BOM つきで、全部の欄を \" で囲み、\" は 2 つに重ねる。列は 番号・日時・曲名・作者・ユニット（表示名）", () => {
    const comma = ["Hello,world!", "Hello, Worker", "Help me, ERINNNNNN!!"].map(byTitle);
    // 曲名に , を含む実在の 3 曲（計画のレビューで数えた）
    expect(comma.every(Boolean)).toBe(true);
    const csv = playedCsv(playedRows([e(comma[0].id, T1), e(comma[1].id, T2)], BY_ID));
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe('"番号","日時","曲名","作者","ユニット"');
    expect(lines[1]).toBe(`"1","2026-11-09 21:03","Hello,world!","${comma[0].artistName ?? ""}","${unitLabel(comma[0].Unit)}"`);
    expect(lines).toHaveLength(3);
  });

  it("頭が = + - @ TAB CR の欄には ' を付け、表計算の式として動かないようにする", () => {
    for (const head of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvField(`${head}SUM(A1)`)).toBe(`"'${head}SUM(A1)"`);
    }
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("ロウワー")).toBe('"ロウワー"');
  });

  it("ファイル名は bingo_played_YYYYMMDD.csv（この端末の日付）", () => {
    expect(playedCsvFileName(new Date(2026, 10, 9, 21, 3))).toBe("bingo_played_20261109.csv");
  });
});

function unitLabel(unit: string): string {
  const labels: Record<string, string> = { "0_VS": "VS", "1_L/n": "L/n", "2_MMJ": "MMJ", "3_VBS": "VBS", "4_WxS": "WxS", "5_25": "25時", "9_oth": "その他" };
  return labels[unit] ?? unit;
}

describe("見出しの期間（時刻順でない一覧）", () => {
  it("書き出しを読み込んだ一覧などで並びが時刻順でなくても、いちばん古い時刻からいちばん新しい時刻まで", () => {
    const a = byTitle("Hello, Worker");
    expect(playedText(playedRows([e(a.id, T2), e(a.id, T1)], BY_ID)).split("\n")[0]).toBe("遊んだ曲（2曲・11/9 21:03〜11/10 08:05）");
  });
});
