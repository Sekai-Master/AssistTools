/**
 * お題ビンゴの純ロジック（お題の定義・実データからの割合・カード構築・シード値）。
 *
 * 曲名ビンゴは 1 曲がカードに載る確率が 24/740 しかなく、50 曲遊んでもほぼビンゴにならない。
 * お題ビンゴはマスを「多くの曲に当てはまる条件」にする。お題は手書きの曲名リストを持たず、
 * 楽曲マスタから当てはまる割合を毎回計算して、MIN_RATE〜MAX_RATE のものだけを使う。
 */
import type { UnitKey } from "../../lib/units";
import type { BingoMusic } from "./bingoLogic";
import { UNIT_OPTIONS } from "./bingoConstants";

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

/** 同じ種類が偏らないよう、1 枚に入れてよい数。 */
export const ODAI_KIND_CAPS: Record<OdaiKind, number> = {
  unit: 5,
  row: 6,
  length: 2,
  title: 6,
  creator: 6,
};

/**
 * 難しさの目安: 全曲から一様に流れるとして、20 曲でビンゴになる確率がおよそ半分。
 * 1 枚ごとに見積もり（estimateBingoChance）がこの範囲に入るまで引き直す。
 * 見積もりはマスどうしを独立とみなすので、実測（odaiLogic.test.ts）で目標を合わせてある。
 */
const TARGET_SONGS = 20;
const TARGET_ESTIMATE = 0.5;
const TARGET_TOLERANCE = 0.06;
const MAX_ATTEMPTS = 300;

/** 作者名の英数字の続きがこれより長いと、スマホの 1 マスに収まらない。 */
const MAX_LATIN_RUN = 7;

const CELLS = 25;
const CENTER = 12;

export const BINGO_LINES: readonly (readonly number[])[] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/** 縦・横・斜めのどれか 1 本がそろっているか。 */
export function hasBingo(filled: readonly boolean[]): boolean {
  return BINGO_LINES.some((line) => line.every((i) => filled[i]));
}

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
    if (out.length === 0 || breakNext || (prev && cur && prev !== cur)) out.push(ch);
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

function fitsCell(def: OdaiDef): boolean {
  return def.chunks.every((c) => !new RegExp(`[A-Za-z0-9]{${MAX_LATIN_RUN + 1},}`).test(c));
}

/** 実データから使うお題の候補を作る（割合が MIN_RATE〜MAX_RATE で、1 マスに収まるもの）。 */
export function buildOdaiCandidates(musics: readonly BingoMusic[]): Odai[] {
  const creatorIds = [...new Set(musics.map((m) => m.creatorArtistId).filter((v): v is number => v !== undefined))].sort(
    (a, b) => a - b
  );
  const creators = creatorIds.map((id) => creatorDef(id, musics)).filter((d): d is OdaiDef => d !== null);
  return [...FIXED_DEFS, ...creators]
    .filter(fitsCell)
    .map((d) => withRate(d, musics))
    .filter((o) => o.rate >= MIN_RATE && o.rate <= MAX_RATE);
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

function pickWithCaps(candidates: readonly Odai[], rng: () => number): Odai[] | null {
  const count: Partial<Record<OdaiKind, number>> = {};
  const picked: Odai[] = [];
  for (const o of shuffleWith(candidates, rng)) {
    if (picked.length === CELLS - 1) break;
    const n = count[o.kind] ?? 0;
    if (n >= ODAI_KIND_CAPS[o.kind]) continue;
    count[o.kind] = n + 1;
    picked.push(o);
  }
  return picked.length === CELLS - 1 ? picked : null;
}

/** ランダムにお題カードを作る。中央は FREE。難しさが目安に近い並びになるまで引き直す。 */
export function buildOdaiCard(candidates: readonly Odai[], rng: () => number = Math.random): OdaiCell[] {
  if (candidates.length < CELLS - 1) {
    throw new Error(`お題が足りません（必要 ${CELLS - 1} / 候補 ${candidates.length}）。`);
  }
  let best: (Odai | null)[] | null = null;
  let bestGap = Infinity;
  for (let a = 0; a < MAX_ATTEMPTS && bestGap > TARGET_TOLERANCE; a++) {
    const picked = pickWithCaps(candidates, rng);
    if (!picked) continue;
    const cells = toPositions(picked);
    const gap = Math.abs(estimateBingoChance(cells, TARGET_SONGS) - TARGET_ESTIMATE);
    if (gap < bestGap) {
      best = cells;
      bestGap = gap;
    }
  }
  if (!best) throw new Error("お題の組み合わせを作れませんでした。");
  return best.map((o) => (o ? { odai: o, cleared: false } : "FREE"));
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
    if (!def) throw new Error(`シード値の作者が楽曲データに見つかりません（${m[1]}）。`);
    return withRate(def, musics);
  }
  throw new Error(`シード値に未知のお題があります（${key}）。`);
}

export function decodeOdaiSeed(seed: string, musics: readonly BingoMusic[]): OdaiCell[] {
  const trimmed = seed.trim();
  if (!hasOdaiPrefix(trimmed)) throw new Error("お題ビンゴのシード値ではありません。");
  const tokens = trimmed.slice(ODAI_SEED_PREFIX.length).split(".");
  if (tokens.length !== CELLS) throw new Error(`シード値のマスの数が不正です（${CELLS}マス）。`);
  const seen = new Set<string>();
  return tokens.map((token, i) => {
    if (token === FREE_TOKEN || i === CENTER) {
      if (token !== FREE_TOKEN || i !== CENTER) throw new Error("FREE は中央のマスだけです。");
      return "FREE";
    }
    const cleared = token.endsWith(CLEARED_MARK);
    const key = cleared ? token.slice(0, -CLEARED_MARK.length) : token;
    if (seen.has(key)) throw new Error(`シード値のお題が重複しています（${key}）。`);
    seen.add(key);
    return { odai: odaiFromKey(key, musics), cleared };
  });
}
