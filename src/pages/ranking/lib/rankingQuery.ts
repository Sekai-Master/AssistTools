/**
 * 効率曲ランキングの URL の指定（2026-11-25）。投稿のリンクから一発で並びを開くために、
 * **読み込み時にだけ**読む（URL へは書き戻さない）。保存値より優先する。
 *
 *   ?tab=manual|solo|auto|challenge … 開くタブ（RankingMode の値そのまま）
 *   ?by=hour|play                    … 「ひとりで」の並べ方（時間あたり／1回あたり）
 *
 * ★ 不正な値（知らない文字・大文字・空）は無視して、その項目だけ指定なしとして扱う。
 */
import type { RankingMode, SoloBy } from "./efficiency";

export interface RankingQuery {
  tab?: RankingMode;
  by?: SoloBy;
}

const TABS: readonly RankingMode[] = ["manual", "solo", "auto", "challenge"];
const BYS: readonly SoloBy[] = ["hour", "play"];

const pick = <T extends string>(list: readonly T[], v: string | null): T | undefined =>
  list.find((x) => x === v);

export function parseRankingQuery(params: URLSearchParams): RankingQuery {
  const tab = pick(TABS, params.get("tab"));
  const by = pick(BYS, params.get("by"));
  return { ...(tab ? { tab } : {}), ...(by ? { by } : {}) };
}
