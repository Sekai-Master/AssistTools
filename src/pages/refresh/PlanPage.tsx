import { useMemo, useRef, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { DurationInput } from "../../components/ui/DurationInput";
import { TakiInput } from "../../components/ui/TakiInput";
import { Stat } from "./Stat";
import { fmtClock, fmtDuration, nearestRoundTime, parseClock } from "./lib/format";
import { drawPlanCanvas, type PlanCanvasData } from "./lib/planCanvas";
import { type WorkParams, hourlyRateAt } from "../worktime/lib/worktime";

let seq = 0;
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p-${seq++}`;
const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");

interface Slot {
  id: string;
  taki: number;
  minutes: number;
}

/**
 * 周回プラン（点数）。現在ポイントを起点に、稼働枠（焚き数×時間）を積んで
 * 各枠の獲得ポイントと累積の到達ポイント・到達時刻を出す。時速は焚き数倍率でスケール。
 */
export default function PlanPage() {
  const [currentPt, setCurrentPt] = useState("");
  const [hourlyRate, setHourlyRate] = useState("500000");
  const [refTaki, setRefTaki] = useState(5);
  const [startTime, setStartTime] = useState(nearestRoundTime);
  const [slots, setSlots] = useState<Slot[]>([{ id: newId(), taki: 5, minutes: 60 }]);

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
      songLengthSec: 0,
      overheadSec: 0,
      startingLB: 0,
    }),
    [hourlyRate, refTaki]
  );

  const startMOD = parseClock(startTime);
  const base = Number(currentPt) || 0;

  const rows = useMemo(() => {
    let minute = 0;
    let cumulative = base;
    return slots.map((s) => {
      const startMinute = minute;
      const points = Math.round(hourlyRateAt(params, s.taki) * (s.minutes / 60));
      cumulative += points;
      minute += s.minutes;
      return { slot: s, startMinute, endMinute: minute, points, cumulative };
    });
  }, [slots, params, base]);

  const totalMinutes = rows.length ? rows[rows.length - 1].endMinute : 0;
  const finalPt = rows.length ? rows[rows.length - 1].cumulative : base;
  const gained = finalPt - base;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const buildCanvasData = (): PlanCanvasData => {
    const accent =
      (canvasRef.current &&
        getComputedStyle(canvasRef.current).getPropertyValue("--unit-color").trim()) ||
      "#33ccbb";
    return {
      heading: "周回プラン（到達ポイント）",
      songTitle: `到達 ${finalPt.toLocaleString()}`,
      meta: [
        `時速 ${(Number(hourlyRate) || 0).toLocaleString()} pt/時（基準焚き${refTaki}）`,
        `現在 ${base.toLocaleString()} pt ・ 開始 ${startTime || "—"}`,
      ],
      rows: rows.map((r) => ({
        time: `${fmtClock(startMOD, r.startMinute)} → ${fmtClock(startMOD, r.endMinute)}`,
        label: `焚き${r.slot.taki}　${fmtDuration(r.slot.minutes)}`,
        sub: `+${r.points.toLocaleString()} pt`,
        percent: r.cumulative.toLocaleString(),
        warn: false,
      })),
      summary: [
        { label: "到達ポイント", value: finalPt.toLocaleString() },
        { label: "獲得", value: `+${gained.toLocaleString()}` },
        { label: "総稼働", value: fmtDuration(totalMinutes) },
        { label: "終了時刻", value: fmtClock(startMOD, totalMinutes) },
      ],
      accent,
      rightColW: 150,
    };
  };

  const copyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await drawPlanCanvas(canvas, buildCanvasData());
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setNotice("画像をコピーしました。");
      } catch {
        setNotice("コピーに失敗しました（保存をお使いください）。");
      }
    }, "image/png");
  };

  const saveImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await drawPlanCanvas(canvas, buildCanvasData());
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "plan-points.png";
    a.click();
  };

  const setTaki = (id: string, taki: number) =>
    setSlots((s) => s.map((g) => (g.id === id ? { ...g, taki } : g)));
  const setMinutes = (id: string, minutes: number) =>
    setSlots((s) => s.map((g) => (g.id === id ? { ...g, minutes } : g)));
  const addSlot = () => setSlots((s) => [...s, { id: newId(), taki: 5, minutes: 60 }]);
  const remove = (id: string) => setSlots((s) => s.filter((g) => g.id !== id));
  const move = (id: string, dir: -1 | 1) =>
    setSlots((s) => {
      const i = s.findIndex((g) => g.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <ToolPage unit="vs" title="周回プラン" icon="event_note">
      <Panel title="設定">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="現在ポイント" htmlFor="pl-cur" hint="ここを起点に稼働枠ぶんを加算します">
            <NeuInput
              id="pl-cur"
              inputMode="numeric"
              value={currentPt}
              onChange={(e) => setCurrentPt(onlyDigits(e.target.value))}
              placeholder="例: 128311005"
              className="max-w-44"
            />
          </Field>
          <Field label="開始時刻" htmlFor="pl-start" className="!space-y-1">
            <NeuInput
              id="pl-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="max-w-32"
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
      </Panel>

      <Panel title="稼働枠（焚き数 × 時間）">
        <div className="mb-3 flex flex-wrap gap-2">
          <NeuButton onClick={addSlot} className="!py-1.5">
            ＋ 稼働枠
          </NeuButton>
          {slots.length > 0 && (
            <NeuButton onClick={() => setSlots([])} className="!py-1.5 !text-xs">
              クリア
            </NeuButton>
          )}
        </div>

        {slots.length === 0 ? (
          <p className="text-sm text-slate-500">「＋稼働枠」で焚き数×時間を積むと、各枠の獲得ptと累積到達ptが出ます。</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.slot.id} className="neu-raised flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="w-24 shrink-0 text-[11px] leading-tight text-slate-500">
                  {fmtClock(startMOD, r.startMinute)}
                  <br />↓ {fmtClock(startMOD, r.endMinute)}
                </div>
                <span className="text-slate-500">焚き</span>
                <TakiInput value={r.slot.taki} onChange={(v) => setTaki(r.slot.id, v)} />
                <DurationInput value={r.slot.minutes} onChange={(v) => setMinutes(r.slot.id, v)} />
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">+{r.points.toLocaleString()}pt</div>
                  <div className="font-bold" style={{ color: "var(--unit-color)" }}>
                    {r.cumulative.toLocaleString()}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex flex-col leading-none">
                    <button
                      type="button"
                      aria-label="上へ"
                      disabled={i === 0}
                      onClick={() => move(r.slot.id, -1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="下へ"
                      disabled={i === rows.length - 1}
                      onClick={() => move(r.slot.id, 1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="削除"
                    onClick={() => remove(r.slot.id)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {slots.length > 0 && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="到達ポイント" value={finalPt.toLocaleString()} />
              <Stat label="獲得ポイント" value={`+${gained.toLocaleString()}`} />
              <Stat label="総稼働" value={fmtDuration(totalMinutes)} />
              <Stat label="終了時刻" value={fmtClock(startMOD, totalMinutes)} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <NeuButton onClick={copyImage} className="!py-1.5">
                画像をコピー
              </NeuButton>
              <NeuButton onClick={saveImage} className="!py-1.5">
                画像を保存
              </NeuButton>
              {notice && <span className="text-xs text-slate-500">{notice}</span>}
            </div>
            <canvas
              ref={canvasRef}
              aria-hidden
              className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px"
            />
          </>
        )}
      </Panel>
    </ToolPage>
  );
}
