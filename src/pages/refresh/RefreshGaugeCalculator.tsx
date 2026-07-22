import { useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { useAnalyzerMusics } from "../analyzer/useAnalyzerMusics";
import { liveGaugePercent } from "./lib/gaugeModel";
import { planSession, playsPerHour } from "./lib/sessionPlanner";
import type { Segment } from "./lib/timeline";
import { fmtDuration, nearestRoundTime } from "./lib/format";
import { Stat } from "./Stat";
import { useGaugeInputs } from "./useGaugeInputs";
import { GaugeInputsPanel } from "./GaugeInputsPanel";
import { PlanTimeline } from "./PlanTimeline";

/**
 * リフレッシュゲージ。現在ゲージから「100%まで何分・持続ペース」を確認しつつ、
 * プレイ/休憩/マイセカイのブロックを積んでゲージ推移を計画できる（休憩込み・画像化）。
 * 点数の見積もりは別ツール「必要稼働時間」「周回プラン」。
 */
export default function RefreshGaugeCalculator() {
  const { musics, aliases, loading, error: dataError } = useAnalyzerMusics();
  const inputs = useGaugeInputs(musics);
  const { selectedSong, rc, gaugePct, overhead, ratePerHour } = inputs;

  const [segments, setSegments] = useState<Segment[]>([]);
  const [startTime, setStartTime] = useState(nearestRoundTime);

  const len = selectedSong?.musicTime ?? 0;
  const hasLen = len > 0;
  const plan = selectedSong && hasLen ? planSession(rc, len, gaugePct, overhead) : null;
  const perPlayPct = rc ? liveGaugePercent(rc) : 0;
  const songRate = hasLen ? playsPerHour(len, overhead) : 0;

  return (
    <ToolPage unit="wxs" title="リフレッシュゲージ計算機" icon="battery_charging_full">
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}

      <GaugeInputsPanel inputs={inputs} musics={musics} aliases={aliases} loading={loading} />

      {plan ? (
        <>
          <Panel title="ゲージ">
            <div className="relative h-6 w-full overflow-hidden rounded-full bg-neu shadow-neu-inset">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${gaugePct}%`,
                  backgroundImage:
                    "linear-gradient(90deg, color-mix(in srgb, var(--unit-color) 82%, #fff), var(--unit-color))",
                }}
              />
            </div>
            <p className="mt-2 text-center text-sm text-slate-500">
              現在{" "}
              <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                {gaugePct}%
              </span>
              　/　この曲は1回で +{perPlayPct.toFixed(2)}%
            </p>
          </Panel>

          <Panel title="この曲で走ると">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat
                label="100%まで"
                value={`${plan.runwayPlays}回`}
                sub={`約 ${fmtDuration(plan.runwayMinutes)}`}
              />
              <Stat label="この曲のペース" value={`${songRate.toFixed(0)}回/時`} />
              <Stat
                label="持続ペース"
                value={`${plan.sustainablePerHour.toFixed(0)}回/時`}
                sub={`休憩 約${plan.restSharePercent.toFixed(0)}%`}
              />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              100%（続行不可）に達したら、非活動30分ごとに8.33%回復。全回復まで
              {fmtDuration(plan.fullRecoveryMinutes)}。下で休憩込みの推移も計画できます。
            </p>
          </Panel>

          <PlanTimeline
            selectedSong={selectedSong}
            overhead={overhead}
            startPercent={gaugePct}
            ratePerHour={ratePerHour}
            segments={segments}
            setSegments={setSegments}
            startTime={startTime}
            setStartTime={setStartTime}
          />
        </>
      ) : (
        !loading && (
          <Panel>
            <p className="text-sm text-slate-500">
              {selectedSong && !hasLen
                ? "この曲は長さデータが無いため周回時間を計算できません（別の曲を選んでください）。"
                : "曲を選ぶと計算します。"}
            </p>
          </Panel>
        )
      )}
    </ToolPage>
  );
}
