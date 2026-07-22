import { useEffect, useState } from "react";
import type { AliasEntry } from "../bingo/useBingoMusics";
import { getVerifiedBasePoint } from "./verifiedBasePoints";

/**
 * アナライザーで使う楽曲情報。基礎点は「実測値 > event_rate」の優先順位で決める
 * （event_rate は長尺曲を130で頭打ちにする系統誤差があるため）。基礎点が無い曲は除外。
 */
export interface AnalyzerMusic {
  id: string;
  title: string;
  basePoint: number;
  /** 基礎点の出どころ。実測補正が効いた曲を UI で示すために使う。 */
  basePointSource: "verified" | "remote";
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
    // 実測補正が有ればそれを優先（event_rate の 130 頭打ち系統誤差を上書き）。
    const verified = getVerifiedBasePoint(r.id);
    out.push({
      id: r.id,
      title: r.title,
      basePoint: verified ?? r.event_rate,
      basePointSource: verified !== undefined ? "verified" : "remote",
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
  error: string | null;
} {
  const [musics, setMusics] = useState<AnalyzerMusic[]>([]);
  const [aliases, setAliases] = useState<AliasEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        // 楽曲データ(必須)とエイリアス(任意)を並列取得。楽曲は res.ok を確認
        // （SPAフォールバックで index.html が返ると r.json() が例外になるため）。
        const [mRes, aRes] = await Promise.all([
          fetch(`${base}MusicDatas/transformedMusics.json`, { signal: controller.signal }),
          fetch(`${base}MusicDatas/aliasMapping.json`, { signal: controller.signal }).catch(
            () => null
          ),
        ]);
        if (!mRes.ok) throw new Error(`楽曲データの取得に失敗しました (HTTP ${mRes.status})`);
        const m = await mRes.json();
        // エイリアスは失敗しても本体は続行。
        const a = aRes && aRes.ok ? await aRes.json().catch(() => []) : [];
        if (controller.signal.aborted) return;
        const parsed = parse(m);
        if (parsed.length === 0) {
          throw new Error("有効な楽曲データがありません。データ更新が必要かもしれません。");
        }
        setMusics(parsed);
        setAliases(parseAliases(a));
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

  return { musics, aliases, loading, error };
}
