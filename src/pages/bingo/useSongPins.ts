/**
 * 曲名ビンゴの入れたい曲（24 曲まで）の状態と、この端末への保存。
 * ★ 楽曲データが届く前の部品は、BingoGenerator が届いたら key を変えて作り直す。届く前の空の一覧で
 *   保存を消さないよう、保存は ready を待つ（入れたいお題と同じ）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { type BingoMusic, filterForGeneration, songCardNeeds } from "./bingoLogic";
import type { SongFilters } from "./BingoSettings";
import { MAX_SONG_PINS, loadSongPins, resolveSavedSongPins, saveSongPins } from "./songPinStorage";

export function useSongPins(musics: readonly BingoMusic[]) {
  const ready = musics.length > 0;
  const byId = useMemo(() => new Map(musics.map((m) => [m.id, m])), [musics]);
  // 楽曲データに無い id（配信停止・公開前）は黙って落とす
  const [ids, setIds] = useState<string[]>(() => resolveSavedSongPins(loadSongPins(), byId));

  useEffect(() => {
    if (ready) saveSongPins(ids);
  }, [ready, ids]);

  const pins = useMemo(() => ids.flatMap((id) => byId.get(id) ?? []), [ids, byId]);

  /** 選んでいれば外し、いなければ足す（MAX_SONG_PINS まで）。 */
  const toggle = useCallback(
    (m: BingoMusic) =>
      setIds((cur) =>
        cur.includes(m.id) ? cur.filter((id) => id !== m.id) : cur.length < MAX_SONG_PINS ? [...cur, m.id] : cur
      ),
    []
  );
  const remove = useCallback((id: string) => setIds((cur) => cur.filter((x) => x !== id)), []);
  const clear = useCallback(() => setIds([]), []);

  return { ids, pins, toggle, remove, clear };
}

/**
 * 曲名ビンゴの絞り込みに当てはまる曲（pool）と、作るのに足りるか（needs）、条件の外の入れたい曲（outside）。
 * 細かい設定の曲数・「新しいカードを作る」を押せるか・作るときの pool に同じものを使う。
 */
export function useSongPool(musics: readonly BingoMusic[], filters: SongFilters, pins: readonly BingoMusic[]) {
  const { units, categories, types, singer, centerMode, centerSong } = filters;
  const pool = useMemo(
    () => filterForGeneration(musics, units, categories, types, singer),
    [musics, units, categories, types, singer]
  );
  const needs = useMemo(() => songCardNeeds(pool, pins, centerMode, centerSong), [pool, pins, centerMode, centerSong]);
  const outside = useMemo(() => {
    const inPool = new Set(pool.map((m) => m.id));
    return new Set(pins.filter((p) => !inPool.has(p.id)).map((p) => p.id));
  }, [pool, pins]);
  return { pool, needs, outside };
}
