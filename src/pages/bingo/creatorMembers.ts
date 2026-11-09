/**
 * 作者のお題で、連名の曲と表記違いの作者をまとめる（Nori 2026-11-09）。
 * 楽曲データの作者は作者 ID ごとで、「まらしぃ×じん×堀江晶太(kemu)」はじんとは別の ID になっている。
 * そのままだと新人類を遊んでも「じん」のマスが埋まらないので、作者 ID ごとのメンバーを手で確かめた表
 * （creatorMembers.json）で引く。
 *
 * - メンバーは、ひとりの作者 ID がある人はその ID、無い人は名前（Ado・TeddyLoid など）
 * - マスの作者のメンバーが全員、曲の作者に入っていれば埋まる（じんのマスは新人類で埋まる。
 *   「ビートまりお×まろん」のマスは「ビートまりお×まろん×まらしぃ」の曲でも埋まる）
 * - メンバーがほかの作者 ID ひとつだけの行は、表記が違うだけの同じ人（feat. 初音ミク・(くらげP) など）。
 *   お題の一覧にはメンバーの側だけを出す
 * - 表に無い作者は、自分の ID の曲だけ（今までと同じ）。新しい連名は毎日の更新が警告に出す
 *   （scripts/lib/creatorMembers.mjs）
 */
import table from "./creatorMembers.json";

type Member = number | string;

const MEMBERS = new Map<number, ReadonlySet<Member>>(table.map((r) => [r.id, new Set<Member>(r.members)]));

/** 作者 cellId のマスを、作者 songId の曲で埋めてよいか。 */
export function creatorCovers(cellId: number, songId: number): boolean {
  if (cellId === songId) return true;
  const want = MEMBERS.get(cellId);
  const have = MEMBERS.get(songId);
  // 表に無い作者の曲は、その作者のマスと、その作者の表記違いのマスでだけ埋まる
  if (!have) return want !== undefined && want.size === 1 && want.has(songId);
  if (!want) return have.has(cellId);
  for (const m of want) if (!have.has(m)) return false;
  return true;
}

/** ほかの作者 ID と表記が違うだけの同じ人なら、その作者 ID（お題の一覧にはそちらを出す）。違えば null。 */
export function creatorAliasOf(id: number): number | null {
  const want = MEMBERS.get(id);
  if (!want || want.size !== 1) return null;
  const [only] = want;
  return typeof only === "number" && only !== id ? only : null;
}

/** 表記違いの作者のお題の鍵（c49）なら、同じ人のお題の鍵（c36）。ほかの鍵は null。 */
export function sameCreatorKey(key: string): string | null {
  const m = /^c([1-9]\d*)$/.exec(key);
  const same = m ? creatorAliasOf(Number(m[1])) : null;
  return same === null ? null : `c${same}`;
}
