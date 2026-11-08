/**
 * お題ビンゴの純ロジック（実データからの割合・似たお題の組・カード構築・シード値）。お題の定義は odaiDefs.ts。
 *
 * 曲名ビンゴは 1 曲がカードに載る確率が 24/740 しかなく、50 曲遊んでもほぼビンゴにならない。
 * お題ビンゴはマスを「多くの曲に当てはまる条件」にする。お題は手書きの曲名リストを持たず、
 * 楽曲マスタから当てはまる割合を毎回計算して、DEEP_MIN_RATE〜MAX_RATE のものだけを使う。
 * 難易度（EASY〜MASTER）の数字は「半分の人が BINGO になる曲数」。
 */
import type { BingoMusic } from "./bingoLogic";
import { BINGO_LINES, hasBingo, withCleared } from "./bingoProgress";
import { type Odai, type OdaiKind, allOdaiDefs, fitsCell, odaiDefFromKey, toHiragana } from "./odaiDefs";

export type { Odai, OdaiKind, RowKey } from "./odaiDefs";
export { readingRow, textEm, titleKind } from "./odaiDefs";

export type OdaiCell = "FREE" | { odai: Odai; cleared: boolean };

/** 使うお題の割合の下限と上限。だいたい 1〜20%（データ更新の揺れを見て少し広げてある）。 */
export const MIN_RATE = 0.009;
export const MAX_RATE = 0.22;
/**
 * HARD・EXPERT・MASTER だけで使う下限（曲が 4 曲以上の作者）。MIN_RATE の候補だけでは、
 * 種類ごとの上限があるので「半分の人が BINGO になる曲数」が 29 曲より難しくならない（2026-11-09 実測）。
 */
export const DEEP_MIN_RATE = 0.005;

/**
 * 2 つのお題で当てはまる曲が、少ない方のこの割合以上重なれば、同じカードに並べない（|A∩B| / min(|A|,|B|)）。
 * 1 曲で両方が埋まるので似たカードに見え、マスを独立とみなす見積もり（estimateBingoChance）もずれる。
 */
export const OVERLAP_LIMIT = 0.6;

/**
 * 同じ種類が偏らないよう、1 枚に入れてよい数（似たカードを減らす。Nori 2026-11-09）。
 * 種類が少ないもの（歌唱・MV・追加・譜面など）は 2〜3、作者は 4。
 */
export const ODAI_KIND_CAPS: Record<OdaiKind, number> = {
  unit: 3,
  singer: 3,
  vocal: 2,
  origin: 3,
  row: 3,
  reading: 2,
  length: 2,
  title: 3,
  word: 2,
  mv: 2,
  added: 2,
  chart: 3,
  maker: 1,
  creator: 4,
};

export type OdaiLevel = "easy" | "normal" | "hard" | "expert" | "master";

export interface OdaiLevelDef {
  label: string;
  /** 全曲から一様に流れるとして、半分の人が BINGO になる曲数。難易度の数字。 */
  songs: number;
  /** この段で使うお題の割合の下限。 */
  minRate: number;
  /** 同じ種類を 1 枚に入れてよい数。 */
  caps: Record<OdaiKind, number>;
}

/**
 * 1 曲 4 分として、EASY 約30分・NORMAL 約1時間20分・HARD 約2時間・EXPERT 約3時間・MASTER 約5時間。
 * 難しい側は思い切って長くする（Nori、2026-11-09）。NORMAL がこれまでのカード（20 曲で半分）。
 */
const withCreators = (creator: number): Record<OdaiKind, number> => ({ ...ODAI_KIND_CAPS, creator });
export const ODAI_LEVELS: Record<OdaiLevel, OdaiLevelDef> = {
  easy: { label: "EASY", songs: 8, minRate: MIN_RATE, caps: ODAI_KIND_CAPS },
  normal: { label: "NORMAL", songs: 20, minRate: MIN_RATE, caps: ODAI_KIND_CAPS },
  hard: { label: "HARD", songs: 30, minRate: DEEP_MIN_RATE, caps: withCreators(6) },
  expert: { label: "EXPERT", songs: 45, minRate: DEEP_MIN_RATE, caps: withCreators(8) },
  master: { label: "MASTER", songs: 75, minRate: DEEP_MIN_RATE, caps: withCreators(12) },
};
export const ODAI_LEVEL_KEYS: readonly OdaiLevel[] = ["easy", "normal", "hard", "expert", "master"];
export const DEFAULT_ODAI_LEVEL: OdaiLevel = "normal";

/**
 * 段の曲数で見積もり（estimateBingoChance）がこの値に近づくまで、マスを入れ替える。
 * 見積もりはマスどうしを独立とみなすので実測より少し易しく出る。0.56 を狙うと、実測で
 * 「段の曲数で半分の人が BINGO」になる（odaiLogic.test.ts）。
 */
const TARGET_ESTIMATE = 0.56;
const TARGET_TOLERANCE = 0.01;
/** 目安の曲数を数えるときの線。作ったカードは段の曲数でこの線を越える。 */
const HALF_ESTIMATE = TARGET_ESTIMATE - TARGET_TOLERANCE;
const MAX_STEPS = 4000;
/** 種類ごとの上限と重なりの決まりで 24 マスを埋められなかったとき、並びを変えてやり直す回数。 */
const MAX_PICK_TRIES = 20;
/**
 * MAX_STEPS で目標に届かなかったとき、選び直してやり直す回数（いちばん近いカードを使う）。
 * テーマの下限は、選んだ顔ぶれによっては 1 つずつの入れ替えでは届かない（2026-11-09 実測、歌う人の EXPERT で 1800 枚に 1 枚）。
 */
const MAX_BUILD_TRIES = 5;
/** テーマの下限に足りないマス 1 つの重み。合わせ込みの外れ（最大でも 1 程度）より重くする。 */
const THEME_SHORT_WEIGHT = 2;

// ---- テーマ ----

export type OdaiTheme = "any" | "singer" | "title" | "chart";

export interface OdaiThemeDef {
  label: string;
  /** テーマの種類。 */
  kinds: readonly OdaiKind[];
  /** 段ごとの、テーマの種類から入れるマスの下限（24 マスのうち）。 */
  floor: Record<OdaiLevel, number>;
}

const levelsOf = (n: number): Record<OdaiLevel, number> => ({ easy: n, normal: n, hard: n, expert: n, master: n });

/**
 * テーマつきのカード（Nori 2026-11-09、案 27。設計はオーケストレーター一任）。テーマの種類のマスを 24 のうち
 * 12 以上にする。ただし種類ごとの上限と並べない組はそのまま守るので、届かない組み合わせは下限を下げてある:
 * - 歌う人: 同じユニットは 1 枚に 1 つまでなので、ユニットの色の 6 つ＋その他・劇場版・コラボ・6人以上・エイプリルフールの 11 が最大
 * - 譜面・MV: 譜面 3・MV 2・追加 2・作り手 1 の上限で 8 が最大
 */
export const ODAI_THEMES: Record<OdaiTheme, OdaiThemeDef> = {
  any: { label: "おまかせ", kinds: [], floor: levelsOf(0) },
  singer: { label: "歌う人", kinds: ["singer", "vocal", "unit", "origin"], floor: levelsOf(9) },
  title: { label: "曲名・読み", kinds: ["title", "word", "row", "reading", "length"], floor: levelsOf(12) },
  chart: { label: "譜面・MV", kinds: ["chart", "mv", "added", "maker"], floor: levelsOf(8) },
};
export const ODAI_THEME_KEYS: readonly OdaiTheme[] = ["any", "singer", "title", "chart"];
export const DEFAULT_ODAI_THEME: OdaiTheme = "any";

/**
 * テーマの種類から入れられるマスの数の上限（並べない組は数えない見積もり）。種類ごとに min(上限, 候補の数) を足し、
 * ユニットの色の印を持つお題は色の数で頭打ちにする（同じユニットは 1 枚に 1 つまで）。
 */
function reachableThemed(pool: readonly Odai[], caps: Record<OdaiKind, number>, kinds: readonly OdaiKind[]): number {
  const themed = pool.filter((o) => kinds.includes(o.kind));
  const countOf = (list: readonly Odai[], kind: OdaiKind) => list.filter((o) => o.kind === kind).length;
  const byCaps = kinds.reduce((acc, k) => acc + Math.min(caps[k], countOf(themed, k)), 0);
  const plain = themed.filter((o) => o.unit === undefined);
  const colors = new Set(themed.map((o) => o.unit).filter((u) => u !== undefined)).size;
  const byColors = colors + kinds.reduce((acc, k) => acc + Math.min(caps[k], countOf(plain, k)), 0);
  return Math.min(byCaps, byColors);
}

/**
 * このテーマ・段で守るテーマのマスの下限。ODAI_THEMES の floor を、いまの候補で入れられる数で頭打ちにする。
 * ★ 下限には余裕が無い（曲名・読みは長さの 2 つ、譜面・MV は作り手の 1 つを必ず使う）。曲が増えて候補が割合の範囲から
 *   外れても、届かない下限を課さない（毎日の楽曲データの更新のテストも止めない）。
 */
export function odaiThemeFloor(candidates: readonly Odai[], level: OdaiLevel, theme: OdaiTheme): number {
  const { minRate, caps } = ODAI_LEVELS[level];
  const { kinds, floor } = ODAI_THEMES[theme];
  if (floor[level] === 0) return 0;
  return Math.min(floor[level], reachableThemed(candidates.filter((o) => o.rate >= minRate), caps, kinds));
}

const CELLS = 25;
const CENTER = 12;

export { BINGO_LINES, hasBingo };

/** 決定的な乱数（mulberry32）。テストとシミュレーションで使う。 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 候補（割合と、似たお題の組） ----

function popcount(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** 当てはまる曲のビット集合（曲の並びの番号）。 */
function songBits(test: (m: BingoMusic) => boolean, musics: readonly BingoMusic[]): Uint32Array {
  const bits = new Uint32Array(Math.ceil(musics.length / 32));
  musics.forEach((m, i) => {
    if (test(m)) bits[i >>> 5] |= 1 << (i & 31);
  });
  return bits;
}

function countBits(bits: Uint32Array): number {
  let n = 0;
  for (const w of bits) n += popcount(w);
  return n;
}

function countShared(a: Uint32Array, b: Uint32Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) n += popcount(a[i] & b[i]);
  return n;
}

/**
 * 実データから使うお題の候補を作る（割合が DEEP_MIN_RATE〜MAX_RATE で、1 マスに収まるもの）。段ごとの下限は buildOdaiCard で絞る。
 * 候補の組ごとに、同じカードに並べないか（clashes）もここで 1 回だけ数える:
 * - 当てはまる曲の重なりが overlapLimit 以上（ユニットとそのメンバー・Lv.32 以上と Lv.33 以上 など）
 * - 同じユニットの色の印を持つ（ユニット・そのメンバーの歌う人・その書き下ろしは 1 枚に 1 つまで。Nori 2026-11-09）
 */
export function buildOdaiCandidates(musics: readonly BingoMusic[], overlapLimit = OVERLAP_LIMIT): Odai[] {
  const scored = allOdaiDefs(musics)
    .filter(fitsCell)
    .map((def) => {
      const bits = songBits(def.test, musics);
      const n = countBits(bits);
      return { def, bits, n, rate: musics.length > 0 ? n / musics.length : 0 };
    })
    .filter((s) => s.rate >= DEEP_MIN_RATE && s.rate <= MAX_RATE);
  const clashSets = scored.map(() => new Set<string>());
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      const a = scored[i];
      const b = scored[j];
      const sameUnit = a.def.unit !== undefined && a.def.unit === b.def.unit;
      if (sameUnit || countShared(a.bits, b.bits) / Math.min(a.n, b.n) >= overlapLimit) {
        clashSets[i].add(b.def.key);
        clashSets[j].add(a.def.key);
      }
    }
  }
  return scored.map((s, i) => ({ ...s.def, rate: s.rate, clashes: clashSets[i] }));
}

/** 同じカードに並べない組か。 */
export function clashes(a: Odai, b: Odai): boolean {
  return a.clashes?.has(b.key) ?? false;
}

// ---- カード ----

/** 中央を除く 24 マスの並び → 25 マスの位置。 */
function toPositions<T>(picked: readonly T[]): (T | null)[] {
  return [...picked.slice(0, CENTER), null, ...picked.slice(CENTER)];
}

/**
 * songs 曲流したときにビンゴになる確率の見積もり。各マスが埋まる確率は 1-(1-割合)^songs、
 * 列どうしは独立とみなす（実際は 1 曲で複数のマスが埋まるので、実測とは少しずれる）。
 */
export function estimateBingoChance(cells: readonly (Odai | null)[], songs: number): number {
  const q = cells.map((o) => (o ? 1 - Math.pow(1 - o.rate, songs) : 1));
  let noLine = 1;
  for (const line of BINGO_LINES) noLine *= 1 - line.reduce((acc, i) => acc * q[i], 1);
  return 1 - noLine;
}

/**
 * 種類ごとの上限と並べない組を守って、ランダムに 24 個選ぶ。
 * テーマがあれば、テーマの種類から先に floor 個まで入れてから、残りを全部の候補から埋める。
 */
function pickWithCaps(
  candidates: readonly Odai[],
  caps: Record<OdaiKind, number>,
  rng: () => number,
  inTheme: (o: Odai) => boolean = () => false,
  floor = 0
): Odai[] | null {
  const count: Partial<Record<OdaiKind, number>> = {};
  const picked: Odai[] = [];
  const tryAdd = (o: Odai) => {
    const n = count[o.kind] ?? 0;
    if (n >= caps[o.kind] || picked.includes(o) || picked.some((p) => clashes(p, o))) return;
    count[o.kind] = n + 1;
    picked.push(o);
  };
  const order = shuffleWith(candidates, rng);
  for (const o of order) {
    if (picked.length >= floor) break;
    if (inTheme(o)) tryAdd(o);
  }
  for (const o of order) {
    if (picked.length === CELLS - 1) break;
    tryAdd(o);
  }
  return picked.length === CELLS - 1 ? picked : null;
}

/** 2 つのマスの位置を入れ替える（並びで、そろいやすい列が変わる）。 */
function swapTwo(cells: readonly (Odai | null)[], rng: () => number): (Odai | null)[] | null {
  const a = Math.floor(rng() * CELLS);
  const b = Math.floor(rng() * CELLS);
  if (a === CENTER || b === CENTER || a === b) return null;
  const next = [...cells];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** 1 マスを、まだ使っていない候補に替える（種類ごとの上限と、並べない組を守る）。 */
function replaceOne(
  cells: readonly (Odai | null)[],
  pool: readonly Odai[],
  caps: Record<OdaiKind, number>,
  rng: () => number
): (Odai | null)[] | null {
  const a = Math.floor(rng() * CELLS);
  const out = cells[a];
  const cand = pool[Math.floor(rng() * pool.length)];
  if (!out || cells.some((o) => o?.key === cand.key)) return null;
  const sameKind = cells.filter((o) => o?.kind === cand.kind).length - (out.kind === cand.kind ? 1 : 0);
  if (sameKind >= caps[cand.kind]) return null;
  if (cells.some((o, i) => i !== a && o !== null && clashes(o, cand))) return null;
  return cells.map((o, i) => (i === a ? cand : o));
}

/**
 * ランダムにお題カードを作る。中央は FREE。
 * ランダムな並びから始め、段の曲数での見積もりが目標の幅に近づく入れ替えだけを受け入れる。
 * 1 曲少ないときは線に届かないことも条件にする（カードの枠に出す目安が段の曲数とずれないように）。
 * テーマ（theme）があれば、テーマの種類のマスが下限（ODAI_THEMES の floor）を割らないことも条件にする。
 */
export function buildOdaiCard(
  candidates: readonly Odai[],
  rng: () => number = Math.random,
  level: OdaiLevel = DEFAULT_ODAI_LEVEL,
  theme: OdaiTheme = DEFAULT_ODAI_THEME
): OdaiCell[] {
  const { songs, minRate, caps } = ODAI_LEVELS[level];
  const pool = candidates.filter((o) => o.rate >= minRate);
  if (pool.length < CELLS - 1) {
    throw new Error(`お題が足りません（必要 ${CELLS - 1} / 候補 ${pool.length}）。`);
  }
  const { kinds } = ODAI_THEMES[theme];
  const floor = odaiThemeFloor(candidates, level, theme);
  const inTheme = (o: Odai) => kinds.includes(o.kind);
  // 外れの量: 見積もりが目標から離れた分と、1 曲少なくても線を越えてしまう分（目安が段の曲数より少なく出る）。
  // テーマの下限に足りないマスは重く数える（合わせ込みと引き換えに、テーマのマスを手放さない）
  const missOf = (c: readonly (Odai | null)[]) =>
    Math.max(0, Math.abs(estimateBingoChance(c, songs) - TARGET_ESTIMATE) - TARGET_TOLERANCE) +
    Math.max(0, estimateBingoChance(c, songs - 1) - HALF_ESTIMATE + 0.001) +
    (floor > 0 ? THEME_SHORT_WEIGHT * Math.max(0, floor - c.filter((o) => o !== null && inTheme(o)).length) : 0);

  let best: { cells: (Odai | null)[]; miss: number } | null = null;
  for (let attempt = 0; attempt < MAX_BUILD_TRIES && (best === null || best.miss > 0); attempt++) {
    let picked: Odai[] | null = null;
    for (let t = 0; t < MAX_PICK_TRIES && !picked; t++) picked = pickWithCaps(pool, caps, rng, inTheme, floor);
    if (!picked) throw new Error("お題の組み合わせを作れませんでした。");
    let cells = toPositions(picked);
    let miss = missOf(cells);
    for (let step = 0; step < MAX_STEPS && miss > 0; step++) {
      const next = rng() < 0.5 ? swapTwo(cells, rng) : replaceOne(cells, pool, caps, rng);
      if (!next) continue;
      const m = missOf(next);
      if (m < miss) {
        cells = next;
        miss = m;
      }
    }
    if (best === null || miss < best.miss) best = { cells, miss };
  }
  return best!.cells.map((o) => (o ? { odai: o, cleared: false } : "FREE"));
}

/** このカードで半分の人が BINGO になる曲数の目安（見積もりが線を越える最小の曲数）。埋めたマスは見ない。 */
export function odaiSongsToHalf(card: readonly OdaiCell[]): number {
  const cells = card.map((c) => (c === "FREE" ? null : c.odai));
  for (let n = 1; n < 400; n++) {
    if (estimateBingoChance(cells, n) >= HALF_ESTIMATE) return n;
  }
  return 400;
}

/** 目安の曲数にいちばん近い段（リンクや前の版のカードにも段を付けるため）。並んだら易しい方。 */
export function odaiLevelOf(card: readonly OdaiCell[]): OdaiLevel {
  const n = odaiSongsToHalf(card);
  return ODAI_LEVEL_KEYS.reduce((best, k) =>
    Math.abs(ODAI_LEVELS[k].songs - n) < Math.abs(ODAI_LEVELS[best].songs - n) ? k : best
  );
}

// ---- シード値 ----

/** お題ビンゴのシード値の目印。曲名ビンゴのシード（base64 の 50 文字）には ":" が無いので区別できる。 */
export const ODAI_SEED_PREFIX = "OD1:";
const FREE_TOKEN = "F";
const CLEARED_MARK = "*";

/** 目印の大文字・小文字は問わない（手で打ち直したシードも読む）。 */
function hasOdaiPrefix(seed: string): boolean {
  return seed.slice(0, ODAI_SEED_PREFIX.length).toUpperCase() === ODAI_SEED_PREFIX;
}

export function isOdaiSeed(seed: string): boolean {
  return hasOdaiPrefix(seed.trim());
}

/** 例: OD1:u1.ra*.c4.….F.…（マスごとにお題の鍵、埋めたマスは末尾に *）。 */
export function encodeOdaiSeed(card: readonly OdaiCell[]): string {
  return (
    ODAI_SEED_PREFIX +
    card.map((c) => (c === "FREE" ? FREE_TOKEN : c.odai.key + (c.cleared ? CLEARED_MARK : ""))).join(".")
  );
}

/** 鍵からお題を作る。割合の範囲から外れたお題でも、定義かデータにあれば戻す。 */
function odaiFromKey(key: string, musics: readonly BingoMusic[]): Odai {
  const def = odaiDefFromKey(key, musics);
  const n = musics.reduce((acc, m) => acc + (def.test(m) ? 1 : 0), 0);
  return { ...def, rate: musics.length > 0 ? n / musics.length : 0 };
}

export function decodeOdaiSeed(seed: string, musics: readonly BingoMusic[]): OdaiCell[] {
  const trimmed = seed.trim();
  if (!hasOdaiPrefix(trimmed)) throw new Error("お題ビンゴのコードではありません。");
  const tokens = trimmed.slice(ODAI_SEED_PREFIX.length).split(".");
  if (tokens.length !== CELLS) throw new Error(`コードのマスの数が不正です（${CELLS}マス）。`);
  const seen = new Set<string>();
  return tokens.map((token, i) => {
    if (token === FREE_TOKEN || i === CENTER) {
      if (token !== FREE_TOKEN || i !== CENTER) throw new Error("FREE は中央のマスだけです。");
      return "FREE";
    }
    const cleared = token.endsWith(CLEARED_MARK);
    const key = cleared ? token.slice(0, -CLEARED_MARK.length) : token;
    if (seen.has(key)) throw new Error(`コードのお題が重複しています（${key}）。`);
    seen.add(key);
    return { odai: odaiFromKey(key, musics), cleared };
  });
}

// ---- 遊ぶときの操作 ----

/** 指定したマスを埋める／戻す（新しいカードを返す）。FREE は変えない。 */
export function setOdaiCleared(card: readonly OdaiCell[], index: number, cleared: boolean): OdaiCell[] {
  return withCleared(card, index, cleared);
}

/**
 * お題に当てはまる曲の一覧（読み順）。判定はお題の test そのものを使う。
 * query があれば曲名・読みで絞る（大文字小文字・カタカナとひらがなを問わない）。
 */
export function listOdaiSongs(odai: Odai, musics: readonly BingoMusic[], query = ""): BingoMusic[] {
  const q = query.trim().toLowerCase();
  const qKana = toHiragana(q);
  return musics
    .filter((m) => odai.test(m))
    .filter(
      (m) =>
        !q ||
        m.title.toLowerCase().includes(q) ||
        toHiragana(m.title.toLowerCase()).includes(qKana) ||
        (m.pronunciation !== undefined && toHiragana(m.pronunciation).includes(qKana))
    )
    .sort((a, b) => (a.pronunciation ?? a.title).localeCompare(b.pronunciation ?? b.title, "ja"));
}

export interface OdaiSongGroup {
  label: string;
  /** 絞り込む前の、この区切りの曲数（見出しに出す。絞り込んでも並びと数は動かない）。 */
  total: number;
  /** 絞り込んだ後の曲（読み順）。 */
  songs: BingoMusic[];
}

/**
 * 区切りを持つお題（コラボ）の、区切りごとの曲。曲の多い区切りから、同じ数なら名前の順。
 * query で絞り込み、当てはまる曲が無くなった区切りは出さない。区切りを持たないお題は空。
 */
export function groupOdaiSongs(odai: Odai, musics: readonly BingoMusic[], query = ""): OdaiSongGroup[] {
  const groupOf = odai.group;
  if (!groupOf) return [];
  const label = (m: BingoMusic) => groupOf(m) ?? "その他";
  const totals = new Map<string, number>();
  for (const m of listOdaiSongs(odai, musics)) totals.set(label(m), (totals.get(label(m)) ?? 0) + 1);
  const shown = listOdaiSongs(odai, musics, query);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([name, total]) => ({ label: name, total, songs: shown.filter((m) => label(m) === name) }))
    .filter((g) => g.songs.length > 0);
}
