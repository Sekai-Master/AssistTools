import type { SuggestMusic } from "./types";

/** 基礎点でフィルタした曲候補を「短い順（時間不明は末尾）・同値はid順」で返す。 */
export function candidatesForBase(
  musics: ReadonlyArray<SuggestMusic>,
  basePoint: number
): SuggestMusic[] {
  return musics
    .filter((m) => m && m.basePoint === basePoint)
    .slice()
    .sort((a, b) => {
      const at = a.musicTime > 0 ? a.musicTime : Infinity;
      const bt = b.musicTime > 0 ? b.musicTime : Infinity;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });
}

/** 採択曲があればそれ、なければ最短曲（候補ゼロなら undefined）。 */
export function resolveSong(
  candidates: ReadonlyArray<SuggestMusic>,
  songByBase: Record<number, string>,
  basePoint: number
): SuggestMusic | undefined {
  return candidates.find((m) => m.id === songByBase[basePoint]) ?? candidates[0];
}
