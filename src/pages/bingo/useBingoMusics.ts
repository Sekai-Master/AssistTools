import { useEffect, useState } from "react";
import type { BingoMusic } from "./bingoLogic";

export interface AliasEntry {
  alias: string;
  songIds: string[];
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

function parseMusics(raw: unknown): BingoMusic[] {
  if (!Array.isArray(raw)) return [];
  const out: BingoMusic[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!isStr(r.id) || !isStr(r.title)) continue;
    if (r.published === false) continue;
    if (!isStr(r.Unit) || !Array.isArray(r.categories)) continue;
    out.push({
      id: r.id,
      title: r.title,
      pronunciation: isStr(r.pronunciation) ? r.pronunciation : undefined,
      artistName: isStr(r.artistName) ? r.artistName : undefined,
      default: typeof r.default === "number" ? r.default : 0,
      Unit: r.Unit,
      categories: r.categories.filter(isStr),
      isNewlyWrittenMusic: isBool(r.isNewlyWrittenMusic) ? r.isNewlyWrittenMusic : false,
      jacketLink: isStr(r.jacketLink) ? r.jacketLink : `jacket_s_${r.id}.webp`,
    });
  }
  out.sort((a, b) => a.default - b.default);
  return out;
}

function parseAliases(raw: unknown): AliasEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is AliasEntry => !!e && typeof e === "object")
    .map((e) => ({
      alias: isStr((e as AliasEntry).alias) ? (e as AliasEntry).alias : "",
      songIds: Array.isArray((e as AliasEntry).songIds)
        ? (e as AliasEntry).songIds.filter((s) => isStr(s) && s !== "")
        : [],
    }));
}

/** BINGO用の楽曲＋エイリアスを読み込む。 */
export function useBingoMusics() {
  const [musics, setMusics] = useState<BingoMusic[]>([]);
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
        setMusics(parseMusics(m));
        setAliases(parseAliases(a));
      } catch {
        /* 失敗時は空。UIでガード */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { musics, aliases, loading };
}
