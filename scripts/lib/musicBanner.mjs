/**
 * バナー曲: そのキャラがバナー（主役）の回のイベント曲。曲ごとにバナーのキャラの id を持たせる。
 * 使うのはビンゴの曲を選ぶ小窓の「バナー曲だけ」（src/pages/bingo/BingoSongPicker.tsx）。
 *
 * 持ち主の決定（Nori 2026-11-10）: 「そのキャラがバナーの回のイベント曲。ワールドリンクの曲は入れない」。
 * マスタの 3 つの表で引ける: eventMusics（回 → 曲）・eventStories（回 → バナーのキャラのユニット）・
 * gameCharacterUnits（ユニット → キャラ）。2026-11-10 で 134 曲、瑞希は 7 曲（化けの花・ロウワー など）。
 *
 * ★ ワールドリンクは worldBlooms.json の回で外す。第 3 弾（202〜）は eventStories にバナーが無いので
 *   それだけでも入らないが、第 1・2 弾（112〜179）の回はバナーがある（今は eventMusics に行が無いだけ）。
 *   上流があとで行を足すと、外す手が無いと黙って入る。
 *
 * ★ ビンゴでしか使わないので、取れない・形が変わった・バナー曲が急に減った日も更新全体は止めず、
 *   直前の配信データの値を引き継ぐ（歌唱・カテゴリと同じ考え方）。誤ったデータも出さない。
 * ★ ログには件数と表の名前だけを出す（Actions のログは誰でも読める。マスタには告知前の回が先に入る
 *   ことがあり、回の番号やキャラを書くと告知前の主役が漏れる）。
 */

/** バナー曲が直前の配信データからこの割合以上減ったら、上流の形が変わったとみなして引き継ぐ。 */
export const MAX_BANNER_DROP = 0.1;

/**
 * ゲームのキャラの番号の上限（1〜26。VIRTUAL SINGER の 6 人を含む）。
 * ★ 読む側（src/pages/bingo/useBingoMusics.ts）と同じ値。片方だけ広げると、範囲外の値が書かれて引き継がれ続ける
 */
const MAX_CHARACTER_ID = 26;

const isId = (v) => Number.isInteger(v) && v > 0;
const isCharacterId = (v) => isId(v) && v <= MAX_CHARACTER_ID;

/** 表ごとの「使える行」。1 つも無ければ形が変わったとみなす（項目の名前が変わると全部の行が落ちる）。 */
const VALID_ROW = {
  eventMusics: (r) => isId(r?.eventId) && isId(r?.musicId),
  eventStories: (r) => isId(r?.eventId) && isId(r?.bannerGameCharacterUnitId),
  gameCharacterUnits: (r) => isId(r?.id) && isCharacterId(r?.gameCharacterId),
  worldBlooms: (r) => isId(r?.eventId),
};

/** 取れなかった表は null で渡す。どれか 1 つでも使えなければ、全部をやめる（半端な索引を作らない）。 */
function validTables(tables) {
  const rows = {};
  const problems = [];
  for (const [name, valid] of Object.entries(VALID_ROW)) {
    const table = tables?.[name];
    if (table == null) problems.push(`${name}.json が取れない`);
    else if (!Array.isArray(table) || !table.some(valid)) problems.push(`${name}.json の形が変わった`);
    else rows[name] = table.filter(valid);
  }
  return problems.length > 0 ? { problem: problems.join("・") } : { rows, problem: null };
}

/**
 * 4 つの表から、曲 id → バナーのキャラ id の索引を作る。
 * - ワールドリンクの回・バナーの無い回・表に無いユニットの曲は入れない。壊れた行は捨てる
 * - 1 曲が 2 回のイベントに出たら、先の回のバナーにする（後の回は始まっていないことがある）。数を duplicates で返す
 * @returns {{ index: Map<number, number> | null, problem: string | null, duplicates: number }}
 */
export function indexBannerCharacters(tables) {
  const { rows, problem } = validTables(tables);
  if (!rows) return { index: null, problem, duplicates: 0 };
  const worldLink = new Set(rows.worldBlooms.map((r) => r.eventId));
  const bannerUnitOf = new Map(
    rows.eventStories.filter((r) => !worldLink.has(r.eventId)).map((r) => [r.eventId, r.bannerGameCharacterUnitId])
  );
  const characterOf = new Map(rows.gameCharacterUnits.map((r) => [r.id, r.gameCharacterId]));
  const index = new Map();
  let duplicates = 0;
  for (const r of [...rows.eventMusics].sort((a, b) => a.eventId - b.eventId)) {
    const character = characterOf.get(bannerUnitOf.get(r.eventId));
    if (character === undefined) continue;
    if (index.has(r.musicId)) {
      duplicates += 1;
      continue;
    }
    index.set(r.musicId, character);
  }
  return { index, problem: null, duplicates };
}

/** 直前の配信データ（transformedMusics.json の中身）から、数の曲 id → バナーのキャラ。 */
export function previousBannersFrom(snapshot) {
  const out = new Map();
  for (const m of Array.isArray(snapshot) ? snapshot : []) {
    const id = Number(m?.id);
    if (Number.isInteger(id) && isCharacterId(m.bannerCharacterId)) out.set(id, m.bannerCharacterId);
  }
  return out;
}

const pick = (ids, map) => new Map(ids.filter((id) => map.has(id)).map((id) => [id, map.get(id)]));

/**
 * 公開済みの曲（数の id）ごとのバナーと、どこから取ったか。
 * 表が使えれば表から（表が正。行の消えた曲は引き継がない）。表が取れない・形が変わった・
 * バナー曲が直前より MAX_BANNER_DROP 以上減った日は、直前の配信データの値を引き継ぐ。
 * ★ 引き継いでいる間は、その日に公開された新曲にバナーが付かず、直前の値が基準のまま動かない
 *   （人が上流を確かめて直すまで、毎日引き継いで警告する）。件数しか見ないので、キャラの入れ替わりなど
 *   数の変わらない崩れは拾えない
 * ★ 公開前の曲は ids に入れない（呼ぶ側が公開済みの曲だけを渡す）。始まっていない回の曲は公開前なので、ここで落ちる
 * @returns {{ bannerOf: Map<number, number>, source: "table" | "previous", problem: string | null, tableCount: number, previousCount: number }}
 */
export function resolveBanners(ids, built, previous) {
  const kept = pick(ids, previous);
  const fresh = built.index ? pick(ids, built.index) : null;
  const counts = { tableCount: fresh ? fresh.size : 0, previousCount: kept.size };
  if (!fresh) return { bannerOf: kept, source: "previous", problem: built.problem, ...counts };
  if (kept.size > 0 && fresh.size <= kept.size * (1 - MAX_BANNER_DROP)) {
    const problem = `バナー曲が直前の ${kept.size}曲から ${fresh.size}曲に減った`;
    return { bannerOf: kept, source: "previous", problem, ...counts };
  }
  return { bannerOf: fresh, source: "table", problem: null, ...counts };
}

/** 楽曲データに書く項目。バナーの無い曲には項目自体を書かない（ほぼ全ツールが読むファイルを軽く保つ）。 */
export function bannerFields(musicId, bannerOf) {
  const character = bannerOf.get(musicId);
  return character === undefined ? {} : { bannerCharacterId: character };
}
