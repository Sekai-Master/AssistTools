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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        // 楽曲データは必須。res.ok を確認（SPAフォールバックで index.html が
        // 返ると r.json() が例外になるため、HTTP ステータスで明示的に弾く）。
        const mRes = await fetch(`${base}MusicDatas/transformedMusics.json`, {
          signal: controller.signal,
        });
        if (!mRes.ok) throw new Error(`楽曲データの取得に失敗しました (HTTP ${mRes.status})`);
        const m = await mRes.json();
        // エイリアスは任意。失敗しても本体は続行。
        const a = await fetch(`${base}MusicDatas/aliasMapping.json`, { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);
        if (controller.signal.aborted) return;
        const parsed = parseMusics(m);
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
