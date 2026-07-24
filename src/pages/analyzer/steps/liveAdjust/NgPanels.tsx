import type { CalculationResultV6 } from "../../lib/calculator";
import {
  EXHAUSTIVE_MAX_LIVES,
  MAX_PT_VALUES_PER_PLAN,
  type MultiLiveAdjustResult,
} from "../../lib/multiLiveAdjust";
import { isModeAOk, isModeBOk } from "./modeStatus";
import type { Step2Mode } from "./types";

/**
 * Step2（ライブ調整）のNG案内。2モード対応（R5・docs §3）。
 *
 * A（songFixed・曲固定/ボーナス掃引）とB（bonusFixed・曲可変/複数回）は対等な2モードで、
 * calculator.ts の合成 status は A∨B。片方が組めない状態でも、もう一方で組めるなら
 * その旨を案内してワンタップで切り替えられるようにする（「第2候補」降格の是正）。
 *
 * isModeAOk / isModeBOk は modeStatus.ts に一本化（R6 §6-4）。LiveAdjustStep.tsx の
 * footer 表示もここを import するので、二重実装で判定が食い違うことはない。
 */

const MODE_LABEL: Record<Step2Mode, string> = {
  songFixed: "任意の曲＋ボーナス選択",
  bonusFixed: "入力編成＋曲選択",
};

export function AdjustmentNgPanels({
  live,
  multi,
  mode,
  onSwitchMode,
}: {
  live: CalculationResultV6["liveAdjustment"];
  multi: MultiLiveAdjustResult | undefined;
  mode: Step2Mode;
  onSwitchMode: (mode: Step2Mode) => void;
}) {
  const aOk = isModeAOk(live);
  const bOk = isModeBOk(live, multi);
  const currentOk = mode === "songFixed" ? aOk : bOk;
  const otherOk = mode === "songFixed" ? bOk : aOk;
  const otherMode: Step2Mode = mode === "songFixed" ? "bonusFixed" : "songFixed";

  if (currentOk) return null;

  return (
    <div className="mb-6 space-y-3">
      {mode === "songFixed" && (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          このポイント（<span className="font-bold">{live.requiredPt.toLocaleString()} Pt</span>
          ）は0〜{live.maxLiveBonus}炊きでは調整できません。
        </div>
      )}

      {mode === "bonusFixed" && multi?.reason === "OVER_CAP" && (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          調整には最低{" "}
          <span className="font-bold tabular-nums">
            {(multi.requiredLiveCount ?? 0).toLocaleString()}
          </span>{" "}
          回のライブが必要で、上限 {multi.liveCountCap} 回を超えます。
        </div>
      )}

      {mode === "bonusFixed" && multi?.reason === "NO_EXACT" && (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          {multi.landability === "UNREACHABLE" ? (
            live.requiredPt > 0 && multi.minPtPerLive > 0 && live.requiredPt < multi.minPtPerLive ? (
              <>
                必要調整量{" "}
                <span className="font-bold tabular-nums">{live.requiredPt.toLocaleString()} Pt</span>{" "}
                は1回のライブの最小獲得{" "}
                <span className="font-bold tabular-nums">
                  {multi.minPtPerLive.toLocaleString()} Pt
                </span>{" "}
                を下回るため着地できません。
              </>
            ) : (
              <>
                この残額はどの組合せでも着地できません（1回の最小獲得{" "}
                <span className="font-bold tabular-nums">
                  {multi.minPtPerLive.toLocaleString()} Pt
                </span>
                ・{EXHAUSTIVE_MAX_LIVES}回以内の全組合せを確認済み）。
              </>
            )
          ) : (
            <>
              探索範囲（最大{multi.liveCountCap}回・Pt値{MAX_PT_VALUES_PER_PLAN}種類の組合せ）では
              厳密一致が見つかりませんでした。
            </>
          )}
        </div>
      )}

      {otherOk && (
        <div className="rounded-xl bg-neu p-4 text-center text-sm shadow-neu-inset">
          <span className="font-bold" style={{ color: "var(--unit-color)" }}>
            {MODE_LABEL[otherMode]}
          </span>{" "}
          のモードなら組めます。
          <button
            type="button"
            className="mt-2 block w-full font-bold underline"
            style={{ color: "var(--unit-color)" }}
            onClick={() => onSwitchMode(otherMode)}
          >
            このモードに切り替える
          </button>
        </div>
      )}
    </div>
  );
}
