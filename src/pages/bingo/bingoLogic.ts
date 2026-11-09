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
  /** 作者の安定した鍵（お題ビンゴの作者のお題に使う）。 */
  creatorArtistId?: number;
  /** ゲーム内の長さ（秒）。 */
  musicTime?: number;
  default: number;
  Unit: string;
  categories: string[];
  isNewlyWrittenMusic: boolean;
  /** コラボ・タイアップの名前（マスタの musicCollaborations。「劇場版プロジェクトセカイ」も含む）。ほかの曲には無い。 */
  collab?: string;
  jacketLink: string;
  /** ゲームに入った日時（ミリ秒）。サービス開始時からある曲は 2019 年の仮の値。 */
  publishedAt?: number;
  // ---- お題ビンゴ用（scripts/lib/musicBingoFields.mjs）。楽曲データに無い項目は「無い・偽」 ----
  /** すべての歌唱 ver.（アナザーボーカル込み）で歌うゲームのキャラの id（昇順）。 */
  singers?: readonly number[];
  /** 1 つの ver. で歌う人数の最大。 */
  maxSingers?: number;
  /** エイプリルフールの ver. がある。 */
  hasAprilFool?: boolean;
  /** 3DMV で踊る人数。 */
  dancerCount?: number;
  /** 作詞と作曲が別の人。 */
  lyricsByOther?: boolean;
  expertLevel?: number;
  masterLevel?: number;
  /** APPEND の譜面がある曲だけ。 */
  appendLevel?: number;
  /** MASTER のノーツ数。 */
  masterNotes?: number;
}

export type Cell = "FREE" | (BingoMusic & { cleared: boolean });

export type CenterMode = "free" | "random" | "specified";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CLEARED_OFFSET = 2048;

/** Fisher-Yates シャッフル（新しい配列を返す）。rng はテストで同じ並びを作るため。 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 歌う人で絞るときの判定。singer が null なら絞らない。
 * 歌う人の決まりはお題ビンゴの「ボーカル」と同じ楽曲データの singers（scripts/lib/musicBingoFields.mjs の indexVocals）。
 * singers の無い曲（インスト・ゲームの外の歌い手だけ）は、誰で絞っても当てはまらない。
 */
export function sungBy(m: BingoMusic, singer: number | null): boolean {
  return singer === null || (m.singers?.includes(singer) ?? false);
}

/** 生成用フィルタ: published相当はロード時に済ませる前提。ユニット/カテゴリ/曲種と歌う人（null なら絞らない）で絞る。 */
export function filterForGeneration(
  musics: readonly BingoMusic[],
  selectedUnits: ReadonlySet<string>,
  selectedCategories: ReadonlySet<string>,
  selectedTypes: ReadonlySet<boolean>,
  singer: number | null = null
): BingoMusic[] {
  return musics.filter(
    (m) =>
      selectedUnits.has(m.Unit) &&
      m.categories.some((c) => selectedCategories.has(c)) &&
      selectedTypes.has(m.isNewlyWrittenMusic) &&
      sungBy(m, singer)
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
  if (trimmed.length !== 50) throw new Error("コードの長さが不正です（50文字）。");
  for (let i = 0; i < 50; i += 2) {
    const hi = BASE64.indexOf(trimmed[i]);
    const lo = BASE64.indexOf(trimmed[i + 1]);
    if (hi < 0 || lo < 0) throw new Error("コードに不正な文字が含まれています。");
    const raw = hi * 64 + lo;
    if (raw === 0) {
      card.push("FREE");
      continue;
    }
    const cleared = raw >= CLEARED_OFFSET;
    const id = String(cleared ? raw - CLEARED_OFFSET : raw).padStart(3, "0");
    const music = byId.get(id);
    if (!music) throw new Error(`コードに未知の曲があります（${id}）。`);
    card.push({ ...music, cleared });
  }
  return card;
}

interface SongCardPlan {
  /** 中央の指定曲の id（中央が指定のときだけ）。 */
  centerId: string | null;
  /** 必ず置く入れたい曲（重複と中央の指定曲を除く）。 */
  placed: BingoMusic[];
  /** 残りのマスを埋めるのに選べる条件の曲（入れたい曲と中央の指定曲を除く）。 */
  usable: BingoMusic[];
  /** 条件の曲から選ぶマスの数。 */
  need: number;
}

/**
 * 曲名ビンゴのカードの割り振り。マスは中央が FREE か指定なら 24、ランダムなら 25。
 * 中央の指定曲を他マスから除外するのは centerMode==='specified' のときだけ。
 * legacy版は centerMode に関わらず、以前 specified で選んだ曲(既定 Tell Your World)を
 * 常に除外していた（porting doc も『潜在バグ的挙動・要確認』と評していた）。
 * free/random で古い指定曲を除外し続ける挙動は不自然なので、ここでは意図的に
 * specified のときだけ除外する（legacy からの意図的な改善）。
 */
function planSongCard(
  pool: readonly BingoMusic[],
  pins: readonly BingoMusic[],
  centerMode: CenterMode,
  centerSong: BingoMusic | null
): SongCardPlan {
  const slots = centerMode === "random" ? 25 : 24;
  const centerId = centerMode === "specified" && centerSong ? centerSong.id : null;
  const seen = new Set<string>(centerId ? [centerId] : []);
  const placed: BingoMusic[] = [];
  for (const p of pins) {
    if (seen.has(p.id) || placed.length === slots) continue;
    seen.add(p.id);
    placed.push(p);
  }
  return { centerId, placed, usable: pool.filter((m) => !seen.has(m.id)), need: slots - placed.length };
}

/** 作る前に足りるかを数える（細かい設定の曲数と「新しいカードを作る」を押せるか）。 */
export function songCardNeeds(
  pool: readonly BingoMusic[],
  pins: readonly BingoMusic[],
  centerMode: CenterMode,
  centerSong: BingoMusic | null
): { need: number; available: number } {
  const { need, usable } = planSongCard(pool, pins, centerMode, centerSong);
  return { need, available: usable.length };
}

/**
 * 曲名ビンゴのカード: 入れたい曲（pins）を必ず入れ、残りのマスを条件の曲（pool）からランダムに選ぶ。中央(index12)は centerMode 次第。
 * - 入れたい曲は条件の外でも入れる（持ち主が選んだ曲。お題ビンゴの入れたいお題が割合の範囲外でも入るのと同じ）
 * - 置き場所は入れたい曲も含めて全部まぜてから決める。中央がランダムなら、中央に入れたい曲が来てもよい
 * - 条件の曲が足りなければ、足りない数と選べる数を入れた文で例外（画面は作る前に songCardNeeds で止める）
 */
export function buildSongCard(
  pool: readonly BingoMusic[],
  pins: readonly BingoMusic[],
  centerMode: CenterMode,
  centerSong: BingoMusic | null,
  rng: () => number = Math.random
): Cell[] {
  if (centerMode === "specified" && !centerSong) {
    throw new Error("中央マスの曲を選択してください。");
  }
  const { placed, usable, need } = planSongCard(pool, pins, centerMode, centerSong);
  if (usable.length < need) {
    throw new Error(`条件に合う曲が足りません（あと ${need} 曲・選べる曲 ${usable.length} 曲）。`);
  }
  const chosen = shuffle([...placed, ...shuffle(usable, rng).slice(0, need)], rng);
  let idx = 0;
  return Array.from({ length: 25 }, (_, i): Cell => {
    if (i === 12 && centerMode === "free") return "FREE";
    if (i === 12 && centerMode === "specified" && centerSong) return { ...centerSong, cleared: false };
    return { ...chosen[idx++], cleared: false };
  });
}

/** ランダムにカードを構築（入れたい曲なし）。中央の扱いは buildSongCard と同じ。 */
export function buildRandomCard(
  pool: readonly BingoMusic[],
  centerMode: CenterMode,
  centerSong: BingoMusic | null
): Cell[] {
  return buildSongCard(pool, [], centerMode, centerSong);
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
