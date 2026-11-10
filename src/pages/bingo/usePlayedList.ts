/**
 * 遊んだ曲の一覧の状態と、この端末への保存（形と読む決まりは playedStorage.ts）。1 枚で遊ぶ・まとめて遊ぶで 1 つを使う。
 *
 * ★ 足す・消すは、直前に保存を読み直してから当てて書く。画面の一覧はほかのタブの追加を知らないことがあり、
 *   そのまま書くと後勝ちで消してしまう（計画のレビュー G-08）。localStorage が使えないときだけ画面の一覧に当てる。
 * ★ 保存を書くのは利用者が操作したときだけ（開いたときに書き返さない）。ほかのタブが保存を変えたら（storage の出来事）、
 *   読み直して画面に出すだけにする（書き返すと出来事が往復する。useMultiSet と同じ扱い）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PLAYED_STORAGE_KEY,
  type PlayedEntry,
  loadPlayed,
  parseSavedPlayed,
  savePlayed,
  withAppended,
  withCellsAdded,
  withoutEntry,
} from "./playedStorage";

export function usePlayedList() {
  const [list, setList] = useState<PlayedEntry[]>(() => loadPlayed() ?? []);
  // 保存が読めないとき（プライベートブラウズ など）に当てる、画面の一覧
  const latest = useRef(list);

  const update = useCallback((fn: (cur: readonly PlayedEntry[]) => PlayedEntry[]) => {
    const next = fn(loadPlayed() ?? latest.current);
    savePlayed(next);
    latest.current = next;
    setList(next);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage) return;
      // key が null は localStorage.clear()（全部消した）
      if (e.key !== null && e.key !== PLAYED_STORAGE_KEY) return;
      const next = parseSavedPlayed(e.key === null ? null : e.newValue);
      latest.current = next;
      setList(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** 足す（「埋める」「遊んだ曲に入れる」と決めたとき）。 */
  const add = useCallback((entry: PlayedEntry) => update((cur) => withAppended(cur, entry)), [update]);
  /** 1 件消す（id と時刻が同じもの）。 */
  const remove = useCallback((target: PlayedEntry) => update((cur) => withoutEntry(cur, target)), [update]);
  /** 全部消す。 */
  const clear = useCallback(() => update(() => []), [update]);
  /** 一覧から埋めたマスを、それぞれの曲の記録に足す。 */
  const credit = useCallback(
    (card: string, credits: readonly { entry: PlayedEntry; cells: readonly number[] }[]) =>
      update((cur) => credits.reduce((acc, c) => withCellsAdded(acc, c.entry, card, c.cells), [...cur])),
    [update]
  );
  /** まるごと置き換える（中断用の書き出しの読み込み）。 */
  const replace = useCallback((entries: readonly PlayedEntry[]) => update(() => [...entries]), [update]);

  return useMemo(() => ({ list, add, remove, clear, credit, replace }), [list, add, remove, clear, credit, replace]);
}

export type PlayedList = ReturnType<typeof usePlayedList>;
