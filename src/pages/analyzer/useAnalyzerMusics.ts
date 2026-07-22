import { useEffect, useState } from "react";

/** アナライザーで使う楽曲情報。基礎点は event_rate（無い曲は除外）。 */
export interface AnalyzerMusic {
  id: string;
  title: string;
  basePoint: number;
  jacketLink: string;
}

interface RawMusic {
  id?: unknown;
  title?: unknown;
  event_rate?: unknown;
  jacketLink?: unknown;
  published?: unknown;
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
    });
  }
  out.sort((a, b) => Number(a.id) - Number(b.id));
  return out;
}

/** public/MusicDatas/transformedMusics.json を読み込む。 */
export function useAnalyzerMusics(): { musics: AnalyzerMusic[]; loading: boolean } {
  const [musics, setMusics] = useState<AnalyzerMusic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}MusicDatas/transformedMusics.json`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!controller.signal.aborted) setMusics(parse(json));
      } catch {
        /* 読み込み失敗時は空。UIでガードする */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { musics, loading };
}
