/**
 * 遊んだ曲の一覧と、カード（1 枚で遊ぶの 2 枚・まとめて遊ぶの 5 枚まで）のつなぎ。
 * 一覧から埋める相手・1 曲消すときに戻すマスを探すカード・プレイ開始の行・記録の入れ方をまとめる。
 *
 * ★ 1 曲消すときに戻すマスは、記録を入れたときの画面（1 枚で遊ぶ・まとめて遊ぶ）によらず、記録にあるカードを全部から探す。
 *   一覧は 1 つで、まとめて遊ぶで入れた曲を 1 枚で遊ぶの画面から消すこともあるため。
 */
import { useMemo, useState } from "react";
import type { BingoMusic } from "./bingoLogic";
import { type CardKind, type KindedCard, KIND_LABEL } from "./bingoShare";
import { isPaused } from "./multiStorage";
import { type ListFill, type PlayedSlot, type RevertGroup, singleRef, withMarks } from "./playedLogic";
import type { PlayedEntry } from "./playedStorage";
import type { PlayedList } from "./usePlayedList";
import type { useSingleCards } from "./useSingleCards";
import { type MultiSet, entryName } from "./useMultiSet";

const KINDS: readonly CardKind[] = ["odai", "song"];

export function usePlayedSlots(
  musics: readonly BingoMusic[],
  single: ReturnType<typeof useSingleCards>,
  multi: MultiSet,
  played: PlayedList
) {
  // この画面を開いた時刻。これより後に付いたプレイ開始だけ「プレイ開始！」と太字にする
  const [mountedAt] = useState(() => Date.now());
  const musicById = useMemo(() => new Map(musics.map((m) => [m.id, m])), [musics]);
  const { odaiCard, songCard, meta, kind, viewing, updateOwn } = single;

  const singleSlots = useMemo<PlayedSlot[]>(
    () =>
      KINDS.flatMap((k) => {
        const kc: KindedCard | null =
          k === "odai" ? (odaiCard ? { kind: k, card: odaiCard } : null) : songCard ? { kind: k, card: songCard } : null;
        if (!kc) return [];
        const addedAt = meta[k]?.addedAt ?? 0;
        return [{ ref: singleRef(k, addedAt), name: KIND_LABEL[k], kc, addedAt, paused: [], pausedNow: false }];
      }),
    [odaiCard, songCard, meta]
  );
  const multiSlots = useMemo<PlayedSlot[]>(
    () =>
      multi.entries.flatMap((e, i) =>
        e.card ? [{ ref: e.id, name: entryName(e, i), kc: e.card, addedAt: e.addedAt, paused: e.paused, pausedNow: isPaused(e) }] : []
      ),
    [multi.entries]
  );
  const all = useMemo(() => [...singleSlots, ...multiSlots], [singleSlots, multiSlots]);

  /** そのカードに変え方を当てる（1 枚で遊ぶは自分のカード、まとめて遊ぶは id のカード。どちらも当てる時点のカードに当てる）。 */
  const applyToSlot = (ref: string, fn: (kc: KindedCard) => KindedCard | null) => {
    const k = singleSlots.find((s) => s.ref === ref)?.kc.kind;
    if (k) updateOwn(k, fn);
    else multi.applyToCard(ref, fn);
  };

  /** 1 枚で遊ぶで「埋める」「遊んだ曲に入れる」と決めた曲を一覧に入れる。filled はその曲で埋めたマス。 */
  const recordSingle = (music: BingoMusic, filled: number[]) => {
    const ref = singleSlots.find((s) => s.kc.kind === kind)?.ref;
    played.add({ id: music.id, at: Date.now(), ...(ref && filled.length > 0 ? { cells: [{ card: ref, filled }] } : {}) });
  };

  /** 1 曲消す。groups の戻すマスを戻してから、一覧から消す。 */
  const remove = (entry: PlayedEntry, groups: readonly RevertGroup[]) => {
    for (const g of groups) applyToSlot(g.slot.ref, (kc) => withMarks(kc, g.cells, false));
    played.remove(entry);
  };

  /**
   * この一覧でカードを埋める。埋めたマスは、どの曲で埋めたかを記録に足す（あとで 1 曲消すときに戻せるように）。
   * 埋めなかったときは false: 選ぶ画面を開いたあとに、ほかのタブでそのカードが休止された（レビュー M1。
   * 休止中のカードには遊んだ曲を反映しない。記録にも足さない）。
   */
  const fill = (slot: PlayedSlot, plan: ListFill): boolean => {
    const k = singleSlots.find((s) => s.ref === slot.ref)?.kc.kind;
    if (k) {
      updateOwn(k, (kc) => withMarks(kc, plan.cells, true));
    } else {
      if (multi.pausedNow(slot.ref)) return false;
      multi.applyToCard(slot.ref, (kc) => withMarks(kc, plan.cells, true), true);
    }
    played.credit(slot.ref, plan.credits);
    return true;
  };

  const starts = multi.open
    ? multi.entries.flatMap((e, i) => (e.startedAt ? [{ name: entryName(e, i), at: e.startedAt }] : []))
    : KINDS.flatMap((k) => {
        const at = meta[k]?.startedAt;
        return at !== undefined && (k === "odai" ? odaiCard : songCard) ? [{ name: KIND_LABEL[k], at }] : [];
      });

  return {
    mountedAt,
    musicById,
    /** 戻すマスを探すカード（全部）。 */
    all,
    /** 一覧から埋める相手（いまの画面のカード）。見るだけの間は無し。 */
    targets: multi.open ? multiSlots : viewing ? [] : singleSlots.filter((s) => s.kc.kind === kind),
    noTargetNote: multi.open
      ? "埋められるカードがありません（読めないカードは使いません）"
      : viewing
        ? "見るだけで開いているカードには使えません。自分のカードに戻ってから使ってください"
        : "カードがありません。先にカードを作ってください",
    starts,
    /** 一覧のボタンに出す曲数（楽曲データにある曲だけ。一覧の画面と同じ数え方）。 */
    count: played.list.filter((e) => musicById.has(e.id)).length,
    recordSingle,
    remove,
    fill,
  };
}
