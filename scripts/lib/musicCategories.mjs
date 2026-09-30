/**
 * 楽曲のカテゴリ（MV の種類）を組み立てる。使っているのはビンゴの出題の絞り込み。
 *
 * ★ 2026-08 下旬、上流（Sekai-World/sekai-master-db-diff）が musics.json の `categories` を
 *   **musicCategories.json（1行 = 1曲 × 1カテゴリ）に切り出した**。以前の
 *   `m.categories.map()` が TypeError になり、楽曲データの更新が 8/28 から止まっていた（#130）。
 *
 * 取り先は次の順:
 *   1. 別表（musicCategories.json）の行
 *   2. musics.json の欄（2026-09-30 時点で 241・290 の2曲だけ残っていて、別表に行が無い）
 *   3. 直前の配信データ（transformedMusics.json）のカテゴリ
 *
 * ★ 3 があるのは、別表が取れない・形が変わったときに**ビンゴのためだけに更新全体を
 *   止めない**ため。新曲の追加や公開日の反映は、ほぼ全ツールが待っている。
 *   代わりに、別表から取れた曲が半分を切ったら呼び出し側が警告を出す（MIN_TABLE_SHARE）。
 */

/** 別表から取れた曲がこの割合を切ったら、上流の形が変わったとみなして警告する。 */
export const MIN_TABLE_SHARE = 0.5;

/** 別表の行を musicId → カテゴリ名の配列（行の id 順）にまとめる。壊れた行は捨てる。 */
export function indexMusicCategories(rows) {
  const valid = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.musicId != null && typeof r.musicCategoryName === "string")
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const index = new Map();
  for (const r of valid) {
    index.set(r.musicId, [...(index.get(r.musicId) ?? []), r.musicCategoryName]);
  }
  return index;
}

/** 直前の配信データ（transformedMusics.json の中身）を、数値の曲 id → カテゴリに直す。 */
export function previousCategoriesFrom(snapshot) {
  const out = new Map();
  for (const m of Array.isArray(snapshot) ? snapshot : []) {
    if (!m || !Array.isArray(m.categories)) continue;
    const id = Number(m.id);
    if (Number.isInteger(id)) out.set(id, m.categories.filter((c) => typeof c === "string"));
  }
  return out;
}

/**
 * サイトで使う形に直す（以前の欄のときと同じ規則）。
 * - mv は 3D の MV なので mv_3d に読み替える
 * - 同じカテゴリは1つにまとめる（別表には 2D MV が2本ある曲の行が2つある）
 * - image（静止画）は、ほかのカテゴリがあるときは落とす
 */
function normalize(names) {
  const unique = [...new Set(names.map((c) => (c === "mv" ? "mv_3d" : c)))];
  return unique.includes("image") && unique.length > 1 ? unique.filter((c) => c !== "image") : unique;
}

/**
 * 1曲ぶんのカテゴリと、どこから取ったか。
 * @returns {{ categories: string[], source: "table" | "field" | "previous" | "none" }}
 */
export function resolveCategories(music, index, previous) {
  const fromTable = index.get(music.id);
  if (fromTable) return { categories: normalize(fromTable), source: "table" };
  if (Array.isArray(music.categories)) return { categories: normalize(music.categories), source: "field" };
  const kept = previous.get(music.id);
  if (kept) return { categories: kept, source: "previous" };
  return { categories: [], source: "none" };
}

/** 別表から取れた曲の割合。曲が無ければ 1（警告しない）。 */
export function tableShare(results) {
  if (results.length === 0) return 1;
  return results.filter((r) => r.source === "table").length / results.length;
}
