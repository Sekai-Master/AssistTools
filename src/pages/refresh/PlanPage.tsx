import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { TakiInput } from "../../components/ui/TakiInput";
import { ProfileBar, SaveToProfile } from "../../components/ui/ProfileBar";
import { RateCalibrator } from "./RateCalibrator";
import { useAnalyzerMusics } from "../analyzer/useAnalyzerMusics";
import { useGaugeInputs } from "./useGaugeInputs";
import { GaugeInputsPanel } from "./GaugeInputsPanel";
import { PlanTimeline } from "./PlanTimeline";
import { nearestRoundTime } from "./lib/format";
import type { Segment } from "./lib/timeline";
import { type SavedPlan, deletePlan, listPlans, savePlan } from "./lib/planStorage";

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");

/**
 * 周回プラン（全部入り）。曲・現在ゲージ・周回ペースに加えて、点数時速・焚き数を設定し、
 * タイムラインに 曲プレイ／休憩／マイセカイ を積んで「各時点の時刻・ゲージ・累積到達ポイント」を出す。
 * ゲージが100%に達したブロックはムダ時間ぶんが加点されない（ゲージと点数が連動）。
 * 組んだプランは名前付きでローカル保存（呼び出し・削除）できる。
 */
export default function PlanPage() {
  const { musics, aliases, loading, error: dataError } = useAnalyzerMusics();
  const inputs = useGaugeInputs(musics);
  const { selectedSong, overhead, gaugePct, ratePerHour } = inputs;

  const [currentPt, setCurrentPt] = useState("");
  const [hourlyRate, setHourlyRate] = useState("500000");
  const [refTaki, setRefTaki] = useState(5);

  // タイムライン本体（保存対象なので親で保持）
  const [segments, setSegments] = useState<Segment[]>([]);
  const [startTime, setStartTime] = useState(nearestRoundTime);

  // 保存プラン
  const [saved, setSaved] = useState<SavedPlan[]>(() => listPlans());
  const [planName, setPlanName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const points = useMemo(
    () => ({
      startPoints: Number(currentPt) || 0,
      hourlyRate: Number(hourlyRate) || 0,
      refTaki,
    }),
    [currentPt, hourlyRate, refTaki]
  );

  const doSave = () => {
    const name = planName.trim();
    if (!name) {
      setNotice("プラン名を入れてください。");
      return;
    }
    const plan: SavedPlan = {
      name,
      savedAt: Date.now(),
      startTime,
      segments,
      inputs: {
        songId: inputs.songId,
        gauge: inputs.gauge,
        rate: inputs.rate,
        currentPt,
        hourlyRate,
        refTaki,
      },
    };
    setSaved(savePlan(plan));
    setNotice(`「${name}」を保存しました。`);
  };

  const loadPlan = (plan: SavedPlan) => {
    setSegments(plan.segments);
    setStartTime(plan.startTime);
    inputs.setSongId(plan.inputs.songId);
    inputs.setGauge(plan.inputs.gauge);
    inputs.setRate(plan.inputs.rate);
    setCurrentPt(plan.inputs.currentPt);
    setHourlyRate(plan.inputs.hourlyRate);
    setRefTaki(plan.inputs.refTaki);
    setPlanName(plan.name);
    setNotice(`「${plan.name}」を呼び出しました。`);
  };

  const removePlan = (name: string) => {
    setSaved(deletePlan(name));
    setNotice(`「${name}」を削除しました。`);
  };

  return (
    <ToolPage morphKey="tool:plan" title="周回プラン" icon="event_note">
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}

      <GaugeInputsPanel inputs={inputs} musics={musics} aliases={aliases} loading={loading} />

      <Panel title="ポイント設定">
        {/* 時速・基準焚き数は稼働時間計算と同じ値。片方だけ編成から呼べると、
            もう片方で打ち直すことになるので両方に置く。 */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ProfileBar
            apply={(p) => {
              if (p.hourlyRate != null) setHourlyRate(String(p.hourlyRate));
              if (p.taki != null) setRefTaki(p.taki);
            }}
          />
          <SaveToProfile
            collect={() => ({ hourlyRate: Number(hourlyRate) || undefined, taki: refTaki })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="現在ポイント" htmlFor="pl-cur" hint="ここを起点に加算します">
            <NeuInput
              id="pl-cur"
              inputMode="numeric"
              value={currentPt}
              onChange={(e) => setCurrentPt(onlyDigits(e.target.value))}
              placeholder="例: 128311005"
              className="max-w-44"
            />
          </Field>
          <Field label="点数時速" htmlFor="pl-rate" hint="この焚き数での実測 pt/時">
            <div className="flex items-center gap-1">
              <NeuInput
                id="pl-rate"
                inputMode="numeric"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(onlyDigits(e.target.value))}
                className="max-w-44"
              />
              <span className="text-sm text-slate-500">pt/時</span>
            </div>
          </Field>
          <Field label="基準焚き数" hint="上の時速を出した焚き数">
            <TakiInput value={refTaki} onChange={setRefTaki} />
          </Field>
        </div>

        <RateCalibrator
          hourlyRate={hourlyRate}
          setHourlyRate={setHourlyRate}
          refTaki={refTaki}
          setRefTaki={setRefTaki}
          pace={inputs.rate}
          setPace={inputs.setRate}
        />

        <p className="mt-3 text-xs text-slate-500">
          「上の曲」を選んで下の「＋稼働」で枠を積むと、各枠の焚き数・獲得ptと累積到達ptが出ます。
          ゲージが100%に達すると、そのぶんは加点されません（休憩・マイセカイで回復を）。
        </p>
      </Panel>

      <Panel title="プランの保存・呼び出し">
        <div className="flex flex-wrap items-center gap-2">
          <NeuInput
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="プラン名（例: 後半戦フル稼働）"
            className="max-w-64"
            aria-label="プラン名"
          />
          <NeuButton onClick={doSave} className="!py-1.5" disabled={segments.length === 0}>
            この内容を保存
          </NeuButton>
          {notice && <span className="text-xs text-slate-500">{notice}</span>}
        </div>

        {saved.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">
            保存したプランはこの端末（ブラウザ）に残ります。まずタイムラインを組んで名前を付けて保存。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {saved.map((p) => (
              <li
                key={p.name}
                className="neu-raised flex flex-wrap items-center gap-3 p-2.5 text-sm"
              >
                <span className="font-bold text-slate-700">{p.name}</span>
                <span className="text-xs text-slate-400">{p.segments.length}ブロック</span>
                <div className="ml-auto flex items-center gap-2">
                  <NeuButton onClick={() => loadPlan(p)} className="!py-1 !text-xs">
                    呼び出し
                  </NeuButton>
                  <button
                    type="button"
                    aria-label="削除"
                    onClick={() => removePlan(p.name)}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <PlanTimeline
        points={points}
        selectedSong={selectedSong}
        overhead={overhead}
        startPercent={gaugePct}
        ratePerHour={ratePerHour}
        segments={segments}
        setSegments={setSegments}
        startTime={startTime}
        setStartTime={setStartTime}
      />
    </ToolPage>
  );
}
