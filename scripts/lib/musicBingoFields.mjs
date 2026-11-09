/**
 * お題ビンゴのお題に使う、曲ごとの項目を組み立てる（歌う人・歌唱 ver.・3DMV の人数・作詞と作曲・譜面）。
 *
 * ★ transformedMusics.json はほぼ全ツールが読むので、**値が無い・偽の項目は書かない**。
 *   読む側（src/pages/bingo/useBingoMusics.ts）は、項目が無ければ「無い・偽」として扱う。
 *
 * ★ 歌唱の表（musicVocals.json）はビンゴでしか使わないので、取れない日も更新全体は止めない。
 *   表が空なら、直前の配信データの値を引き継ぐ（コラボの名前・カテゴリと同じ考え方）。
 *   無いまま書くと、ビンゴのテスト（ボーカルのお題）が落ちて毎日の更新が止まる。
 */

/** 歌唱 ver. の種類のうち、エイプリルフールの ver.（2022 年の 1 回だけ。年が増えたら足す）。 */
const APRIL_FOOL_TYPES = new Set(["april_fool_2022"]);

/**
 * 歌う人に数えない ver. の種類。コネクトライブ ver.（streaming_live、2026-11-10 で 36 件・33 曲）。
 * 持ち主の判断（Nori 2026-11-10）: 「コネクトライブは有償ライブイベントで見てない人からすると全く知らないということもままある」。
 * 歌う人（singers）にも 1 つの ver. の人数（maxSingers）にも入れない。エイプリルフールの ver. は今どおり数える。
 * ★ これを外すと、オーバーライド（521）の瑞希・ミクのように、コネクトライブ ver. だけで歌う人が
 *   お題の「ボーカル」と曲の検索の「歌う人」に入る（2026-11-10 で 26 曲で歌う人が増えていた）
 */
const NOT_SINGER_TYPES = new Set(["streaming_live"]);

const isPositive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * 歌唱の表を musicId → { singers, maxSingers, hasAprilFool } にまとめる。
 * - singers: その曲のすべての ver.（アナザーボーカル込み）で歌うゲームのキャラの id。重複なし・昇順。
 *   ゲームの外の歌い手（outside_character）は入れない
 * - maxSingers: 1 つの ver. で歌う人数の最大（ゲームの外の歌い手も数える）
 * - hasAprilFool: エイプリルフールの ver. がある
 * 壊れた行（musicId が無い・characters が配列でない）と、歌う人に数えない ver.（NOT_SINGER_TYPES）の行は捨てる。
 */
export function indexVocals(rows) {
  const acc = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.musicId == null || !Array.isArray(r.characters)) continue;
    if (NOT_SINGER_TYPES.has(r.musicVocalType)) continue;
    const cur = acc.get(r.musicId) ?? { singers: new Set(), maxSingers: 0, hasAprilFool: false };
    for (const c of r.characters) {
      if (c && c.characterType === "game_character" && Number.isInteger(c.characterId)) cur.singers.add(c.characterId);
    }
    cur.maxSingers = Math.max(cur.maxSingers, r.characters.length);
    if (APRIL_FOOL_TYPES.has(r.musicVocalType)) cur.hasAprilFool = true;
    acc.set(r.musicId, cur);
  }
  const index = new Map();
  for (const [musicId, v] of acc) {
    index.set(musicId, {
      singers: [...v.singers].sort((a, b) => a - b),
      maxSingers: v.maxSingers,
      hasAprilFool: v.hasAprilFool,
    });
  }
  return index;
}

/** 直前の配信データ（transformedMusics.json の中身）から、数値の曲 id → 歌唱の項目を引く。 */
export function previousVocalsFrom(snapshot) {
  const out = new Map();
  for (const m of Array.isArray(snapshot) ? snapshot : []) {
    if (!m) continue;
    const id = Number(m.id);
    if (!Number.isInteger(id)) continue;
    out.set(id, {
      singers: Array.isArray(m.singers) ? m.singers.filter((c) => Number.isInteger(c)) : [],
      maxSingers: isPositive(m.maxSingers) ? m.maxSingers : 0,
      hasAprilFool: m.hasAprilFool === true,
    });
  }
  return out;
}

/**
 * 1 曲ぶんの歌唱の項目と、どこから取ったか。表が空（取れなかった日）なら直前の配信データから。
 * @returns {{ fields: object, source: "table" | "previous" | "none" }}
 */
export function resolveVocals(musicId, index, previous) {
  const v = index.size > 0 ? index.get(musicId) : previous.get(musicId);
  if (!v) return { fields: {}, source: "none" };
  return {
    fields: compact({ singers: v.singers, maxSingers: v.maxSingers, hasAprilFool: v.hasAprilFool }),
    source: index.size > 0 ? "table" : "previous",
  };
}

/** 比べるための名前: 空白を除き、全角・半角と大文字・小文字をそろえる（ＤＥＣＯ＊２７ と DECO*27 は同じ人）。 */
const bare = (s) => (typeof s === "string" ? s.normalize("NFKC").replace(/\s/g, "").toLowerCase() : "");

/**
 * musics.json の 1 曲から: 3DMV で踊る人数と、作詞と作曲が別の人か。
 * 作詞・作曲は、空白を除いて両方とも空でなく、違う人のときだけ true。
 */
export function musicFields(music) {
  const lyricist = bare(music?.lyricist);
  const composer = bare(music?.composer);
  return compact({
    dancerCount: music?.dancerCount,
    lyricsByOther: lyricist !== "" && composer !== "" && lyricist !== composer,
  });
}

/**
 * 難易度別の行（musicDifficulty → 行）から: EXPERT・MASTER・APPEND のレベルと、MASTER のノーツ数。
 * APPEND は譜面がある曲だけ。
 */
export function difficultyFields(byDifficulty) {
  const d = byDifficulty ?? {};
  return compact({
    expertLevel: d.expert?.playLevel,
    masterLevel: d.master?.playLevel,
    appendLevel: d.append?.playLevel,
    masterNotes: d.master?.totalNoteCount,
  });
}

/** 値が無い・偽・0・空の配列の項目を落とす（JSON を軽く保つ）。 */
export function compact(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => {
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "number") return isPositive(v);
      return v === true || (typeof v === "string" && v !== "");
    })
  );
}

/**
 * 整形した JSON。ただし数の配列（singers）は 1 行に詰める。
 * 2 字下げのまま書くと 1 曲で 10 行近く増え、ほぼ全ツールが読むファイルが膨らむ。
 * ★ 文字列を正規表現で書き換えると曲名の中の "[1, 2]" まで変わるので、
 *   いったん目印の文字列に置き換えてから戻す。
 */
export function stringifyCompactNumbers(value) {
  const MARK = "\u0000nums:";
  const json = JSON.stringify(
    value,
    // NaN・Infinity を含む配列は JSON の数で書けないので、詰めずにそのまま（JSON.stringify が null にする）
    (_, v) => (Array.isArray(v) && v.length > 0 && v.every((x) => Number.isFinite(x)) ? `${MARK}${v.join(",")}` : v),
    2
  );
  return json.replace(/"\\u0000nums:([-\d.,e+]*)"/g, (_, body) => `[${body.split(",").join(", ")}]`);
}
