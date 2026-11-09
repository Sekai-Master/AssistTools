/**
 * お題ビンゴのお題の定義（鍵・札・文言・判定）。割合・カードの作り方・コードは odaiLogic.ts。
 *
 * ★ 鍵はコード（OD1:…）に入るので、一度出したら変えない。今の鍵の決まり:
 *   u<ユニット> ユニット ／ s<キャラ id>・v6・va ボーカル ／ w<ユニット>・om・oc 曲の種類
 *   r<行> 読みの頭 ／ yi・yn・y4 読み ／ l0・l1 長さ ／ t? 曲名 ／ g? 曲名の語
 *   m2・mo・m3 MV ／ a<年>・a0 追加 ／ da・dm32・dm33・dl26・de28・dn7 譜面 ／ kl 作り手 ／ c<作者 id> 作者
 */
import type { UnitKey } from "../../lib/units";
import { CHARACTERS, UNIT_KEY } from "../deck/lib/characters";
import type { BingoMusic } from "./bingoLogic";
import { UNIT_OPTIONS } from "./bingoConstants";
import { creatorAliasOf, creatorCovers } from "./creatorMembers";

export type OdaiKind =
  | "unit"
  | "singer"
  | "vocal"
  | "origin"
  | "row"
  | "reading"
  | "length"
  | "title"
  | "word"
  | "mv"
  | "added"
  | "chart"
  | "maker"
  | "creator";

export interface OdaiDef {
  /** シード値に入れる安定した鍵（ユニットのコード・行・creatorArtistId など）。 */
  key: string;
  kind: OdaiKind;
  /** マスの上に小さく出す種類の名前。 */
  caption: string;
  /** マスの主役の文言。 */
  text: string;
  /** 折り返してよい区切り。区切りの中では折らない（スマホの 1 マスで語の途中で折れないように）。 */
  chunks: string[];
  /**
   * ユニットの色の印（マスの上端の帯）。ユニット・書き下ろし・ボーカルのキャラ（そのキャラのユニット。VS の 6 人は VS）。
   * ★ 同じユニットのお題は 1 枚に 1 つまで（odaiLogic.ts の clashes）。
   */
  unit?: UnitKey;
  test: (m: BingoMusic) => boolean;
  /** お題の小窓で曲名の下に出す、判定に使う値（読み・長さ・追加された日・レベルなど）。判定しやすいお題には無い。 */
  hint?: (m: BingoMusic) => string | null;
  /** お題の小窓で、当てはまる曲をこの名前ごとに区切って出す（コラボのお題はコラボごと）。 */
  group?: (m: BingoMusic) => string | null;
}

export interface Odai extends OdaiDef {
  /** 全曲のうち当てはまる曲の割合（0〜1）。 */
  rate: number;
  /**
   * 同じカードに並べないお題の鍵（当てはまる曲が大きく重なる・同じユニット）。
   * buildOdaiCandidates が候補を作るときに 1 回だけ数える。コードから開いたお題には無い。
   */
  clashes?: ReadonlySet<string>;
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

/** カタカナをひらがなに（読みの判定と検索で、どちらで書いてあっても同じに数える）。 */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// ---- 曲名の文字の種類 ----

const HIRAGANA = /[ぁ-ゖ]/;
// 長音（ー U+30FC）と中黒（・ U+30FB）は記号として数えない。
const KATAKANA = /[ァ-ヺｦ-ﾝ]/;
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆]/;
// ★ À-ɏ の間にある × (U+00D7) と ÷ (U+00F7) は英字ではない（「ピアノ×フォルテ×スキャンダル」が英字と日本語に当たっていた）
const LATIN = /[A-Za-zＡ-Ｚａ-ｚÀ-ÖØ-öø-ɏ]/;

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

/** 曲名に英字と、日本語（ひらがな・カタカナ・漢字）の両方がある。 */
export function mixesLatinAndJapanese(title: string): boolean {
  return LATIN.test(title) && (HIRAGANA.test(title) || KATAKANA.test(title) || KANJI.test(title));
}

/** 空白を除いた文字数（サロゲートペアも 1 字）。 */
const charCount = (s: string) => [...s.replace(/\s/g, "")].length;

// ---- ユニット・ボーカル ----

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

/**
 * ボーカルのキャラ: そのキャラがどれかの歌唱 ver.（アナザーボーカル込み）で歌う曲。文言は名前だけ。
 * ミク（約 70%）・リン（約 22.5%）は割合の上限で自然に外れる。
 */
const singerDefs: OdaiDef[] = CHARACTERS.map((c) => ({
  key: `s${c.ch}`,
  kind: "singer",
  caption: "ボーカル",
  text: c.givenName,
  chunks: [c.givenName],
  unit: UNIT_KEY[c.unit],
  test: (m) => m.singers?.includes(c.ch) ?? false,
}));

const vocalDefs: OdaiDef[] = [
  {
    key: "v6",
    kind: "vocal",
    caption: "ボーカル",
    text: "6人以上",
    chunks: ["6人", "以上"],
    test: (m) => (m.maxSingers ?? 0) >= 6,
  },
  {
    key: "va",
    kind: "vocal",
    caption: "ボーカル",
    text: "エイプリルフール",
    // ★ 320px の 1 マスは全角 4 字まで。5 字の「エイプリル」で区切ると 3 行に割れる
    chunks: ["エイプリ", "ルフール"],
    test: (m) => m.hasAprilFool === true,
  },
];

// ---- 曲の種類（ユニットの書き下ろし・劇場版・コラボ） ----

/** ユニットの書き下ろし曲。書き下ろし全体だと 27% で易しすぎるので、ユニットごとに分ける（3〜4%）。 */
const writtenDefs: OdaiDef[] = UNIT_OPTIONS.flatMap((o) =>
  o.unit
    ? [
        {
          key: `w${o.value[0]}`,
          kind: "origin" as const,
          // ★ 320px の 1 マスに収まるのは 4 字まで（「書き下ろし」は 5 字で折れる）
          caption: "書下ろし",
          text: o.label,
          chunks: [o.label],
          unit: o.unit,
          test: (m: BingoMusic) => m.isNewlyWrittenMusic && m.Unit === o.value,
        },
      ]
    : []
);

/** マスタの musicCollaborations の名前。名前が変わったらお題の割合が 0 になり、候補から外れるだけ。 */
export const MOVIE_LABEL = "劇場版プロジェクトセカイ";
/** コラボに数えない名前（エイプリルフールの曲・期間限定のメドレー）。 */
const NOT_COLLAB = /エイプリルフール|ボスラッシュ/;

/** コラボのお題に当てはまる曲か（劇場版・エイプリルフール・ボスラッシュを除く）。 */
export function isCollab(m: BingoMusic): boolean {
  return m.collab !== undefined && m.collab !== MOVIE_LABEL && !NOT_COLLAB.test(m.collab);
}

const originDefs: OdaiDef[] = [
  {
    key: "om",
    kind: "origin",
    caption: "曲の種類",
    text: "劇場版",
    chunks: ["劇場版"],
    test: (m) => m.collab === MOVIE_LABEL,
  },
  {
    key: "oc",
    kind: "origin",
    caption: "曲の種類",
    text: "コラボ",
    chunks: ["コラボ"],
    test: isCollab,
    // 小窓ではコラボごとに区切る（東方Projectコラボ 6曲 など）。見出しに名前が出るので、曲名の下には出さない
    group: (m) => m.collab ?? null,
  },
];

// ---- 読み ----

const readingHint = (m: BingoMusic) => m.pronunciation ?? null;

const rowDefs: OdaiDef[] = ROW_KEYS.map((k) => {
  const text = `${ROW_KANA[k][0]}行`;
  return {
    key: `r${k}`,
    kind: "row",
    caption: "読みの頭",
    text,
    chunks: [text],
    test: (m) => readingRow(m.pronunciation) === k,
    hint: readingHint,
  };
});

/**
 * 読みの判定に使う形: ひらがなにして、かなと長音（ー）だけを残す。読みには「！」「・」「☆」や空白も入っているが、
 * 声に出さないので数えない（「ふー？」は 2 文字、「〜かわいい！」は「い」で終わる）。
 */
export function readingKana(pronunciation: string | undefined): string {
  return pronunciation ? toHiragana(pronunciation).replace(/[^ぁ-ゖー]/g, "") : "";
}

const readingDef = (key: string, caption: string, chunks: string[], test: (reading: string) => boolean): OdaiDef => ({
  key,
  kind: "reading",
  caption,
  text: chunks.join(""),
  chunks,
  test: (m) => {
    const r = readingKana(m.pronunciation);
    return r !== "" && test(r);
  },
  hint: readingHint,
});

const readingDefs: OdaiDef[] = [
  readingDef("yi", "読みが", ["「い」で", "終わる"], (r) => r.endsWith("い")),
  readingDef("yn", "読みに", ["「ん」", "2つ以上"], (r) => (r.match(/ん/g) ?? []).length >= 2),
  readingDef("y4", "読みが", ["4文字", "以下"], (r) => [...r].length <= 4),
];

// ---- 長さ ----

const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const timeHint = (m: BingoMusic) => (m.musicTime !== undefined ? formatTime(m.musicTime) : null);

const lengthDefs: OdaiDef[] = [
  {
    key: "l1",
    kind: "length",
    caption: "長さ",
    text: "2:30以上",
    chunks: ["2:30", "以上"],
    test: (m) => m.musicTime !== undefined && m.musicTime >= 150,
    hint: timeHint,
  },
  {
    key: "l0",
    kind: "length",
    caption: "長さ",
    text: "1:45未満",
    chunks: ["1:45", "未満"],
    test: (m) => m.musicTime !== undefined && m.musicTime < 105,
    hint: timeHint,
  },
];

// ---- 曲名 ----

const titleDef = (key: string, caption: string, chunks: string[], test: (t: string) => boolean): OdaiDef => ({
  key,
  kind: "title",
  caption,
  text: chunks.join(""),
  chunks,
  test: (m) => test(m.title),
});

/** 曲名の飾りの記号（♪☆★♭♯＊*@＆&〜~ と ♡♥）。「・」「！？」は別のお題。 */
const TITLE_SYMBOL = /[♪☆★♭♯＊*@＠＆&〜~♡♥]/;

const titleDefs: OdaiDef[] = [
  titleDef("te", "曲名が", ["英字", "だけ"], (t) => titleKind(t) === "latin"),
  titleDef("tk", "曲名が", ["漢字", "だけ"], (t) => titleKind(t) === "kanji"),
  titleDef("th", "曲名が", ["ひらがな", "だけ"], (t) => titleKind(t) === "hiragana"),
  titleDef("ts", "曲名が", ["2文字", "以下"], (t) => charCount(t) <= 2),
  titleDef("t4", "曲名が", ["4文字"], (t) => charCount(t) === 4),
  titleDef("td", "曲名に", ["数字"], (t) => /[0-9０-９]/.test(t)),
  titleDef("tb", "曲名に", ["！か？"], (t) => /[!?！？]/.test(t)),
  titleDef("tn", "曲名に", ["「の」"], (t) => t.includes("の")),
  titleDef("tm", "曲名に", ["「・」"], (t) => /[・･]/.test(t)),
  titleDef("tx", "曲名に", ["英字と", "日本語"], mixesLatinAndJapanese),
  titleDef("ty", "曲名に", ["♪☆♭", "など"], (t) => TITLE_SYMBOL.test(t)),
];

/**
 * 曲名の語（意味で選んだ語のまとまり）。語は手で並べる。表記ゆれでこぼれる曲は了承済み（Nori 2026-11-09）。
 * exclude は意味の違う語（モンスターのスター・告白の白・六月の月 など）。先に取り除いてから include を探す。
 */
const wordDef = (key: string, chunks: string[], include: RegExp, exclude?: RegExp): OdaiDef => ({
  key,
  kind: "word",
  caption: "曲名に",
  text: chunks.join(""),
  chunks,
  test: (m) => include.test(exclude ? m.title.replace(exclude, "") : m.title),
});

export const WORD_DEFS: readonly OdaiDef[] = [
  wordDef(
    "gn",
    ["夜・", "月・", "星"],
    /[夜月星]|ナイト|ムーン|スター/,
    /(?:キャ|コー|バ|モン|マ|ミ|ポ)スター|[一二三四五六七八九十]月|[睦如卯皐葉長霜文]月|水無月|神無月/g
  ),
  wordDef("gf", ["花・", "春・", "桜"], /[花春桜]/, /青春/g),
  wordDef(
    "gc",
    ["色の", "名前"],
    /[赤青白黒緑紫黄桃]|ブルー|レッド|ホワイト|ブラック|ピンク|グリーン|オレンジ|パープル/,
    /告白|独白|白状|空白|余白|明白|青春|(?:ス|ブ|ド)レッド/g
  ),
  wordDef("gl", ["恋・", "愛"], /[恋愛]|ラブ|love/i, /可愛|クラブ|glove|clover/gi),
  wordDef("gw", ["空・", "雨・", "雪・", "風"], /[空雨雪風]/, /威風|空想|空白|架空/g),
  wordDef("gs", ["世界・", "セカイ"], /世界|セカイ|ワールド|world/i),
];

// ---- MV ----

const mvDefs: OdaiDef[] = [
  {
    key: "m2",
    kind: "mv",
    caption: "MV",
    text: "3Dと2D",
    chunks: ["3Dと", "2D"],
    test: (m) => m.categories.includes("mv_3d") && m.categories.includes("mv_2d"),
  },
  {
    key: "mo",
    kind: "mv",
    caption: "MV",
    text: "原曲",
    chunks: ["原曲"],
    test: (m) => m.categories.includes("original"),
  },
  {
    key: "m3",
    kind: "mv",
    caption: "3DMV",
    text: "3人で踊る",
    chunks: ["3人で", "踊る"],
    test: (m) => m.categories.includes("mv_3d") && m.dancerCount === 3,
  },
];

// ---- 追加 ----

/** サービス開始（2020-09-30 JST）の次の日の 0 時。これより前の曲は「サービス開始時からある曲」。 */
export const SERVICE_START_END = Date.UTC(2020, 8, 30, 15);
const JST_OFFSET = 9 * 60 * 60 * 1000;

/**
 * ゲームに入った年（日本時間）。サービス開始時からある曲は publishedAt が 2019 年の仮の値なので、
 * サービス開始の年（2020）に数える（「2019年に追加」は出さない）。
 */
export function addedYear(m: BingoMusic): number | null {
  if (m.publishedAt === undefined) return null;
  return new Date(Math.max(m.publishedAt, SERVICE_START_END - 1) + JST_OFFSET).getUTCFullYear();
}

/** ゲームに入った年月日（日本時間、2024/05/01 の形）。サービス開始時からある曲はサービス開始の日。 */
export function addedDateText(m: BingoMusic): string | null {
  if (m.publishedAt === undefined) return null;
  const d = new Date(Math.max(m.publishedAt, SERVICE_START_END - 1) + JST_OFFSET);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
}

const serviceStartDef: OdaiDef = {
  key: "a0",
  kind: "added",
  caption: "追加",
  text: "サービス開始時",
  chunks: ["サービス", "開始時"],
  test: (m) => m.publishedAt !== undefined && m.publishedAt < SERVICE_START_END,
  hint: addedDateText,
};

function yearDef(year: number): OdaiDef {
  const text = `${year}年`;
  return {
    key: `a${year}`,
    kind: "added",
    caption: "追加",
    text,
    chunks: [text],
    test: (m) => addedYear(m) === year,
    hint: addedDateText,
  };
}

/** 楽曲データにある年ぶんの「○○年に追加」（年が増えれば自動で増える）。 */
function yearDefs(musics: readonly BingoMusic[]): OdaiDef[] {
  const years = [...new Set(musics.map(addedYear).filter((y): y is number => y !== null))].sort((a, b) => a - b);
  return years.map(yearDef);
}

// ---- 譜面・作り手 ----

const chartDef = (
  key: string,
  caption: string,
  chunks: string[],
  test: (m: BingoMusic) => boolean,
  hint: (m: BingoMusic) => string | null
): OdaiDef => ({ key, kind: "chart", caption, text: chunks.join(""), chunks, test, hint });

const levelHint = (label: string, level: number | undefined) => (level !== undefined ? `${label} Lv.${level}` : null);
const appendHint = (m: BingoMusic) => levelHint("APPEND", m.appendLevel);
const masterHint = (m: BingoMusic) => levelHint("MASTER", m.masterLevel);
const expertHint = (m: BingoMusic) => levelHint("EXPERT", m.expertLevel);
const notesHint = (m: BingoMusic) => (m.masterNotes !== undefined ? `MASTER ${m.masterNotes}ノーツ` : null);

const chartDefs: OdaiDef[] = [
  chartDef("da", "譜面", ["APPEND"], (m) => m.appendLevel !== undefined, appendHint),
  // ★ Lv.32 以上と Lv.33 以上は中身が入れ子。重なりの決まり（odaiLogic.ts の clashes）で同じカードに並ばない
  chartDef("dm32", "MASTER", ["Lv.32", "以上"], (m) => (m.masterLevel ?? 0) >= 32, masterHint),
  chartDef("dm33", "MASTER", ["Lv.33", "以上"], (m) => (m.masterLevel ?? 0) >= 33, masterHint),
  chartDef("dl26", "MASTER", ["Lv.26", "以下"], (m) => m.masterLevel !== undefined && m.masterLevel <= 26, masterHint),
  chartDef("de28", "EXPERT", ["Lv.28", "以上"], (m) => (m.expertLevel ?? 0) >= 28, expertHint),
  chartDef("dn7", "MASTER", ["ノーツ", "700未満"], (m) => m.masterNotes !== undefined && m.masterNotes < 700, notesHint),
];

const makerDefs: OdaiDef[] = [
  {
    key: "kl",
    kind: "maker",
    caption: "作り手",
    text: "作詞と作曲が別",
    chunks: ["作詞と", "作曲が別"],
    test: (m) => m.lyricsByOther === true,
  },
];

/** 楽曲データによらない定義（年と作者は楽曲データから作る）。 */
export const FIXED_DEFS: readonly OdaiDef[] = [
  ...unitDefs,
  ...singerDefs,
  ...vocalDefs,
  ...writtenDefs,
  ...originDefs,
  ...rowDefs,
  ...readingDefs,
  ...lengthDefs,
  ...titleDefs,
  ...WORD_DEFS,
  ...mvDefs,
  serviceStartDef,
  ...chartDefs,
  ...makerDefs,
];

// ---- 作者 ----

const NAME_BREAK_AFTER = ".@*/・_";
/** 開き括弧の前で区切り、閉じ括弧の前では区切らない（emon｜(Tes.)）。 */
const NAME_BREAK_BEFORE = "(（";
const NAME_NO_BREAK_BEFORE = ")）";

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
    // 連名の曲・表記違いの作者の曲も埋まる（creatorMembers.ts）
    test: (m) => m.creatorArtistId !== undefined && creatorCovers(id, m.creatorArtistId),
    // 自分の ID 以外の曲には、曲の作者の表記を添える（なぜ当てはまるかが分かるように）
    hint: (m) => (m.creatorArtistId !== id && m.artistName ? m.artistName : null),
  };
}

function creatorDefs(musics: readonly BingoMusic[]): OdaiDef[] {
  const ids = new Set(musics.map((m) => m.creatorArtistId).filter((v): v is number => v !== undefined));
  // 表記が違うだけの作者 ID は、同じ人のお題と重なるので出さない。ただし同じ人の自分の曲が無ければ（配信停止）出す。
  // コードから開くのは odaiDefFromKey で引ける
  return [...ids]
    .filter((id) => {
      const same = creatorAliasOf(id);
      return same === null || !ids.has(same);
    })
    .sort((a, b) => a - b)
    .map((id) => creatorDef(id, musics))
    .filter((d): d is OdaiDef => d !== null);
}

/** 楽曲データから作るものも含めた、すべての定義。 */
export function allOdaiDefs(musics: readonly BingoMusic[]): OdaiDef[] {
  return [...FIXED_DEFS, ...yearDefs(musics), ...creatorDefs(musics)];
}

/** 鍵から定義を引く（コードから開くとき）。年と作者は楽曲データにあるものだけ。無ければ例外。 */
export function odaiDefFromKey(key: string, musics: readonly BingoMusic[]): OdaiDef {
  const fixed = FIXED_DEFS.find((d) => d.key === key);
  if (fixed) return fixed;
  // c04・a02021 のような書き方は同じお題になり重複を見逃すので、0 始まりは受けない
  const creator = /^c([1-9]\d*|0)$/.exec(key);
  if (creator) {
    const def = creatorDef(Number(creator[1]), musics);
    if (!def) throw new Error(`コードの作者が楽曲データに見つかりません（${creator[1]}）。`);
    return def;
  }
  const year = /^a([1-9]\d{3})$/.exec(key);
  if (year) {
    const y = Number(year[1]);
    if (!musics.some((m) => addedYear(m) === y)) throw new Error(`コードの年が楽曲データに見つかりません（${y}）。`);
    return yearDef(y);
  }
  throw new Error(`コードに未知のお題があります（${key}）。`);
}

// ---- 1 マスに収まるか ----

/** 1 マスに 3 行まで。全角を 1、半角を 0.55 と数えた幅の上限（ビートまりお×まろん が 10）。 */
export const MAX_TEXT_EM = 10;
/** 札の幅の上限。320px の 1 マスは約 50px、札は 12px なので全角 4 字（MASTER は 3.3）。 */
export const MAX_CAPTION_EM = 4;
/** 作者名の英数字の続きがこれより長いと、スマホの 1 マスに収まらない。 */
const MAX_LATIN_RUN = 7;
const LONG_LATIN_RUN = new RegExp(`[A-Za-z0-9]{${MAX_LATIN_RUN + 1},}`);

/** 文言の幅（全角 1・半角 0.55）。 */
export function textEm(text: string): number {
  return [...text].reduce((acc, ch) => acc + (ch.charCodeAt(0) < 0x80 ? 0.55 : 1), 0);
}

export function fitsCell(def: OdaiDef): boolean {
  return (
    textEm(def.caption) <= MAX_CAPTION_EM &&
    textEm(def.text) <= MAX_TEXT_EM &&
    def.chunks.every((c) => !LONG_LATIN_RUN.test(c))
  );
}
