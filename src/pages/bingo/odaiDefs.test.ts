/// <reference types="node" />
/**
 * お題の定義（odaiDefs.ts）: 新しいお題の割合が実データの数え上げと一致する・語と読みの判定・年・コード・1 マスに収まるか。
 * ★ 楽曲データは毎日更新されて、このテストは毎日の更新の門番になる。曲が増えても落ちない書き方にする
 *   （割合の上下限・決まった曲数ではなく、「数え上げと一致する」「入れ子は並ばない」を見る）。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BingoMusic } from "./bingoLogic";
import { parseMusics } from "./useBingoMusics";
import { DEEP_MIN_RATE, MAX_RATE, buildOdaiCandidates, decodeOdaiSeed, encodeOdaiSeed } from "./odaiLogic";
import {
  FIXED_DEFS,
  MAX_CAPTION_EM,
  MAX_TEXT_EM,
  WORD_DEFS,
  addedDateText,
  addedYear,
  allOdaiDefs,
  odaiDefFromKey,
  readingKana,
  textEm,
} from "./odaiDefs";

interface RawMusic {
  id: string;
  title: string;
  pronunciation?: string;
  published?: boolean;
  categories: string[];
  publishedAt: number;
  singers?: number[];
  maxSingers?: number;
  hasAprilFool?: boolean;
  dancerCount?: number;
  lyricsByOther?: boolean;
  expertLevel?: number;
  masterLevel?: number;
  appendLevel?: number;
  masterNotes?: number;
}

const RAW = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8")
) as RawMusic[];
const PLAYABLE = RAW.filter((m) => m.published !== false);
const MUSICS = parseMusics(RAW);
const CANDIDATES = buildOdaiCandidates(MUSICS);

/** 曲だけ作る（判定の例のため）。 */
const song = (patch: Partial<BingoMusic>): BingoMusic => ({
  id: "999",
  title: "",
  default: 0,
  Unit: "0_VS",
  categories: [],
  isNewlyWrittenMusic: false,
  jacketLink: "",
  ...patch,
});
const def = (key: string) => {
  const d = FIXED_DEFS.find((x) => x.key === key);
  if (!d) throw new Error(key);
  return d;
};

// ---- 割合が実データの数え上げと一致する ----

/** 日本時間の年（Intl で数える。実装の UTC+9 とは別の道筋）。 */
const jstYear = (ms: number) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric" }).format(new Date(ms)));
/** サービス開始の日の終わり（2020-09-30 23:59:59 JST）。これ以前の曲は 2020 年に数える。 */
const LAUNCH_END = Date.parse("2020-09-30T23:59:59+09:00");
const hira = (s: string) => [...s].map((c) => (c >= "ァ" && c <= "ヶ" ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c)).join("");
const kana = (p: string | undefined) => (p ? hira(p).replace(/[^ぁ-ゖー]/g, "") : "");

/** 指示書（2026-11-09）の定義どおりに、楽曲データの生の項目から数える。 */
const SPEC: Record<string, (m: RawMusic) => boolean> = {
  v6: (m) => (m.maxSingers ?? 0) >= 6,
  va: (m) => m.hasAprilFool === true,
  m2: (m) => m.categories.includes("mv_3d") && m.categories.includes("mv_2d"),
  mo: (m) => m.categories.includes("original"),
  m3: (m) => m.categories.includes("mv_3d") && m.dancerCount === 3,
  a0: (m) => m.publishedAt <= LAUNCH_END,
  da: (m) => typeof m.appendLevel === "number",
  dm32: (m) => (m.masterLevel ?? 0) >= 32,
  dm33: (m) => (m.masterLevel ?? 0) >= 33,
  dl26: (m) => typeof m.masterLevel === "number" && m.masterLevel <= 26,
  de28: (m) => (m.expertLevel ?? 0) >= 28,
  dn7: (m) => typeof m.masterNotes === "number" && m.masterNotes < 700,
  kl: (m) => m.lyricsByOther === true,
  t4: (m) => [...m.title.replace(/\s/g, "")].length === 4,
  tx: (m) => /[A-Za-zＡ-Ｚａ-ｚÀ-ɏ]/.test(m.title) && /[ぁ-ゖァ-ヺｦ-ﾝ一-鿿㐀-䶿豈-﫿々〆]/.test(m.title),
  ty: (m) => /[♪☆★♭♯＊*@＠＆&〜~♡♥]/.test(m.title),
  yi: (m) => kana(m.pronunciation).endsWith("い"),
  yn: (m) => [...kana(m.pronunciation)].filter((c) => c === "ん").length >= 2,
  y4: (m) => kana(m.pronunciation).length > 0 && [...kana(m.pronunciation)].length <= 4,
};
for (let ch = 1; ch <= 26; ch++) SPEC[`s${ch}`] = (m) => (m.singers ?? []).includes(ch);
const YEARS = [...new Set(PLAYABLE.map((m) => jstYear(Math.max(m.publishedAt, LAUNCH_END))))];
for (const y of YEARS) SPEC[`a${y}`] = (m) => jstYear(Math.max(m.publishedAt, LAUNCH_END)) === y;

describe("新しいお題の割合（実データの数え上げ）", () => {
  it("遊べる曲の数がそろう（数え上げの母数）", () => {
    expect(MUSICS.length).toBe(PLAYABLE.length);
  });

  it.each(Object.keys(SPEC))("%s: お題の判定で数えた曲が、楽曲データの項目から数えた曲と一致する", (key) => {
    const d = odaiDefFromKey(key, MUSICS);
    const ids = MUSICS.filter((m) => d.test(m)).map((m) => m.id).sort();
    const expected = PLAYABLE.filter(SPEC[key]).map((m) => m.id).sort();
    expect(ids).toEqual(expected);
    // 候補に入っていれば、割合もその数
    const cand = CANDIDATES.find((o) => o.key === key);
    if (cand) expect(cand.rate).toBeCloseTo(expected.length / PLAYABLE.length, 10);
  });

  it("楽曲データに新しい項目が入っている（無いと歌う人・譜面のお題が全部 0 曲になる）", () => {
    expect(PLAYABLE.filter((m) => Array.isArray(m.singers)).length / PLAYABLE.length).toBeGreaterThan(0.85);
    expect(PLAYABLE.filter((m) => typeof m.masterLevel === "number").length / PLAYABLE.length).toBeGreaterThan(0.95);
    expect(PLAYABLE.some((m) => m.hasAprilFool)).toBe(true);
    expect(PLAYABLE.some((m) => m.lyricsByOther)).toBe(true);
    expect(PLAYABLE.some((m) => m.dancerCount === 3)).toBe(true);
  });

  it("歌う人・譜面・追加・MV・曲名の語などがお題の候補に入る（ミク・リンは易しすぎて外れる）", () => {
    const kinds = new Set(CANDIDATES.map((o) => o.kind));
    for (const k of ["singer", "vocal", "mv", "added", "chart", "maker", "word", "reading"]) expect(kinds).toContain(k);
    const keys = CANDIDATES.map((o) => o.key);
    expect(keys).not.toContain("s21");
    for (const k of ["s1", "s20", "s23", "dm32", "dm33", "da", "a2021", "kl", "gn"]) expect(keys).toContain(k);
  });

  it("「2019年に追加」は出さない（サービス開始時の曲は 2019 年の仮の日付）", () => {
    expect(CANDIDATES.some((o) => o.key === "a2019")).toBe(false);
    expect(() => odaiDefFromKey("a2019", MUSICS)).toThrow(/年/);
  });
});

// ---- 判定の例 ----

describe("曲名の語（意味の違う語は数えない）", () => {
  it.each([
    ["gn", "夜に駆ける", true],
    ["gn", "三日月ステップ", true],
    ["gn", "スターナイトスノウ", true],
    ["gn", "流星のパルス", true],
    ["gn", "ラズベリー＊モンスター", false],
    ["gn", "テレキャスタービーボーイ", false],
    ["gn", "ときめきジェットコースター", false],
    ["gn", "とても素敵な六月でした", false],
    ["gn", "如月アテンション", false],
    ["gf", "千本桜", true],
    ["gf", "春嵐", true],
    ["gf", "青春", false],
    ["gc", "群青讃歌", true],
    ["gc", "ブループラネット", true],
    ["gc", "レッドランドマーカー", true],
    ["gc", "告白", false],
    ["gc", "地球最後の告白を", false],
    ["gl", "恋愛裁判", true],
    ["gl", "推定ラブソング", true],
    ["gl", "imaginary love story", true],
    ["gl", "可愛くてごめん", false],
    ["gw", "雨とペトラ", true],
    ["gw", "強風オールバック", true],
    ["gw", "威風堂々", false],
    ["gw", "空想フォレスト", false],
    ["gs", "Tell Your World", true],
    ["gs", "ハローセカイ", true],
    ["gs", "ワーワーワールド", true],
    ["gs", "千本桜", false],
  ] as const)("%s「%s」→ %s", (key, title, expected) => {
    const d = WORD_DEFS.find((w) => w.key === key)!;
    expect(d.test(song({ title }))).toBe(expected);
  });
});

describe("曲名・読みの判定", () => {
  it("曲名が 4 文字（空白を除く）・英字と日本語・記号", () => {
    expect(def("t4").test(song({ title: "シャルル" }))).toBe(true);
    expect(def("t4").test(song({ title: "ロキ" }))).toBe(false);
    expect(def("t4").test(song({ title: "アイ ドル" }))).toBe(true);
    expect(def("tx").test(song({ title: "potatoになっていく" }))).toBe(true);
    expect(def("tx").test(song({ title: "超最終鬼畜妹フランドール・Ｓ" }))).toBe(true);
    expect(def("tx").test(song({ title: "Tell Your World" }))).toBe(false);
    expect(def("tx").test(song({ title: "千本桜" }))).toBe(false);
    expect(def("ty").test(song({ title: "ポジティブ☆ダンスタイム" }))).toBe(true);
    expect(def("ty").test(song({ title: "ODDS＆ENDS" }))).toBe(true);
    expect(def("ty").test(song({ title: "ハロ／ハワユ" }))).toBe(false);
  });

  it("読みはかなと長音だけで数える（記号・空白は声に出さない。カタカナはひらがなに）", () => {
    expect(readingKana("ふー？")).toBe("ふー");
    expect(readingKana("しろいゆきのプリンセスは")).toBe("しろいゆきのぷりんせすは");
    expect(readingKana("どーなつほーる　にーまるにーよん")).toBe("どーなつほーるにーまるにーよん");
    expect(def("y4").test(song({ pronunciation: "ふー？" }))).toBe(true);
    expect(def("y4").test(song({ pronunciation: "てるゆあわーるど" }))).toBe(false);
    expect(def("yi").test(song({ pronunciation: "みらい" }))).toBe(true);
    expect(def("yi").test(song({ pronunciation: "かわいい！" }))).toBe(true);
    expect(def("yi").test(song({ pronunciation: "ろき" }))).toBe(false);
    expect(def("yn").test(song({ pronunciation: "せんぼんざくら" }))).toBe(true);
    expect(def("yn").test(song({ pronunciation: "ヴぃらん" }))).toBe(false);
    expect(def("y4").test(song({ pronunciation: undefined }))).toBe(false);
  });

  it("歌う人は、どれかの ver. で歌うキャラ。項目が無い曲は当てはまらない", () => {
    expect(def("s1").test(song({ singers: [1, 21] }))).toBe(true);
    expect(def("s1").test(song({ singers: [2] }))).toBe(false);
    expect(def("s1").test(song({}))).toBe(false);
    expect(def("s1").caption).toBe("歌う人");
    expect(def("s18").text).toBe("まふゆ");
    expect(def("s26").text).toBe("KAITO");
  });

  it("歌う人の色の帯はキャラのユニット（VS の 6 人は VS）", () => {
    expect(def("s1").unit).toBe("ln");
    expect(def("s20").unit).toBe("n25");
    expect(def("s23").unit).toBe("vs");
  });
});

describe("追加された年", () => {
  const launch = Date.parse("2019-06-10T09:00:00+09:00");
  it("日本時間で数え、サービス開始時の曲（2019 年の仮の日付）は 2020 年", () => {
    expect(addedYear(song({ publishedAt: launch }))).toBe(2020);
    expect(addedDateText(song({ publishedAt: launch }))).toBe("2020/09/30");
    // 2020-12-31 15:30 UTC は日本時間で 2021-01-01
    expect(addedYear(song({ publishedAt: Date.UTC(2020, 11, 31, 15, 30) }))).toBe(2021);
    expect(addedDateText(song({ publishedAt: Date.UTC(2024, 4, 1, 3) }))).toBe("2024/05/01");
    expect(addedYear(song({}))).toBeNull();
  });

  it("年が増えると、その年のお題も自動で増える", () => {
    const musics = [song({ id: "1", publishedAt: launch }), song({ id: "2", publishedAt: Date.UTC(2031, 5, 1) })];
    const keys = allOdaiDefs(musics).map((d) => d.key);
    expect(keys).toContain("a2020");
    expect(keys).toContain("a2031");
    expect(keys).not.toContain("a2019");
  });
});

// ---- コード ----

describe("コード（鍵）", () => {
  // ★ この PR の前に出ていた鍵。意味（文言）が変わると、人に送ったカードの中身が変わってしまう
  const OLD_KEYS: Record<string, string> = {
    u1: "L/n",
    u9: "その他",
    ra: "あ行",
    rw: "わ行",
    l0: "1:45未満",
    l1: "2:30以上",
    te: "英字だけ",
    tk: "漢字だけ",
    th: "ひらがなだけ",
    ts: "2文字以下",
    td: "数字",
    tb: "！か？",
    tn: "「の」",
    tm: "「・」",
    w1: "L/n",
    om: "劇場版",
    oc: "コラボ",
    c4: "DECO*27",
  };

  it.each(Object.entries(OLD_KEYS))("前からある鍵 %s は同じお題（%s）のまま", (key, text) => {
    expect(odaiDefFromKey(key, MUSICS).text).toBe(text);
  });

  it.each([
    // 前の版（#212）の buildOdaiCard で作ったコード。NORMAL（埋めたマス 4 つ）と MASTER（作者が多い）
    ["NORMAL", "OD1:c23.te*.rm.rw.c50.rs.c111.w5*.l1.l0.oc.c105.F.c25*.w4.u5.tn.tm.th.tk*.rk.u1.c48.tb.rn", 4],
    ["MASTER", "OD1:c45.u3.c80.tn.c236.ra.c142.c148.c14.w2.c237.rn.F.w0.c57.ts.c205.w1.c39.ry.c69.c183.rw.tm.td", 0],
  ] as const)("前の版のコード（%s）がそのまま開ける", (_, old, cleared) => {
    const card = decodeOdaiSeed(old, MUSICS);
    expect(card.filter((c) => c !== "FREE" && c.cleared)).toHaveLength(cleared);
    expect(encodeOdaiSeed(card)).toBe(old);
  });

  it("鍵はすべて違い、新しいお題もコードで往復できる", () => {
    const keys = allOdaiDefs(MUSICS).map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    const fresh = ["s1", "s23", "v6", "va", "m2", "mo", "m3", "a2021", "a0", "da", "dm32", "dm33", "dl26", "de28", "dn7", "kl", "t4", "tx", "ty", "gn", "yi", "yn", "y4", "c4"];
    const code = `OD1:${[...fresh.slice(0, 12), "F", ...fresh.slice(12)].join(".")}`;
    const card = decodeOdaiSeed(code, MUSICS);
    expect(card.map((c) => (c === "FREE" ? "F" : c.odai.key))).toEqual([...fresh.slice(0, 12), "F", ...fresh.slice(12)]);
    expect(encodeOdaiSeed(card)).toBe(code);
  });

  it("知らない鍵・0 始まりの年・キャラにいない id は分かるエラー", () => {
    expect(() => odaiDefFromKey("a02021", MUSICS)).toThrow(/お題/);
    expect(() => odaiDefFromKey("s99", MUSICS)).toThrow(/お題/);
    expect(() => odaiDefFromKey("a2099", MUSICS)).toThrow(/年/);
  });
});

// ---- 1 マスに収まるか ----

describe("札と文言の長さ（320px の 1 マスは約 50px、札は 12px）", () => {
  it("札は全角 4 字の幅まで（MASTER・EXPERT のような英字は幅で数える）、文言は 10 まで", () => {
    for (const o of CANDIDATES) {
      expect(textEm(o.caption), o.caption).toBeLessThanOrEqual(MAX_CAPTION_EM);
      expect(textEm(o.text), o.text).toBeLessThanOrEqual(MAX_TEXT_EM);
    }
  });

  it("作者以外のお題の区切りは、どれも全角 4 字の幅まで（語の途中で折れない）", () => {
    for (const o of CANDIDATES.filter((x) => x.kind !== "creator")) {
      for (const chunk of o.chunks) expect(textEm(chunk), `${o.key} ${chunk}`).toBeLessThanOrEqual(4);
      expect(o.chunks.join("")).toBe(o.text);
    }
  });

  it("候補の割合はすべて DEEP_MIN_RATE〜MAX_RATE", () => {
    for (const o of CANDIDATES) {
      expect(o.rate).toBeGreaterThanOrEqual(DEEP_MIN_RATE);
      expect(o.rate).toBeLessThanOrEqual(MAX_RATE);
    }
  });
});
