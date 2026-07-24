import { planDurationSec, type TimeForBase } from "../../lib/planDuration";
import type { MultiLivePlan } from "../../lib/multiLiveAdjust";

/**
 * Step2 モードB（入力編成＋曲選択）の提示順。
 *
 * 「本数を変える」軸（multi.plans）と「本数を変えずに内訳を変える」軸
 * （multi.sameCountVariants）は lib 側では別配列で管理されているが、UIでは
 * 「実行に何分かかるか」という単一の軸で1列に提示する（docs §3-B）。
 * lib の配列自体は並べ替えない（frontier セマンティクス禁じ手）。ここは
 * 統合後の候補集合を写像し、時間昇順（不明は末尾）に並べ替えるだけの純関数。
 */
export interface OrderedPlan {
  plan: MultiLivePlan;
  durationSec: number | undefined;
}

/** 安定ソート（Array.prototype.sort は ES2019 以降 stable）。同時間の並びは入力順を保つ。 */
export function sortPlansByDuration(
  plans: readonly MultiLivePlan[],
  timeForBase: TimeForBase
): OrderedPlan[] {
  const withTime: OrderedPlan[] = plans.map((plan) => ({
    plan,
    durationSec: planDurationSec(plan, timeForBase),
  }));
  const known = withTime.filter((p) => p.durationSec !== undefined);
  const unknown = withTime.filter((p) => p.durationSec === undefined);
  known.sort((a, b) => (a.durationSec as number) - (b.durationSec as number));
  return [...known, ...unknown];
}
