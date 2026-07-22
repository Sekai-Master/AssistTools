import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { DurationInput } from "../../components/ui/DurationInput";
import { TakiInput } from "../../components/ui/TakiInput";
import { useAnalyzerMusics } from "../analyzer/useAnalyzerMusics";
import { useGaugeInputs } from "../refresh/useGaugeInputs";
import { GaugeInputsPanel } from "../refresh/GaugeInputsPanel";
import { fmtDuration } from "../refresh/lib/format";
import { Stat } from "../refresh/Stat";
import {
  type WorkParams,
  type WorkSegment,
  computeWork,
  hourlyRateAt,
  minutesForTarget,
} from "./lib/worktime";

let seq = 0;
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `w-${seq++}`;

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");

export default function WorkTimeCalculator() {
  const { musics, aliases, loading, error: dataError } = useAnalyzerMusics();
  const inputs = useGaugeInputs(musics);
  const { selectedSong, overhead } = inputs;

  const [hourlyRate, setHourlyRate] = useState("500000");
  const [refTaki, setRefTaki] = useState(5);
  const [startLB, setStartLB] = useState("0");
  const [mode, setMode] = useState<"forward" | "reverse">("forward");
  const [segments, setSegments] = useState<WorkSegment[]>([{ id: newId(), taki: 5, minutes: 60 }]);
  const [targetPt, setTargetPt] = useState("");
  const [revTaki, setRevTaki] = useState(5);

  // 時速較正: ここまでの稼働と獲得ポイントから時速を算出
  const [analMin, setAnalMin] = useState(60);
  const [analPts, setAnalPts] = useState("");
  const [analTaki, setAnalTaki] = useState(5);
  const analRate = useMemo(() => {
    const pts = Number(analPts);
    return pts > 0 && analMin > 0 ? Math.round((pts / analMin) * 60) : null;
  }, [analPts, analMin]);

  const params: WorkParams = useMemo(
    () => ({
      hourlyRate: Number(hourlyRate) || 0,
      refTaki,
      songLengthSec: selectedSong?.musicTime || 74.8,
      overheadSec: overhead,
      startingLB: Number(startLB) || 0,
    }),
    [hourlyRate, refTaki, selectedSong, overhead, startLB]
  );

  const result = useMemo(() => computeWork(segments, params), [segments, params]);
  const revMinutes = useMemo(
    () => minutesForTarget(Number(targetPt) || 0, params, revTaki),
    [targetPt, params, revTaki]
  );

  const setTaki = (id: string, taki: number) =>
    setSegments((s) => s.map((g) => (g.id === id ? { ...g, taki } : g)));
  const setMinutes = (id: string, minutes: number) =>
    setSegments((s) => s.map((g) => (g.id === id ? { ...g, minutes } : g)));
  const addSeg = () => setSegments((s) => [...s, { id: newId(), taki: 5, minutes: 60 }]);
  const remove = (id: string) => setSegments((s) => s.filter((g) => g.id !== id));
  const move = (id: string, dir: -1 | 1) =>
    setSegments((s) => {
      const i = s.findIndex((g) => g.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const longRun = result.totalMinutes >= 16 * 60;
  const secPerPlay = (selectedSong?.musicTime || 74.8) + overhead;
  const revLB = Math.round(((revMinutes * 60) / secPerPlay) * revTaki);

  return (
    <ToolPage unit="n25" title="必要稼働時間計算" icon="schedule">
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}

      <GaugeInputsPanel
        inputs={inputs}
        musics={musics}
        aliases={aliases}
        loading={loading}
        showGauge={false}
      />

      <Panel title="時速・焚き数">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="点数時速" htmlFor="wt-rate" hint="この焚き数での実測 pt/時（例: 500000）">
            <div className="flex items-center gap-1">
              <NeuInput
                id="wt-rate"
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
          <Field label="所持ライボ" htmlFor="wt-lb" hint="開始時のライブボーナス数">
            <NeuInput
              id="wt-lb"
              inputMode="numeric"
              value={startLB}
              onChange={(e) => setStartLB(onlyDigits(e.target.value))}
              className="max-w-24"
            />
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
      </Panel>

      <SegmentedControl
        options={[
          { value: "forward", label: "順算（→到達pt）" },
          { value: "reverse", label: "逆算（→必要時間）" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "forward" ? (
        <>
          <Panel title="焚き数 × 稼働時間">
            <ul className="space-y-2">
              {result.rows.map((r, i) => (
                <li
                  key={r.segment.id}
                  className="neu-raised flex flex-wrap items-center gap-3 p-3 text-sm"
                >
                  <span className="text-slate-500">焚き</span>
                  <TakiInput value={r.segment.taki} onChange={(v) => setTaki(r.segment.id, v)} />
                  <DurationInput value={r.segment.minutes} onChange={(v) => setMinutes(r.segment.id, v)} />
                  <span className="text-xs text-slate-400">
                    {Math.round(r.points).toLocaleString()}pt / ライボ{Math.round(r.lb)}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="flex flex-col leading-none">
                      <button
                        type="button"
                        aria-label="上へ"
                        disabled={i === 0}
                        onClick={() => move(r.segment.id, -1)}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label="下へ"
                        disabled={i === result.rows.length - 1}
                        onClick={() => move(r.segment.id, 1)}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label="削除"
                      onClick={() => remove(r.segment.id)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <NeuButton onClick={addSeg} className="mt-3 !py-1.5">
              ＋ 組み合わせ追加
            </NeuButton>
          </Panel>

          <Panel title="結果">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="到達ポイント" value={result.totalPoints.toLocaleString()} />
              <Stat label="総稼働" value={fmtDuration(result.totalMinutes)} />
              <Stat
                label="消費ライボ"
                value={`${result.totalLB}`}
                sub={`自然回復 ${Math.floor(result.naturalLB)}`}
              />
              <Stat
                label="必要な石"
                value={result.requiredCrystals.toLocaleString()}
                sub={result.requiredCrystals > 0 ? "クリスタル" : "所持で足りる"}
              />
            </div>
            {longRun && (
              <p className="mt-4 text-xs text-amber-600">
                ⚠ 稼働が長め。リフレッシュゲージが100%で止まる可能性（約16時間前後で頭打ち）。
                「リフレッシュゲージ」ツールで確認を。
              </p>
            )}
          </Panel>
        </>
      ) : (
        <Panel title="目標から逆算">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="目標ポイント" htmlFor="wt-target">
              <NeuInput
                id="wt-target"
                inputMode="numeric"
                value={targetPt}
                onChange={(e) => setTargetPt(onlyDigits(e.target.value))}
                placeholder="例: 100000000"
                className="max-w-48"
              />
            </Field>
            <Field label="焚き数">
              <TakiInput value={revTaki} onChange={setRevTaki} />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="必要稼働時間" value={targetPt ? fmtDuration(revMinutes) : "—"} sub={`焚き${revTaki}で`} />
            <Stat label="必要ライボ" value={targetPt ? `${revLB}` : "—"} />
            <Stat
              label="この焚きの時速"
              value={Math.round(hourlyRateAt(params, revTaki)).toLocaleString()}
              sub="pt/時"
            />
          </div>
          {targetPt && revMinutes > 16 * 60 && (
            <p className="mt-4 text-xs text-amber-600">
              ⚠ 必要稼働が16時間超。リフレッシュゲージの100%（続行不可）を挟むので実際はさらに時間が要ります。
            </p>
          )}
        </Panel>
      )}
    </ToolPage>
  );
}
