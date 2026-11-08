/**
 * お題ビンゴの純ロジック（お題の定義・実データからの割合・カード構築・シード値）。
 *
 * 曲名ビンゴは 1 曲がカードに載る確率が 24/740 しかなく、50 曲遊んでもほぼビンゴにならない。
 * お題ビンゴはマスを「多くの曲に当てはまる条件」にする。お題は手書きの曲名リストを持たず、
 * 楽曲マスタから当てはまる割合を毎回計算して、DEEP_MIN_RATE〜MAX_RATE のものだけを使う。
 * 難易度（EASY〜MASTER）の数字は「半分の人が BINGO になる曲数」。
 */
import type { UnitKey } from "../../lib/units";
import type { BingoMusic } from "./bingoLogic";
import { UNIT_OPTIONS } from "./bingoConstants";
import { BINGO_LINES, hasBingo, withCleared } from "./bingoProgress";

export type OdaiKind = "unit" | "row" | "length" | "title" | "creator";

export interface Odai {
  /** シード値に入れる安定した鍵（ユニットのコード・行・creatorArtistId など）。 */
  key: string;
  kind: OdaiKind;
  /** マスの上に小さく出す種類の名前。 */
  caption: string;
  /** マスの主役の文言。 */
  text: string;
  /** 折り返してよい区切り。区切りの中では折らない（スマホの 1 マスで語の途中で折れないように）。 */
  chunks: string[];
  /** ユニットのお題だけ。色の印に使う。 */
  unit?: UnitKey;
  /** 全曲のうち当てはまる曲の割合（0〜1）。 */
  rate: number;
  test: (m: BingoMusic) => boolean;
}

export type OdaiCell = "FREE" | { odai: Odai; cleared: boolean };

/** 使うお題の割合の下限と上限。だいたい 1〜20%（データ更新の揺れを見て少し広げてある）。 */
export const MIN_RATE = 0.009;
export const MAX_RATE = 0.22;
/**
 * EXPERT・MASTER だけで使う下限（曲が 4 曲以上の作者）。MIN_RATE の候補だけでは、
 * 種類ごとの上限があるので「半分の人が BINGO になる曲数」が 29 曲より難しくならない（2026-11-09 実測）。
 */
export const DEEP_MIN_RATE = 0.005;

/** 同じ種類が偏らないよう、1 枚に入れてよい数。 */
export const ODAI_KIND_CAPS: Record<OdaiKind, number> = {
  unit: 5,
  row: 6,
  length: 2,
  title: 6,
  creator: 6,
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
const DEEP_CAPS: Record<OdaiKind, number> = { ...ODAI_KIND_CAPS, creator: 12 };
export const ODAI_LEVELS: Record<OdaiLevel, OdaiLevelDef> = {
  easy: { label: "EASY", songs: 8, minRate: MIN_RATE, caps: ODAI_KIND_CAPS },
  normal: { label: "NORMAL", songs: 20, minRate: MIN_RATE, caps: ODAI_KIND_CAPS },
  hard: { label: "HARD", songs: 30, minRate: DEEP_MIN_RATE, caps: DEEP_CAPS },
  expert: { label: "EXPERT", songs: 45, minRate: DEEP_MIN_RATE, caps: DEEP_CAPS },
  master: { label: "MASTER", songs: 75, minRate: DEEP_MIN_RATE, caps: DEEP_CAPS },
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

/** 作者名の英数字の続きがこれより長いと、スマホの 1 マスに収まらない。 */
const MAX_LATIN_RUN = 7;

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

// ---- 読みの最初の行 ----

export type RowKey = "a" | "k" | "s" | "t" | "n" | "h" | "m" | "y" | "r" | "w";

const ROW_KANA: Record<RowKey, string> = {
  a: "あいうえおぁぃぅぇぉ",
  k: "かきくけこゕゖ",
  s: "さしすせそ",
  t: "たちつてとっ",
  n: "なにぬねの",
  h: "はひふへほ",
  m: "まみむめも",
  y: "やゆよゃゅょ",
  r: "らりるれろ",
  w: "わをんゎゐゑ",
};
const ROW_KEYS = Object.keys(ROW_KANA) as RowKey[];

/** 読み（pronunciation）の最初の字の行。カタカナはひらがなに、濁点・半濁点は外して数える。 */
export function readingRow(pronunciation: string | undefined): RowKey | null {
  if (!pronunciation) return null;
  let c = pronunciation[0];
  const code = c.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60);
  const base = c.normalize("NFD")[0];
  return ROW_KEYS.find((k) => ROW_KANA[k].includes(base)) ?? null;
}

// ---- 曲名の文字の種類 ----

const HIRAGANA = /[ぁ-ゖ]/;
// 長音（ー U+30FC）と中黒（・ U+30FB）は記号として数えない。
const KATAKANA = /[ァ-ヺｦ-ﾝ]/;
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆]/;
const LATIN = /[A-Za-zＡ-Ｚａ-ｚÀ-ɏ]/;

/** 曲名が 1 種類の文字だけでできていればその種類。数字・記号・空白は数えない。 */
export function titleKind(title: string): "latin" | "kanji" | "hiragana" | null {
  const found = [
    HIRAGANA.test(title) && "hiragana",
    KATAKANA.test(title) && "katakana",
    KANJI.test(title) && "kanji",
    LATIN.test(title) && "latin",
  ].filter((v): v is string => !!v);
  if (found.length !== 1) return null;
  const kind = found[0];
  return kind === "katakana" ? null : (kind as "latin" | "kanji" | "hiragana");
}

// ---- お題の定義 ----

type OdaiDef = Omit<Odai, "rate">;

const UNIT_KEY_BY_VALUE: Record<string, UnitKey | undefined> = Object.fromEntries(
  UNIT_OPTIONS.map((o) => [o.value, o.unit])
);

const unitDefs: OdaiDef[] = UNIT_OPTIONS.map((o) => ({
  key: `u${o.value[0]}`,
  kind: "unit",
  caption: "ユニット",
  text: o.label,
  chunks: [o.label],
  unit: UNIT_KEY_BY_VALUE[o.value],
  test: (m) => m.Unit === o.value,
}));

const rowDefs: OdaiDef[] = ROW_KEYS.map((k) => {
  const text = `${ROW_KANA[k][0]}行`;
  return {
    key: `r${k}`,
    kind: "row",
    caption: "読みの頭",
    text,
    chunks: [text],
    test: (m) => readingRow(m.pronunciation) === k,
  };
});

const lengthDefs: OdaiDef[] = [
  {
    key: "l1",
    kind: "length",
    caption: "長さ",
    text: "2:30以上",
    chunks: ["2:30", "以上"],
    test: (m) => m.musicTime !== undefined && m.musicTime >= 150,
  },
  {
    key: "l0",
    kind: "length",
    caption: "長さ",
    text: "1:45未満",
    chunks: ["1:45", "未満"],
    test: (m) => m.musicTime !== undefined && m.musicTime < 105,
  },
];

const titleDef = (key: string, caption: string, chunks: string[], test: (t: string) => boolean): OdaiDef => ({
  key,
  kind: "title",
  caption,
  text: chunks.join(""),
  chunks,
  test: (m) => test(m.title),
});

const titleDefs: OdaiDef[] = [
  titleDef("te", "曲名が", ["英字", "だけ"], (t) => titleKind(t) === "latin"),
  titleDef("tk", "曲名が", ["漢字", "だけ"], (t) => titleKind(t) === "kanji"),
  titleDef("th", "曲名が", ["ひらがな", "だけ"], (t) => titleKind(t) === "hiragana"),
  titleDef("ts", "曲名が", ["2文字", "以下"], (t) => [...t.replace(/\s/g, "")].length <= 2),
  titleDef("td", "曲名に", ["数字"], (t) => /[0-9０-９]/.test(t)),
  titleDef("tb", "曲名に", ["！か？"], (t) => /[!?！？]/.test(t)),
  titleDef("tn", "曲名に", ["「の」"], (t) => t.includes("の")),
  titleDef("tm", "曲名に", ["「・」"], (t) => /[・･]/.test(t)),
];

const FIXED_DEFS: readonly OdaiDef[] = [...unitDefs, ...rowDefs, ...lengthDefs, ...titleDefs];

const NAME_BREAK_AFTER = ".@*/・_";
/** 開き括弧の前で区切り、閉じ括弧の前では区切らない（emon｜(Tes.)）。 */
const NAME_BREAK_BEFORE = "(（";
const NAME_NO_BREAK_BEFORE = ")）";
/** 1 マスに 3 行まで。全角を 1、半角を 0.55 と数えた幅の上限（ビートまりお×まろん が 10）。 */
const MAX_TEXT_EM = 10;

function cjkScript(ch: string): "h" | "k" | "j" | null {
  if (HIRAGANA.test(ch)) return "h";
  if (KATAKANA.test(ch) || ch === "ー") return "k";
  if (KANJI.test(ch)) return "j";
  return null;
}

/**
 * 作者名を折り返してよい所で区切る: . @ * / などの後ろと、ひらがな・カタカナ・漢字の切り替わり
 * （ナユタン｜星人）。英字の途中や、英字とかなの境目（みきと｜P）では区切らない。
 */
function splitName(name: string): string[] {
  // 後読みの正規表現は古い iOS Safari で構文エラーになるので、1 字ずつ見る
  const out: string[] = [];
  let prev: ReturnType<typeof cjkScript> = null;
  let breakNext = false;
  for (const ch of name) {
    const cur = cjkScript(ch);
    const canBreak = !NAME_NO_BREAK_BEFORE.includes(ch);
    const wantsBreak = breakNext || NAME_BREAK_BEFORE.includes(ch) || (prev && cur && prev !== cur);
    if (out.length === 0 || (canBreak && wantsBreak)) out.push(ch);
    else out[out.length - 1] += ch;
    breakNext = NAME_BREAK_AFTER.includes(ch);
    prev = cur;
  }
  return out;
}

function creatorDef(id: number, musics: readonly BingoMusic[]): OdaiDef | null {
  // 同じ作者で表記が揺れたら、いちばん多い表記を使う
  const names = new Map<string, number>();
  for (const m of musics) {
    if (m.creatorArtistId === id && m.artistName) names.set(m.artistName, (names.get(m.artistName) ?? 0) + 1);
  }
  const top = [...names.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return {
    key: `c${id}`,
    kind: "creator",
    caption: "作者",
    text: top[0],
    chunks: splitName(top[0]),
    test: (m) => m.creatorArtistId === id,
  };
}

function withRate(def: OdaiDef, musics: readonly BingoMusic[]): Odai {
  const n = musics.reduce((acc, m) => acc + (def.test(m) ? 1 : 0), 0);
  return { ...def, rate: musics.length > 0 ? n / musics.length : 0 };
}

/** 文言の幅（全角 1・半角 0.55）。 */
export function textEm(text: string): number {
  return [...text].reduce((acc, ch) => acc + (ch.charCodeAt(0) < 0x80 ? 0.55 : 1), 0);
}

function fitsCell(def: OdaiDef): boolean {
  return (
    textEm(def.text) <= MAX_TEXT_EM &&
    def.chunks.every((c) => !new RegExp(`[A-Za-z0-9]{${MAX_LATIN_RUN + 1},}`).test(c))
  );
}

/** 実データから使うお題の候補を作る（割合が DEEP_MIN_RATE〜MAX_RATE で、1 マスに収まるもの）。段ごとの下限は buildOdaiCard で絞る。 */
export function buildOdaiCandidates(musics: readonly BingoMusic[]): Odai[] {
  const creatorIds = [...new Set(musics.map((m) => m.creatorArtistId).filter((v): v is number => v !== undefined))].sort(
    (a, b) => a - b
  );
  const creators = creatorIds.map((id) => creatorDef(id, musics)).filter((d): d is OdaiDef => d !== null);
  return [...FIXED_DEFS, ...creators]
    .filter(fitsCell)
    .map((d) => withRate(d, musics))
    .filter((o) => o.rate >= DEEP_MIN_RATE && o.rate <= MAX_RATE);
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

function pickWithCaps(
  candidates: readonly Odai[],
  caps: Record<OdaiKind, number>,
  rng: () => number
): Odai[] | null {
  const count: Partial<Record<OdaiKind, number>> = {};
  const picked: Odai[] = [];
  for (const o of shuffleWith(candidates, rng)) {
    if (picked.length === CELLS - 1) break;
    const n = count[o.kind] ?? 0;
    if (n >= caps[o.kind]) continue;
    count[o.kind] = n + 1;
    picked.push(o);
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

/** 1 マスを、まだ使っていない候補に替える（種類ごとの上限を守る）。 */
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
  return cells.map((o, i) => (i === a ? cand : o));
}

/**
 * ランダムにお題カードを作る。中央は FREE。
 * ランダムな並びから始め、段の曲数での見積もりが目標の幅に近づく入れ替えだけを受け入れる。
 * 1 曲少ないときは線に届かないことも条件にする（カードの枠に出す目安が段の曲数とずれないように）。
 */
export function buildOdaiCard(
  candidates: readonly Odai[],
  rng: () => number = Math.random,
  level: OdaiLevel = DEFAULT_ODAI_LEVEL
): OdaiCell[] {
  const { songs, minRate, caps } = ODAI_LEVELS[level];
  const pool = candidates.filter((o) => o.rate >= minRate);
  if (pool.length < CELLS - 1) {
    throw new Error(`お題が足りません（必要 ${CELLS - 1} / 候補 ${pool.length}）。`);
  }
  const picked = pickWithCaps(pool, caps, rng);
  if (!picked) throw new Error("お題の組み合わせを作れませんでした。");
  let cells = toPositions(picked);
  // 外れの量: 見積もりが目標から離れた分と、1 曲少なくても線を越えてしまう分（目安が段の曲数より少なく出る）
  const missOf = (c: readonly (Odai | null)[]) =>
    Math.max(0, Math.abs(estimateBingoChance(c, songs) - TARGET_ESTIMATE) - TARGET_TOLERANCE) +
    Math.max(0, estimateBingoChance(c, songs - 1) - HALF_ESTIMATE + 0.001);
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
  return cells.map((o) => (o ? { odai: o, cleared: false } : "FREE"));
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
  const fixed = FIXED_DEFS.find((d) => d.key === key);
  if (fixed) return withRate(fixed, musics);
  // c04 のような書き方は c4 と同じ作者になり重複を見逃すので、0 始まりは受けない
  const m = /^c([1-9]\d*|0)$/.exec(key);
  if (m) {
    const def = creatorDef(Number(m[1]), musics);
    if (!def) throw new Error(`コードの作者が楽曲データに見つかりません（${m[1]}）。`);
    return withRate(def, musics);
  }
  throw new Error(`コードに未知のお題があります（${key}）。`);
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

/** カタカナをひらがなに（読みの検索で、どちらで打っても当たるように）。 */
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
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
