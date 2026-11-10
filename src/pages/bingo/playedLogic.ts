/**
 * 遊んだ曲の一覧とカードの突き合わせ（画面なし）。
 * - この一覧でカードを埋める: カードを 1 枚選び、使う曲は「そのカードを足した時刻より後、かつ休止の区間の外」に限る
 *   （計画のレビュー G-03。前の回の曲・休止中に遊んだ曲・途中で足したカードの前の曲で埋めないように）
 * - 一覧から 1 曲消す: その曲で埋めたマスのうち、戻してよいマスを出す（持ち主の決定 2 の C）
 */
import type { BingoMusic } from "./bingoLogic";
import { cellMatches } from "./bingoPlayed";
import type { CardKind, KindedCard } from "./bingoShare";
import type { PauseRange } from "./multiStorage";
import type { PlayedEntry } from "./playedStorage";

/** 一覧から埋める・戻すの相手になるカード 1 枚。 */
export interface PlayedSlot {
  /** 記録に残すカードの名前（まとめて遊ぶはカードの id、1 枚で遊ぶは singleRef）。 */
  ref: string;
  /** 画面に出す名前。 */
  name: string;
  kc: KindedCard;
  /** 足した（開いた）時刻。0 は分からない（前の版の保存）で、時刻では絞らない。 */
  addedAt: number;
  /** 休止の区間（1 枚で遊ぶは空）。 */
  paused: readonly PauseRange[];
  /** いま休止しているか（一覧から埋める相手にしない）。 */
  pausedNow: boolean;
}

/** 1 枚で遊ぶのカードの記録の名前。種類ごとに 1 枚なので、足した時刻で別のカードと見分ける。 */
export const singleRef = (kind: CardKind, addedAt: number) => `${kind}@${addedAt}`;

/** 休止の区間 [始まり, 終わり) に入るか。今の休止は終わりが null。 */
const inPause = (paused: readonly PauseRange[], at: number) =>
  paused.some(([start, end]) => at >= start && (end === null || at < end));

/** 一覧のその時刻の曲を、このカードに使えるか（足した時刻より後で、休止の区間の外）。 */
export function usableAt(slot: Pick<PlayedSlot, "addedAt" | "paused">, at: number): boolean {
  return at > slot.addedAt && !inPause(slot.paused, at);
}

export interface ListFill {
  /** 使える曲の数（足した時刻より後で、休止の区間の外。カードに当てはまらない曲も数える）。 */
  usable: number;
  /** 足した時刻より後だが、休止中に遊んだので使わない曲の数。 */
  pausedOut: number;
  /** 埋めるマス（まだ埋めていない、当てはまるマス。昇順）。 */
  cells: number[];
  /** どの曲で埋めたか（一覧から 1 曲消すときに戻せるよう、その曲の記録に足す）。古い曲に付ける。 */
  credits: { entry: PlayedEntry; cells: number[] }[];
}

/** この一覧でカードを埋めると、どのマスが埋まるか。楽曲データに無い曲は数えない。 */
export function planListFill(slot: PlayedSlot, entries: readonly PlayedEntry[], musicById: ReadonlyMap<string, BingoMusic>): ListFill {
  const after = entries.flatMap((entry) => {
    const music = musicById.get(entry.id);
    return music && entry.at > slot.addedAt ? [{ entry, music }] : [];
  });
  const usable = after.filter((x) => !inPause(slot.paused, x.entry.at));
  const byEntry = new Map<PlayedEntry, number[]>();
  slot.kc.card.forEach((cell, i) => {
    if (cell === "FREE" || cell.cleared) return;
    const hit = usable.find((x) => cellMatches(cell, x.music));
    if (hit) byEntry.set(hit.entry, [...(byEntry.get(hit.entry) ?? []), i]);
  });
  const credits = usable.flatMap(({ entry }) => {
    const cells = byEntry.get(entry);
    return cells ? [{ entry, cells }] : [];
  });
  return {
    usable: usable.length,
    pausedOut: after.length - usable.length,
    cells: credits.flatMap((c) => c.cells).sort((a, b) => a - b),
    credits,
  };
}

export interface RevertGroup {
  slot: PlayedSlot;
  /** 戻すマス（昇順）。 */
  cells: number[];
  /** その曲で埋めたが、一覧のほかの曲（同じ曲の 2 回目など）でも当てはまるので残すマスの数。 */
  kept: number;
}

/**
 * 一覧から target を消すとき、戻してよいマスをカードごとに出す。
 * 戻すのは、その曲で埋めた記録があり、いまも埋まっていて、いまも当てはまり（差し替えで別のお題・曲になっていない）、
 * 一覧のほかの曲でそのカードに使えるもの（usableAt）がどれも当てはまらないマスだけ。
 * ★ ほかの曲でも当てはまるマスを戻すと、一覧と盤面が食い違う（同じ曲を 2 回入れた片方を消したとき など）。
 */
export function planRevert(
  target: PlayedEntry,
  entries: readonly PlayedEntry[],
  slots: readonly PlayedSlot[],
  musicById: ReadonlyMap<string, BingoMusic>
): RevertGroup[] {
  const music = musicById.get(target.id);
  if (!music) return [];
  const others = entries.filter((x) => x !== target && !(x.id === target.id && x.at === target.at));
  return (target.cells ?? []).flatMap((group) => {
    const slot = slots.find((s) => s.ref === group.card);
    if (!slot) return [];
    let kept = 0;
    const cells = group.filled.filter((i) => {
      const cell = slot.kc.card[i];
      if (!cell || cell === "FREE" || !cell.cleared || !cellMatches(cell, music)) return false;
      const covered = others.some((o) => {
        const m = musicById.get(o.id);
        return m !== undefined && usableAt(slot, o.at) && cellMatches(cell, m);
      });
      if (covered) kept++;
      return !covered;
    });
    return cells.length > 0 || kept > 0 ? [{ slot, cells, kept }] : [];
  });
}

/** 指定したマスだけを埋める／戻す（新しいカードを返す）。FREE は変えない。 */
export function withMarks(kc: KindedCard, indices: readonly number[], cleared: boolean): KindedCard {
  const set = new Set(indices);
  const mark = <T extends { cleared: boolean }>(c: T | "FREE", i: number): T | "FREE" =>
    c !== "FREE" && set.has(i) ? { ...c, cleared } : c;
  return kc.kind === "odai" ? { kind: "odai", card: kc.card.map(mark) } : { kind: "song", card: kc.card.map(mark) };
}
