import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { DurationInput } from "../../components/ui/DurationInput";
import { TakiInput } from "../../components/ui/TakiInput";
import { useAnalyzerMusics } from "../analyzer/useAnalyzerMusics";
import { useGaugeInputs } from "./useGaugeInputs";
import { GaugeInputsPanel } from "./GaugeInputsPanel";
import { PlanTimeline } from "./PlanTimeline";

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");

/**
 * 周回プラン（全部入り）。曲・現在ゲージ・周回ペースに加えて、点数時速・焚き数を設定し、
 * タイムラインに 曲プレイ／休憩／マイセカイ を積んで「各時点の時刻・ゲージ・累積到達ポイント」を出す。
 * ゲージが100%に達したブロックはムダ時間ぶんが加点されない（ゲージと点数が連動）。
 */
export default function PlanPage() {
  const { musics, aliases, loading, error: dataError } = useAnalyzerMusics();
  const inputs = useGaugeInputs(musics);
  const { selectedSong, overhead, gaugePct, ratePerHour } = inputs;

  const [currentPt, setCurrentPt] = useState("");
  const [hourlyRate, setHourlyRate] = useState("500000");
  const [refTaki, setRefTaki] = useState(5);

  // 時速較正: ここまでの稼働と獲得ポイントから時速を算出
  const [analMin, setAnalMin] = useState(60);
  const [analPts, setAnalPts] = useState("");
  const [analTaki, setAnalTaki] = useState(5);
  const analRate = useMemo(() => {
    const pts = Number(analPts);
    return pts > 0 && analMin > 0 ? Math.round((pts / analMin) * 60) : null;
  }, [analPts, analMin]);

  const points = useMemo(
    () => ({
      startPoints: Number(currentPt) || 0,
      hourlyRate: Number(hourlyRate) || 0,
      refTaki,
    }),
    [currentPt, hourlyRate, refTaki]
  );

  return (
    <ToolPage unit="vs" title="周回プラン" icon="event_note">
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}

      <GaugeInputsPanel inputs={inputs} musics={musics} aliases={aliases} loading={loading} />

      <Panel title="ポイント設定">
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

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500">
            ここまでの実績から時速を較正する
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <DurationInput value={analMin} onChange={setAnalMin} />
            <span className="text-slate-500">で</span>
            <NeuInput
              inputMode="numeric"
              value={analPts}
              onChange={(e) => setAnalPts(onlyDigits(e.target.value))}
              placeholder="獲得pt"
              className="max-w-44 text-center"
            />
            <span className="text-slate-500">pt（焚き</span>
            <TakiInput value={analTaki} onChange={setAnalTaki} />
            <span className="text-slate-500">）</span>
            <NeuButton
              className="!py-1 !text-xs"
              disabled={!analRate}
              onClick={() => {
                if (!analRate) return;
                setHourlyRate(String(analRate));
                setRefTaki(analTaki);
              }}
            >
              → 時速{analRate ? analRate.toLocaleString() : "?"}にする
            </NeuButton>
          </div>
        </details>

        <p className="mt-3 text-xs text-slate-500">
          「上の曲」を選んで下の「＋1時間」等でプレイを積むと、各枠の焚き数・獲得ptと累積到達ptが出ます。
          ゲージが100%に達すると、そのぶんは加点されません（休憩・マイセカイで回復を）。
        </p>
      </Panel>

      <PlanTimeline
        points={points}
        selectedSong={selectedSong}
        overhead={overhead}
        startPercent={gaugePct}
        ratePerHour={ratePerHour}
      />
    </ToolPage>
  );
}
