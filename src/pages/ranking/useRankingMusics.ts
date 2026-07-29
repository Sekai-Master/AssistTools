import { useEffect, useState } from "react";
import type { EfficiencyEntry } from "./lib/efficiency";

/**
 * ランキング用に、楽曲を「1曲1難易度」の粒度へ展開して読み込む。
 *
 * 曲単位のデータ（transformedMusics.json）と難易度別データ（musicScoreData.json）は
 * ファイルが分かれている。難易度別は 428KB あり、使うのはこのツールだけなので
 * 全ツール共通のファイルには同梱していない。
 */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const numArr = (v: unknown): number[] | null =>
  Array.isArray(v) && v.length > 0 && v.every(isNum) ? (v as number[]) : null;

/** 表示順を固定するための難易度の並び。 */
export const DIFFICULTY_ORDER = ["easy", "normal", "hard", "expert", "master", "append"] as const;
export type Difficulty = (typeof DIFFICULTY_ORDER)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "EASY",
  normal: "NORMAL",
  hard: "HARD",
  expert: "EXPERT",
  master: "MASTER",
  append: "APPEND",
};

interface RawDifficulty {
  playLevel?: unknown;
  noteCount?: unknown;
  baseScore?: unknown;
  skillScoreSolo?: unknown;
  baseScoreAuto?: unknown;
  skillScoreAuto?: unknown;
}

interface RawMusic {
  id?: unknown;
  title?: unknown;
  published?: unknown;
  music_time?: unknown;
  event_rate?: unknown;
  jacketLink?: unknown;
}

export interface RankingMusic extends EfficiencyEntry {
  jacketLink: string;
}

function parse(rawMusics: unknown, rawScores: unknown): RankingMusic[] {
  if (!Array.isArray(rawMusics)) return [];
  const scores = (rawScores && typeof rawScores === "object" ? rawScores : {}) as Record<
    string,
    Record<string, RawDifficulty | undefined> | undefined
  >;
  const out: RankingMusic[] = [];

  for (const item of rawMusics) {
    if (!item || typeof item !== "object") continue;
    const m = item as RawMusic;
    if (!isStr(m.id) || !isStr(m.title)) continue;
    // 配信停止・未公開・イベント限定は候補から外す（実際に叩けない曲を並べない）。
    if (m.published === false) continue;

    const byDiff = scores[m.id];
    if (!byDiff) continue;

    const musicTime = isNum(m.music_time) ? m.music_time : null;
    const eventRate = isNum(m.event_rate) ? m.event_rate : null;

    for (const key of DIFFICULTY_ORDER) {
      const d = byDiff[key];
      if (!d) continue;
      const baseScore = isNum(d.baseScore) ? d.baseScore : null;
      const skillScoreSolo = numArr(d.skillScoreSolo);
      if (baseScore == null || !skillScoreSolo) continue;

      out.push({
        musicId: m.id,
        title: m.title,
        difficulty: key,
        playLevel: isNum(d.playLevel) ? d.playLevel : null,
        noteCount: isNum(d.noteCount) ? d.noteCount : null,
        baseScore,
        skillScoreSolo,
        baseScoreAuto: isNum(d.baseScoreAuto) ? d.baseScoreAuto : null,
        skillScoreAuto: numArr(d.skillScoreAuto),
        musicTime,
        eventRate,
        jacketLink: isStr(m.jacketLink) ? m.jacketLink : `jacket_s_${m.id}.webp`,
      });
    }
  }
  return out;
}

export function useRankingMusics(): {
  entries: RankingMusic[];
  loading: boolean;
  error: string | null;
} {
  const [entries, setEntries] = useState<RankingMusic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          fetch(`${base}MusicDatas/transformedMusics.json`, { signal: controller.signal }),
          fetch(`${base}MusicDatas/musicScoreData.json`, { signal: controller.signal }),
        ]);
        // SPAフォールバックで index.html が返ると json() が例外になるので先に確認する。
        if (!mRes.ok) throw new Error(`楽曲データの取得に失敗しました (HTTP ${mRes.status})`);
        if (!sRes.ok) throw new Error(`難易度データの取得に失敗しました (HTTP ${sRes.status})`);
        const parsed = parse(await mRes.json(), await sRes.json());
        if (controller.signal.aborted) return;
        if (parsed.length === 0) {
          throw new Error("難易度データを持つ楽曲がありません。データ更新が必要かもしれません。");
        }
        setEntries(parsed);
        setError(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "楽曲データの読み込みに失敗しました。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { entries, loading, error };
}
