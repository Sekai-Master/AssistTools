import type { CalculationResultV6 } from "../../lib/calculator";
import {
  EXHAUSTIVE_MAX_LIVES,
  MAX_PT_VALUES_PER_PLAN,
  type MultiLiveAdjustResult,
} from "../../lib/multiLiveAdjust";
import type { UniversalPlan } from "../../plan/types";

/**
 * ライブ調整のNG案内3種（ON経路の汎用NG・OFF経路のOVER_CAP・OFF経路のNO_EXACT）。
 * JSX・条件・文言はリファクタ前と1文字も変えていない（ON経路の凍結挙動を壊さないため）。
 */
export function AdjustmentNgPanels({
  live,
  multi,
  selectedPlan,
}: {
  live: CalculationResultV6["liveAdjustment"];
  multi: MultiLiveAdjustResult | undefined;
  selectedPlan: UniversalPlan | null;
}) {
  return (
    <>
      {/* OFF時のNG案内は multi 側（理由つき）を正とし、従来の汎用NGパネルはON時のみ出す。 */}
      {!multi && live.status === "NG" && !selectedPlan ? (
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          このポイント（<span className="font-bold">{live.requiredPt.toLocaleString()} Pt</span>
          ）は0〜{live.maxLiveBonus}炊きでは調整できません。
          <span className="mt-1 block">
            目標ポイントを数ポイントずらすか、下の一覧から編成を組み替えるプランを選んでください。
          </span>
        </div>
      ) : null}

      {multi && multi.reason === "OVER_CAP" && (
        <div className="mb-6 rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          調整には最低{" "}
          <span className="font-bold tabular-nums">
            {(multi.requiredLiveCount ?? 0).toLocaleString()}
          </span>{" "}
          回のライブが必要で、上限 {multi.liveCountCap} 回を超えます。
          <span className="mt-1 block">
            マイセカイを利用する設定に切り替えるか、通常の周回で差分を縮めてから再計算してください。
          </span>
        </div>
      )}

      {/* NO_EXACT でも第2候補が成立していれば着地はできる。その場合まで赤エラーを出すと
          「検証済み(isVerified)なのに失敗表示」という矛盾になるので、深刻度を出し分ける。 */}
      {/* NO_EXACT は landability で出し分ける（R3-3 / P2-7）。
          UNREACHABLE: 原理的に着地不能。「数ポイントずらす」では絶対に抜けられないため、
          必要なズラし幅を具体値で断定形で示す。
          UNPROVEN: 探索範囲内で見つからなかっただけなので、断定を避けた案内にする。 */}
      {multi && multi.reason === "NO_EXACT" && (
        <div
          className={`mb-6 rounded-xl p-6 text-center text-sm ${
            live.status === "OK" ? "bg-neu text-slate-500 shadow-neu-inset" : "bg-rose-50 text-rose-600"
          }`}
        >
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
                <span className="mt-1 block">
                  目標を {live.requiredPt.toLocaleString()} Pt 下げて調整不要にするか、
                  {(multi.minPtPerLive - live.requiredPt).toLocaleString()} Pt 以上引き上げてください。
                </span>
              </>
            ) : (
              <>
                この残額はどの組合せでも着地できません（1回の最小獲得{" "}
                <span className="font-bold tabular-nums">
                  {multi.minPtPerLive.toLocaleString()} Pt
                </span>
                ・{EXHAUSTIVE_MAX_LIVES}回以内の全組合せを確認済み）。
                <span className="mt-1 block">
                  {live.status === "OK"
                    ? "下の編成組み替え案（第2候補）で着地できます。"
                    : "目標を見直して再計算するか、下の編成組み替え案（第2候補）を確認してください。"}
                </span>
              </>
            )
          ) : (
            <>
              探索範囲（最大{multi.liveCountCap}回・Pt値{MAX_PT_VALUES_PER_PLAN}種類の組合せ）では
              厳密一致が見つかりませんでした。
              <span className="mt-1 block">
                {live.status === "OK"
                  ? "下の編成組み替え案（第2候補）で着地できます。"
                  : "目標を見直して再計算するか、下の編成組み替え案（第2候補）を確認してください。"}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
