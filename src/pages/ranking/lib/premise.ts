/**
 * 効率曲ランキングの表のすぐ上に出す「何を前提にした数字か」の 1 行（2026-11-19 表の直し）。
 *
 * ★ 既定（自分の条件を入れていない）でも Pt/時 などの絶対値を出すので、前提を表の上で言う。
 *   表の下の注にしか無いと、スクショした表だけが前提なしで出回る。
 * ★ 数字は計算に実際に使っている params から作る（文字に数字を書かない）。
 *   既定なら DEFAULT_PARAMS と DEFAULT_OVERHEAD_SEC の値になる。焚き数は既定でも保存値に従い、
 *   総合力は上限で頭打ちにした値になるので、DEFAULT_PARAMS を直接読まない。
 */
import type { EfficiencyParams, RankingMode } from "./efficiency";

export interface PremiseOptions {
  /** ロスが表の数字を動かすか（みんなで・ひとりで・オートの区間モード）。動かさないなら書かない。 */
  showLoss: boolean;
  /** ロスが実測前の仮の値か。**印だけで決める**（値が 33 かどうかでは決めない）。 */
  provisionalLoss: boolean;
}

/** 前提の部品。画面では「・」でつなぐ。 */
export function premiseParts(
  params: EfficiencyParams,
  mode: RankingMode,
  opts: PremiseOptions,
): string[] {
  const parts = [`総合力${(params.power / 10000).toFixed(1)}万`];
  // チャレンジライブはイベントの外。ボーナスも焚き数も効かない
  if (mode !== "challenge") parts.push(`ボーナス${params.bonus}%`, `${params.taki}焚き`);
  parts.push(`スキル${params.skillLeader}/${params.skillTotal}`);
  if (opts.showLoss) parts.push(`ロス${params.overheadSec}秒${opts.provisionalLoss ? "（仮）" : ""}`);
  return parts;
}
