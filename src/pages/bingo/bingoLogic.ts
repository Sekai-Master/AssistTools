/**
 * BINGOカード生成の純ロジック（シード符号化・フィルタ・カード構築）。
 * 現行 vanilla 版（legacy 4分割: globals/helpers/draw/events）の仕様を移植。
 * 仕様は docs/porting/04-bingo.md 参照。
 */

export interface BingoMusic {
  id: string;
  title: string;
  pronunciation?: string;
  artistName?: string;
  default: number;
  Unit: string;
  categories: string[];
  isNewlyWrittenMusic: boolean;
  jacketLink: string;
}

export type Cell = "FREE" | (BingoMusic & { cleared: boolean });

export type CenterMode = "free" | "random" | "specified";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CLEARED_OFFSET = 2048;

/** Fisher-Yates シャッフル（新しい配列を返す）。 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 生成用フィルタ: published相当はロード時に済ませる前提。ユニット/カテゴリ/曲種で絞る。 */
export function filterForGeneration(
  musics: readonly BingoMusic[],
  selectedUnits: ReadonlySet<string>,
  selectedCategories: ReadonlySet<string>,
  selectedTypes: ReadonlySet<boolean>
): BingoMusic[] {
  return musics.filter(
    (m) =>
      selectedUnits.has(m.Unit) &&
      m.categories.some((c) => selectedCategories.has(c)) &&
      selectedTypes.has(m.isNewlyWrittenMusic)
  );
}

/** 50文字のシード値にエンコード。FREE=id0、cleared時は+2048。 */
export function encodeSeed(card: readonly Cell[]): string {
  return card
    .map((cell) => {
      const id = cell === "FREE" ? 0 : parseInt(cell.id, 10) + (cell.cleared ? CLEARED_OFFSET : 0);
      return BASE64[Math.floor(id / 64)] + BASE64[id % 64];
    })
    .join("");
}

/** シード値からカードを復元。未知idは例外。 */
export function decodeSeed(seed: string, musics: readonly BingoMusic[]): Cell[] {
  const byId = new Map(musics.map((m) => [m.id, m]));
  const card: Cell[] = [];
  const trimmed = seed.trim();
  if (trimmed.length !== 50) throw new Error("シード値の長さが不正です（50文字）。");
  for (let i = 0; i < 50; i += 2) {
    const hi = BASE64.indexOf(trimmed[i]);
    const lo = BASE64.indexOf(trimmed[i + 1]);
    if (hi < 0 || lo < 0) throw new Error("シード値に不正な文字が含まれています。");
    const raw = hi * 64 + lo;
    if (raw === 0) {
      card.push("FREE");
      continue;
    }
    const cleared = raw >= CLEARED_OFFSET;
    const id = String(cleared ? raw - CLEARED_OFFSET : raw).padStart(3, "0");
    const music = byId.get(id);
    if (!music) throw new Error(`未知の楽曲id: ${id}`);
    card.push({ ...music, cleared });
  }
  return card;
}

/**
 * ランダムにカードを構築。中央(index12)は centerMode 次第。
 * 中央の指定曲(centerSong)がある場合、その曲は他マスから除外する（現行仕様）。
 */
export function buildRandomCard(
  pool: readonly BingoMusic[],
  centerMode: CenterMode,
  centerSong: BingoMusic | null
): Cell[] {
  const needed = centerMode === "random" ? 25 : 24;
  const excludeId = centerSong && centerMode === "specified" ? centerSong.id : null;
  const usable = excludeId ? pool.filter((m) => m.id !== excludeId) : pool;
  if (usable.length < needed) {
    throw new Error(`条件に合う曲が足りません（必要 ${needed} / 該当 ${usable.length}）。`);
  }
  const shuffled = shuffle(usable);
  const card: Cell[] = [];
  let idx = 0;
  for (let i = 0; i < 25; i++) {
    if (i === 12) {
      if (centerMode === "free") card.push("FREE");
      else if (centerMode === "specified" && centerSong)
        card.push({ ...centerSong, cleared: false });
      else card.push({ ...shuffled[idx++], cleared: false });
    } else {
      card.push({ ...shuffled[idx++], cleared: false });
    }
  }
  return card;
}

/** マス位置ラベル（A1〜E5）。列A-E、行1-5。 */
export function cellPositionLabel(index: number): string {
  const col = "ABCDE"[index % 5];
  const row = Math.floor(index / 5) + 1;
  return `${col}${row}`;
}

/** 枠線色候補（30色。生成ごとに1色抽選）。 */
export const BORDER_COLORS = [
  "#33ccbb", "#3aa0e0", "#2ec4b6", "#1ca9c9", "#0fb9b1",
  "#4455dd", "#5c6bc0", "#3f51b5", "#5e35b1", "#7e57c2",
  "#88dd44", "#9ccc65", "#7cb342", "#aed581", "#c0ca33",
  "#ee1166", "#ec407a", "#f06292", "#e91e63", "#ff5983",
  "#ff9900", "#ffa726", "#fb8c00", "#ffb74d", "#ff7043",
  "#884499", "#9575cd", "#ab47bc", "#ba68c8", "#8e24aa",
];

export function pickBorderColor(): string {
  return BORDER_COLORS[Math.floor(Math.random() * BORDER_COLORS.length)];
}
