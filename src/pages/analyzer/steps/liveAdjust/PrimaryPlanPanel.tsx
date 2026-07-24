import { useMemo } from "react";
import { NeuButton } from "../../../../components/ui/NeuButton";
import { maxEfficientLiveBonus } from "../../lib/calcLivePt";
import type { MultiLiveAdjustResult, MultiLivePlan } from "../../lib/multiLiveAdjust";
import { formatApproxMinutes, type TimeForBase } from "../../lib/planDuration";
import { FormationUnchangedBadge, LbCostNote } from "./badges";
import { CompactPlanCard } from "./CompactPlanCard";
import { AdoptedUnitLine } from "./UnitLine";
import { candidatesForBase, resolveSong } from "./musicHelpers";
import { isSingleSong } from "./planSelection";
import { sortPlansByDuration } from "./planOrdering";
import type { Adopted, SuggestMusic } from "./types";

/**
 * Step2 モードB（入力編成＋曲選択）の候補パネル。
 *
 * R5 でトグル（同一曲縛り・スコア0イベ乙）と画像出力ボタンを削除し、
 * 「同じ回数で組み替える」「本数を増やしてLBを節約」の2本立てだった代替案を
 * 所要時間順の単一リストへ統合した（ブリーフ「Step2は時間短い順」対応）。
 * frontier/sameCountVariants の値・順序自体は一切変更せず、表示側で写像するだけ。
 */

interface CandidateRef {
  adopted: Adopted;
  plan: MultiLivePlan;
}

function buildCandidates(multi: MultiLiveAdjustResult): CandidateRef[] {
  const refs: CandidateRef[] = [];
  if (multi.plans.length > 0) refs.push({ adopted: { kind: "primary" }, plan: multi.plans[0] });
  multi.sameCountVariants.forEach((plan, index) => refs.push({ adopted: { kind: "variant", index }, plan }));
  multi.plans.slice(1).forEach((plan, index) => refs.push({ adopted: { kind: "frontier", index: index + 1 }, plan }));
  return refs;
}

function sameAdopted(a: Adopted, b: Adopted): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "primary") return true;
  return a.index === (b as { index: number }).index;
}

export function PrimaryPlanPanel({
  multi,
  adopted,
  onAdopt,
  musics,
  songByBase,
  onPickSong,
  timeForBase,
  finalRunPt,
}: {
  multi: MultiLiveAdjustResult;
  adopted: Adopted;
  onAdopt: (a: Adopted) => void;
  musics: ReadonlyArray<SuggestMusic>;
  songByBase: Record<number, string>;
  onPickSong: (basePoint: number) => void;
  timeForBase: TimeForBase;
  finalRunPt: number;
}) {
  const candidates = useMemo(() => buildCandidates(multi), [multi]);
  const ordered = useMemo(() => {
    const byPlan = new Map(candidates.map((c) => [c.plan, c.adopted] as const));
    return sortPlansByDuration(
      candidates.map((c) => c.plan),
      timeForBase
    ).map((o) => ({ ...o, adopted: byPlan.get(o.plan) as Adopted }));
  }, [candidates, timeForBase]);

  if (candidates.length === 0) return null;

  const current = candidates.find((c) => sameAdopted(c.adopted, adopted)) ?? candidates[0];
  const chosen = current.plan;
  const isPrimary = adopted.kind === "primary";
  const currentDurationSec = ordered.find((o) => sameAdopted(o.adopted, current.adopted))?.durationSec;
  const efficientLiveBonus = maxEfficientLiveBonus();
  const rest = ordered.filter((o) => !sameAdopted(o.adopted, current.adopted));

  return (
    <div className="mb-6">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        入力編成＋曲選択（第1候補）
      </div>

      <div className="rounded-xl bg-neu p-4 shadow-neu-inset">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-bold" style={{ color: "var(--unit-color)" }}>
            {isPrimary ? "▸ 主役" : "▸ 採択中"}
          </span>
          {isSingleSong(chosen) && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">同一曲</span>
          )}
          <span className="text-xs tabular-nums text-slate-500">
            {chosen.liveCount}回 ・{" "}
            {currentDurationSec !== undefined ? formatApproxMinutes(currentDurationSec) : "所要時間不明"}
            {" "}・ LB合計{chosen.lbCost}
            <LbCostNote lbCost={chosen.lbCost} /> ・ 合計 {chosen.totalPt.toLocaleString()} Pt
          </span>
          <FormationUnchangedBadge />
          {!isPrimary && (
            <NeuButton className="!px-2.5 !py-1 !text-[11px]" onClick={() => onAdopt({ kind: "primary" })}>
              推奨案（主役）に戻す
            </NeuButton>
          )}
        </div>
        {chosen.lbCost > 10 && (
          <p className="mb-2 text-xs text-amber-600">
            所持上限10個を超えるため、自然回復待ちまたはクリスタルでの補充が必要です
          </p>
        )}
        {finalRunPt > 0 && (
          <p className="mb-2 text-xs text-slate-500">
            ラストプレイ分（選ぶプランにより 0〜10）を含めた総LB消費は {chosen.lbCost}〜
            {chosen.lbCost + 10}
          </p>
        )}
        <ol className="space-y-3">
          {chosen.units.map((u, j) => {
            const cands = candidatesForBase(musics, u.basePoint);
            const picked = resolveSong(cands, songByBase, u.basePoint);
            return (
              <AdoptedUnitLine
                key={j}
                u={u}
                candidates={cands}
                chosen={picked}
                onPick={() => onPickSong(u.basePoint)}
              />
            );
          })}
        </ol>
        <p className="mt-3 text-[11px] text-slate-400">
          全{chosen.liveCount}
          回それぞれでスコア帯（2万点幅）を狙い撃つ必要があります。帯を外した回のLBは戻りません。
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          LBは{efficientLiveBonus}炊きまでは1個あたりの効率が同じです（2024-09-28改定）。
          それより少ない炊き数で止めると、本数が増えるぶん時間を余計に使います。
        </p>
      </div>

      {rest.length > 0 && (
        <details className="mt-3 rounded-xl bg-neu p-3 shadow-neu-sm">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">
            他の候補（所要時間が短い順・{rest.length}件）
          </summary>
          <div className="mt-2 space-y-2">
            {rest.map((o, i) => (
              <CompactPlanCard
                key={i}
                plan={o.plan}
                timeLabel={o.durationSec !== undefined ? formatApproxMinutes(o.durationSec) : "所要時間不明"}
                adopted={false}
                singleSong={isSingleSong(o.plan)}
                onAdopt={() => onAdopt(o.adopted)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
