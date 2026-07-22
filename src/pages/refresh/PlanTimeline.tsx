import { useMemo, useRef, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { DurationInput } from "../../components/ui/DurationInput";
import { Stat } from "./Stat";
import { type Segment, simulateTimeline } from "./lib/timeline";
import { drawPlanCanvas, type PlanCanvasData } from "./lib/planCanvas";
import { getRefreshConstant } from "./lib/refreshConstant";
import { fmtClock, fmtDuration, nearestRoundTime, parseClock } from "./lib/format";
import type { AnalyzerMusic } from "../analyzer/useAnalyzerMusics";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

let seq = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `seg-${seq++}`;
}

interface Props {
  /** ブロック追加に使う現在選択中の曲 */
  selectedSong: AnalyzerMusic | undefined;
  /** 周回ペース較正済みのオーバーヘッド秒 */
  overhead: number;
  /** プラン開始時点のゲージ%（上の「現在のゲージ」を引き継ぐ） */
  startPercent: number;
  /** エビ基準の周回ペース(回/時)。画像のメタ表示に使う。 */
  ratePerHour: number;
}

/**
 * 周回プランのタイムライン。プレイ(時間指定)/休憩ブロックを積み、各時点の時刻とゲージを表示。
 * イベランのシフトが1時間・30分区切りなので、プレイは時間で足す。
 */
export function PlanTimeline({ selectedSong, overhead, startPercent, ratePerHour }: Props) {
  const [startTime, setStartTime] = useState(nearestRoundTime);
  const [segments, setSegments] = useState<Segment[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startMOD = parseClock(startTime);
  const result = useMemo(
    () => simulateTimeline(segments, startPercent, overhead),
    [segments, startPercent, overhead]
  );

  const canAddPlay = !!selectedSong && selectedSong.musicTime > 0;

  const addPlay = (minutes: number) => {
    if (!canAddPlay || !selectedSong) return;
    setSegments((s) => [
      ...s,
      {
        id: newId(),
        kind: "play",
        songId: selectedSong.id,
        title: selectedSong.title,
        jacketLink: selectedSong.jacketLink,
        refreshConstant: getRefreshConstant(selectedSong.basePoint, selectedSong.id),
        songLengthSec: selectedSong.musicTime,
        minutes,
      },
    ]);
  };
  const addRest = (minutes: number) =>
    setSegments((s) => [...s, { id: newId(), kind: "rest", minutes }]);
  const addMysekai = () =>
    setSegments((s) => [...s, { id: newId(), kind: "mysekai", stamina: 30, minutes: 10 }]);
  const setPlayMinutes = (id: string, minutes: number) =>
    setSegments((s) => s.map((g) => (g.id === id && g.kind === "play" ? { ...g, minutes } : g)));
  const setRestMinutes = (id: string, minutes: number) =>
    setSegments((s) => s.map((g) => (g.id === id && g.kind === "rest" ? { ...g, minutes } : g)));
  const setMysekaiStamina = (id: string, stamina: number) =>
    setSegments((s) => s.map((g) => (g.id === id && g.kind === "mysekai" ? { ...g, stamina } : g)));
  const setMysekaiMinutes = (id: string, minutes: number) =>
    setSegments((s) => s.map((g) => (g.id === id && g.kind === "mysekai" ? { ...g, minutes } : g)));
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

  const buildCanvasData = (): PlanCanvasData => {
    const accent =
      (canvasRef.current &&
        getComputedStyle(canvasRef.current).getPropertyValue("--unit-color").trim()) ||
      "#ff9900";
    return {
      songTitle: selectedSong?.title ?? "リフレッシュゲージ",
      meta: [
        `ペース: ${ratePerHour}回/時（エビ基準）`,
        `開始 ${startTime || "—"}・ゲージ ${startPercent}%`,
      ],
      rows: result.points.map((pt) => {
        const seg = pt.segment;
        const time = `${fmtClock(startMOD, pt.startMinute)} → ${fmtClock(startMOD, pt.endMinute)}`;
        if (seg.kind === "play") {
          const warn = pt.wastedPlays >= 1;
          return {
            time,
            label: `${seg.title}　${fmtDuration(seg.minutes)}`,
            sub:
              `≈${Math.round(pt.plays)}回` +
              (warn ? ` / 約${Math.round(pt.wastedMinutes)}分ムダ` : ""),
            percent: `${pt.endPercent.toFixed(1)}%`,
            warn,
            jacket: `${JACKET_BASE}${seg.jacketLink}`,
          };
        }
        if (seg.kind === "mysekai") {
          return {
            time,
            label: `マイセカイ採取　スタミナ${seg.stamina}`,
            sub: fmtDuration(seg.minutes),
            percent: `${pt.endPercent.toFixed(1)}%`,
            warn: false,
          };
        }
        return {
          time,
          label: `休憩　${fmtDuration(seg.minutes)}`,
          sub:
            pt.endPercent > 0
              ? `次の減少まで${Math.max(0, Math.ceil(30 - pt.decayProgressMin))}分`
              : undefined,
          percent: `${pt.endPercent.toFixed(1)}%`,
          warn: false,
        };
      }),
      summary: [
        { label: "総時間", value: fmtDuration(result.totalMinutes) },
        { label: "終了時刻", value: fmtClock(startMOD, result.totalMinutes) },
        { label: "終了ゲージ", value: `${result.finalPercent.toFixed(1)}%` },
        { label: "ムダ時間", value: fmtDuration(result.totalWastedMinutes) },
      ],
      accent,
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
    a.download = "refresh-plan.png";
    a.click();
  };

  return (
    <Panel title="周回プラン（休憩込み）">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Field label="開始時刻" htmlFor="rg-start" className="!space-y-1">
          <NeuInput
            id="rg-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="max-w-32"
          />
        </Field>
        <p className="text-sm text-slate-500">
          開始ゲージ{" "}
          <span className="font-bold" style={{ color: "var(--unit-color)" }}>
            {startPercent}%
          </span>
        </p>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs text-slate-500">
          追加する曲:{" "}
          <span className="font-bold text-slate-700">
            {selectedSong ? selectedSong.title : "（上で選択）"}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <NeuButton onClick={() => addPlay(60)} disabled={!canAddPlay} className="!py-1.5">
            ＋1時間
          </NeuButton>
          <NeuButton onClick={() => addPlay(30)} disabled={!canAddPlay} className="!py-1.5">
            ＋30分
          </NeuButton>
          <NeuButton onClick={() => addRest(30)} className="!py-1.5">
            ＋休憩30分
          </NeuButton>
          <NeuButton onClick={addMysekai} className="!py-1.5">
            ＋マイセカイ
          </NeuButton>
          {segments.length > 0 && (
            <NeuButton onClick={() => setSegments([])} className="!py-1.5 !text-xs">
              クリア
            </NeuButton>
          )}
        </div>
      </div>

      {segments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          「＋1時間」「＋30分」「＋休憩」でシフトを積むと、各時点の時刻とゲージが出ます。
          プレイの曲は上の「曲」で選んでから追加してください。
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {result.points.map((pt, i) => {
              const seg = pt.segment;
              const capped = pt.wastedPlays >= 1;
              return (
                <li key={seg.id} className="neu-raised flex items-center gap-3 p-3">
                  <div className="w-24 shrink-0 text-[11px] leading-tight text-slate-500">
                    {fmtClock(startMOD, pt.startMinute)}
                    <br />↓ {fmtClock(startMOD, pt.endMinute)}
                  </div>

                  <div className="min-w-0 flex-1">
                    {seg.kind === "play" ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className="material-icons text-base"
                          style={{ color: "var(--unit-color)" }}
                          aria-hidden
                        >
                          music_note
                        </span>
                        <span className="max-w-36 truncate font-bold text-slate-700">{seg.title}</span>
                        <DurationInput value={seg.minutes} onChange={(v) => setPlayMinutes(seg.id, v)} />
                        <span className="text-xs text-slate-400">≈{Math.round(pt.plays)}回</span>
                      </div>
                    ) : seg.kind === "mysekai" ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="material-icons text-base text-emerald-500" aria-hidden>
                          park
                        </span>
                        <span className="font-bold text-slate-600">マイセカイ</span>
                        <span className="text-xs text-slate-500">スタミナ</span>
                        <input
                          inputMode="numeric"
                          value={String(seg.stamina)}
                          onChange={(e) =>
                            setMysekaiStamina(seg.id, Math.max(0, Number(e.target.value) || 0))
                          }
                          className="w-14 rounded-lg bg-neu px-1 py-1 text-center text-slate-800 shadow-neu-inset outline-none"
                          aria-label="スタミナ"
                        />
                        <DurationInput value={seg.minutes} onChange={(v) => setMysekaiMinutes(seg.id, v)} />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="material-icons text-base text-slate-400" aria-hidden>
                          bedtime
                        </span>
                        <span className="font-bold text-slate-600">休憩</span>
                        <DurationInput value={seg.minutes} onChange={(v) => setRestMinutes(seg.id, v)} />
                      </div>
                    )}
                    {capped && (
                      <p className="mt-1 text-xs text-rose-600">
                        ⚠ うち約{Math.round(pt.wastedMinutes)}分（{Math.round(pt.wastedPlays)}回）は100%到達後でムダ
                      </p>
                    )}
                    {seg.kind === "rest" && pt.endPercent > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        次の減少まであと{Math.max(0, Math.ceil(30 - pt.decayProgressMin))}分
                        <span className="text-slate-400">（累計{Math.round(pt.decayProgressMin)}/30分・繰り越し）</span>
                      </p>
                    )}
                  </div>

                  <div className="w-20 shrink-0 text-right">
                    <div
                      className="font-bold"
                      style={{ color: pt.endPercent >= 100 ? "#e11d48" : "var(--unit-color)" }}
                    >
                      {pt.endPercent.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-400">{pt.startPercent.toFixed(1)}%→</div>
                  </div>

                  <div className="flex shrink-0 flex-col leading-none">
                    <button
                      type="button"
                      aria-label="上へ"
                      disabled={i === 0}
                      onClick={() => move(seg.id, -1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="下へ"
                      disabled={i === result.points.length - 1}
                      onClick={() => move(seg.id, 1)}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="削除"
                    onClick={() => remove(seg.id)}
                    className="shrink-0 text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="総時間" value={fmtDuration(result.totalMinutes)} />
            <Stat label="終了時刻" value={fmtClock(startMOD, result.totalMinutes)} />
            <Stat label="終了ゲージ" value={`${result.finalPercent.toFixed(1)}%`} />
            <Stat
              label="ムダ時間"
              value={fmtDuration(result.totalWastedMinutes)}
              sub={result.totalWasted >= 1 ? "休憩を挟もう" : "無駄なし"}
            />
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
          {/* 書き出し専用。display:none だと getComputedStyle が --unit-color を返さない
              ブラウザがあるため、レンダリングは保つ画面外配置にする。 */}
          <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px" />
        </>
      )}
    </Panel>
  );
}
