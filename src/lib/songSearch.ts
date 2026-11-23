/**
 * 曲の検索（曲名・読み・作者・別名）。共通の SongSearchModal と、ビンゴの曲を選ぶ小窓（BingoSongPicker）の両方が使う。
 * ★ 決まりを片方だけ直さないよう、検索の処理はここだけに置く。件数で切るのは呼ぶ側
 *   （SongSearchModal は先頭の 80 曲、ビンゴは「もっと見る」）。
 */

export interface SearchableSong {
  id: string;
  title: string;
  jacketLink: string;
  pronunciation?: string;
  artistName?: string;
}

export interface AliasEntry {
  alias: string;
  songIds: string[];
}

const nonEmptyStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s !== "") : [];

/**
 * public/MusicDatas/aliasMapping.json を AliasEntry の並びにする。アナライザーとビンゴの両方が使う。
 * alias は文字列か文字列の配列（例 {"alias": ["…", "エビ"], "songIds": ["074"]}）。配列は 1 つずつの行に分ける。
 * ★ 2026-11-23 まで両方のページが文字列だけを通していて、配列で持つ通称（エビ・カゲプロなど）が検索に出なかった。
 */
export function parseAliases(raw: unknown): AliasEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AliasEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { alias, songIds } = e as { alias?: unknown; songIds?: unknown };
    const ids = nonEmptyStrings(songIds);
    if (ids.length === 0) continue;
    const names = typeof alias === "string" ? nonEmptyStrings([alias]) : nonEmptyStrings(alias);
    for (const name of names) out.push({ alias: name, songIds: ids });
  }
  return out;
}

/**
 * query に当てはまる曲を、元の並びのまま返す。空（空白だけ）なら全部。
 * 曲名・作者・別名は大文字小文字を問わない。読みはそのまま含むかを見る（読みはひらがなで持っている）。
 */
export function searchSongs<T extends SearchableSong>(
  musics: readonly T[],
  aliases: readonly AliasEntry[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...musics];
  const aliasIds = new Set<string>();
  for (const a of aliases) {
    if (a.alias.toLowerCase().includes(q)) a.songIds.forEach((id) => aliasIds.add(id));
  }
  return musics.filter(
    (m) =>
      aliasIds.has(m.id) ||
      m.title.toLowerCase().includes(q) ||
      m.pronunciation?.includes(q) ||
      m.artistName?.toLowerCase().includes(q)
  );
}
