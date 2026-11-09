/**
 * お題ビンゴの作者の表（src/pages/bingo/creatorMembers.json）に足すべき作者を見つける。
 * 前の配信データに無かった作者 ID のうち、名前が連名・表記違いらしいもの（× & 、 / feat. 括弧などを含む、
 * ほかの作者の名前を含む・ほかの作者の名前に含まれる）を返す。表に載っていれば返さない。
 *
 * ★ 足し忘れても、その作者の曲が自分のマスでしか埋まらない（表を作る前と同じ）だけ。
 *   だから更新は止めず、警告に出して人が表に足す。
 * ★ 前からいる作者は見ない。名前の一部が重なるだけの別人（Sta と Orangestar など）で毎日警告が出ないように。
 */

const COLLAB_MARK = /[×✕&＆＋+、,，/／・(（]|\sx\s|feat\.|prod\.?\s*by|remix/i;
/** これより短い名前は、ほかの名前に含まれるかを見ない（xi・kz が別人の名前に含まれる）。 */
const MIN_CONTAINED = 3;

/** 比べるための名前: 空白を除き、全角・半角と大文字・小文字をそろえる。 */
const bare = (s) => (typeof s === "string" ? s.normalize("NFKC").replace(/\s/g, "").toLowerCase() : "");

/** 公開曲の作者 ID → 名前（同じ ID の表記が揺れたら最初の曲の表記）。 */
function creatorsOf(musics) {
  const out = new Map();
  for (const m of Array.isArray(musics) ? musics : []) {
    if (!m || m.published === false || !Number.isInteger(m.creatorArtistId) || !m.artistName) continue;
    if (!out.has(m.creatorArtistId)) out.set(m.creatorArtistId, m.artistName);
  }
  return out;
}

/**
 * @param {object[]} current 今回の配信データ（transformedMusics.json の中身）
 * @param {object[] | null} previous 前回の配信データ。無ければ何も返さない（全員が新しく見えるので）
 * @param {Iterable<number>} listedIds 表に載っている作者 ID
 * @returns {{ id: number, name: string }[]}
 */
export function newCreatorSuspects(current, previous, listedIds) {
  if (!Array.isArray(previous)) return [];
  const before = new Set(creatorsOf(previous).keys());
  const listed = new Set(listedIds);
  const now = creatorsOf(current);
  const others = [...now].map(([id, name]) => [id, bare(name)]);
  const out = [];
  for (const [id, name] of now) {
    if (before.has(id) || listed.has(id)) continue;
    const b = bare(name);
    const overlaps = others.some(
      ([oid, o]) =>
        oid !== id && ((o.length >= MIN_CONTAINED && b.includes(o)) || (b.length >= MIN_CONTAINED && o.includes(b)))
    );
    if (COLLAB_MARK.test(name) || overlaps) out.push({ id, name });
  }
  return out;
}
