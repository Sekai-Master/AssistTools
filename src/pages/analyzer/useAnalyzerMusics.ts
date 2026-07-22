import { useEffect, useState } from "react";
import type { AliasEntry } from "../bingo/useBingoMusics";

/** アナライザーで使う楽曲情報。基礎点は event_rate（無い曲は除外）。 */
export interface AnalyzerMusic {
  id: string;
  title: string;
  basePoint: number;
  jacketLink: string;
  pronunciation?: string;
  artistName?: string;
}

interface RawMusic {
  id?: unknown;
  title?: unknown;
  event_rate?: unknown;
  jacketLink?: unknown;
  published?: unknown;
  pronunciation?: unknown;
  artistName?: unknown;
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parse(raw: unknown): AnalyzerMusic[] {
  if (!Array.isArray(raw)) return [];
  const out: AnalyzerMusic[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as RawMusic;
    if (!isStr(r.id) || !isStr(r.title)) continue;
    if (r.published === false) continue;
    // 基礎点が無い曲は計算に使えないので除外。
    if (!isNum(r.event_rate) || r.event_rate < 50 || r.event_rate > 300) continue;
    out.push({
      id: r.id,
      title: r.title,
      basePoint: r.event_rate,
      jacketLink: isStr(r.jacketLink) ? r.jacketLink : `jacket_s_${r.id}.webp`,
      pronunciation: isStr(r.pronunciation) ? r.pronunciation : undefined,
      artistName: isStr(r.artistName) ? r.artistName : undefined,
    });
  }
  out.sort((a, b) => Number(a.id) - Number(b.id));
  return out;
}

function parseAliases(raw: unknown): AliasEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is AliasEntry => !!e && typeof e === "object")
    .map((e) => ({
      alias: isStr((e as AliasEntry).alias) ? (e as AliasEntry).alias : "",
      songIds: Array.isArray((e as AliasEntry).songIds)
        ? (e as AliasEntry).songIds.filter((s) => isStr(s))
        : [],
    }));
}

/** public/MusicDatas の楽曲＋エイリアスを読み込む。 */
export function useAnalyzerMusics(): {
  musics: AnalyzerMusic[];
  aliases: AliasEntry[];
  loading: boolean;
} {
  const [musics, setMusics] = useState<AnalyzerMusic[]>([]);
  const [aliases, setAliases] = useState<AliasEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        const [m, a] = await Promise.all([
          fetch(`${base}MusicDatas/transformedMusics.json`, { signal: controller.signal }).then(
            (r) => r.json()
          ),
          fetch(`${base}MusicDatas/aliasMapping.json`, { signal: controller.signal })
            .then((r) => r.json())
            .catch(() => []),
        ]);
        if (controller.signal.aborted) return;
        setMusics(parse(m));
        setAliases(parseAliases(a));
      } catch {
        /* 読み込み失敗時は空。UIでガードする */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { musics, aliases, loading };
}
