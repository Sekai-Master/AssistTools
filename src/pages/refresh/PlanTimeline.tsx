import {
  type Dispatch,
  type SetStateAction,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveColor } from "../../lib/canvasColor";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { DurationInput } from "../../components/ui/DurationInput";
import { TakiInput } from "../../components/ui/TakiInput";
import { Stat } from "./Stat";
import { type Segment, mysekaiMemoriOf, simulateTimeline } from "./lib/timeline";
import {
  MYSEKAI_FULL_HARVEST_MEMORI,
  computePlanPoints,
} from "./lib/planPoints";
import {
  watermark,
  drawPlanCanvas,
  type PlanCanvasData,
} from "./lib/planCanvas";
import { getRefreshConstant } from "./lib/refreshConstant";
import { fmtClock, fmtDuration, parseClock } from "./lib/format";
import type { AnalyzerMusic } from "../analyzer/useAnalyzerMusics";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

let seq = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `seg-${seq++}`;
}

interface PointsConfig {
  /** 起点となる現在ポイント */
  startPoints: number;
  /** 基準焚き数での点数時速(pt/時) */
  hourlyRate: number;
  /** 上の時速を出した焚き数 */
  refTaki: number;
  /** マイセカイ1メモリあたりのPt（総合力・ボーナスから算出）。0なら計上しない。 */
  mySekaiUnitPt: number;
}

interface Props {
  /**
   * どのツールとして書き出すか（tools.ts の id）。
   * ★ この部品は「リフレッシュゲージ計算機」と「周回プラン」の2つで共有している。
   *   画像の透かしを既定任せにすると、**片方の画像に他方の名前が入る**。
   */
  toolId: "refresh" | "plan";
  /** ブロック追加に使う現在選択中の曲 */
  selectedSong: AnalyzerMusic | undefined;
  /** 周回ペース較正済みのオーバーヘッド秒 */
  overhead: number;
  /** プラン開始時点のゲージ%（上の「現在のゲージ」を引き継ぐ） */
  startPercent: number;
  /**
   * プラン開始時点で減少タイマーが進んでいる分（0〜30）。
   * 上の「次の回復まで」から作る。0＝たった今プレイを止めた。
   */
  startDecayProgress?: number;
  /** エビ基準の周回ペース(回/時)。画像のメタ表示に使う。 */
  ratePerHour: number;
  /** 指定すると各プレイに焚き数を持たせ、累積到達ポイントも計算・表示する（全部入り） */
  points?: PointsConfig;
  /** タイムライン本体（親が保持＝保存/呼び出し対象）。 */
  segments: Segment[];
  setSegments: Dispatch<SetStateAction<Segment[]>>;
  /** 開始時刻 "HH:MM"（親が保持）。 */
  startTime: string;
  setStartTime: Dispatch<SetStateAction<string>>;
}

/**
 * 周回プランのタイムライン。プレイ(時間指定)/休憩/マイセカイを積み、各時点の時刻とゲージを表示。
 * points 指定時はプレイに焚き数を持たせ、累積到達ポイントも並走で計算する。
 */
export function PlanTimeline({
  toolId,
  selectedSong,
  overhead,
  startPercent,
  startDecayProgress = 0,
  ratePerHour,
  points,
  segments,
  setSegments,
  startTime,
  setStartTime,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startMOD = parseClock(startTime);
  const result = useMemo(
    () => simulateTimeline(segments, startPercent, overhead, startDecayProgress),
    [segments, startPercent, overhead, startDecayProgress],
  );

  // points指定時: 各ブロックの獲得pt・累積到達ptを並走計算（計算は lib/planPoints）。
  const pointRows = useMemo(
    () => (points ? computePlanPoints(result, points) : null),
    [points, result],
  );

  const finalPoints =
    pointRows && pointRows.length
      ? pointRows[pointRows.length - 1].cumulative
      : (points?.startPoints ?? 0);
  const gainedPoints = finalPoints - (points?.startPoints ?? 0);

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
        refreshConstant: getRefreshConstant(
          selectedSong.basePoint,
          selectedSong.id,
        ),
        songLengthSec: selectedSong.musicTime,
        minutes,
        taki: points ? points.refTaki : undefined,
      },
    ]);
  };
  const addRest = (minutes: number) =>
    setSegments((s) => [...s, { id: newId(), kind: "rest", minutes }]);
  // 既定は「全回収1回」。実運用で積むのはほぼこれなので、毎回打ち直させない。
  const addMysekai = () =>
    setSegments((s) => [
      ...s,
      {
        id: newId(),
        kind: "mysekai",
        memori: MYSEKAI_FULL_HARVEST_MEMORI,
        minutes: 15,
      },
    ]);
  const setPlayMinutes = (id: string, minutes: number) =>
    setSegments((s) =>
      s.map((g) => (g.id === id && g.kind === "play" ? { ...g, minutes } : g)),
    );
  const setPlayTaki = (id: string, taki: number) =>
    setSegments((s) =>
      s.map((g) => (g.id === id && g.kind === "play" ? { ...g, taki } : g)),
    );
  const setRestMinutes = (id: string, minutes: number) =>
    setSegments((s) =>
      s.map((g) => (g.id === id && g.kind === "rest" ? { ...g, minutes } : g)),
    );
  const setMysekaiMemori = (id: string, memori: number) =>
    setSegments((s) =>
      s.map((g) =>
        // 旧データのスタミナは残さない（両方あると次に読むときどちらが正か割れる）。
        g.id === id && g.kind === "mysekai"
          ? { ...g, memori, stamina: undefined }
          : g,
      ),
    );
  const setMysekaiMinutes = (id: string, minutes: number) =>
    setSegments((s) =>
      s.map((g) =>
        g.id === id && g.kind === "mysekai" ? { ...g, minutes } : g,
      ),
    );
  const remove = (id: string) =>
    setSegments((s) => s.filter((g) => g.id !== id));
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
    // ★ ユニット色は light-dark() で書かれていて canvas が読めない。**必ず解決して渡す**
    //   （渡さないと例外も出ないまま本文の黒で描かれる。src/lib/canvasColor.ts）。
    const accent = resolveColor(
      canvasRef.current,
      "var(--unit-color)",
      "#88dd44",
    );
    const gauge = (pct: number) => `ゲージ${pct.toFixed(1)}%`;
    return {
      footer: watermark(toolId),
      heading: points
        ? "リフレッシュゲージ 周回プラン（全部入り）"
        : "リフレッシュゲージ 周回プラン",
      songTitle: points
        ? `到達 ${finalPoints.toLocaleString()} pt`
        : (selectedSong?.title ?? "リフレッシュゲージ"),
      meta: points
        ? [
            `時速 ${points.hourlyRate.toLocaleString()} pt/時（基準焚き${points.refTaki}）・${ratePerHour}回/時`,
            `現在 ${points.startPoints.toLocaleString()} pt ・ 開始 ${startTime || "—"} ・ ゲージ ${startPercent}%`,
          ]
        : [
            `ペース: ${ratePerHour}回/時（エビ基準）`,
            `開始 ${startTime || "—"}・ゲージ ${startPercent}%`,
          ],
      rows: result.points.map((pt, i) => {
        const seg = pt.segment;
        const time = `${fmtClock(startMOD, pt.startMinute)} → ${fmtClock(startMOD, pt.endMinute)}`;
        const cum = pointRows ? pointRows[i].cumulative.toLocaleString() : null;
        const gained = pointRows ? pointRows[i].gained : 0;
        if (seg.kind === "play") {
          const warn = pt.wastedPlays >= 1;
          const base =
            `≈${Math.round(pt.plays)}回` +
            (warn ? ` / 約${Math.round(pt.wastedMinutes)}分ムダ` : "");
          return {
            time,
            label: points
              ? `${seg.title}　焚き${seg.taki ?? points.refTaki}　${fmtDuration(seg.minutes)}`
              : `${seg.title}　${fmtDuration(seg.minutes)}`,
            sub: points
              ? `+${gained.toLocaleString()}pt ・ ${gauge(pt.endPercent)} ・ ${base}`
              : base,
            percent: cum ?? `${pt.endPercent.toFixed(1)}%`,
            warn,
            jacket: `${JACKET_BASE}${seg.jacketLink}`,
          };
        }
        if (seg.kind === "mysekai") {
          const memori = mysekaiMemoriOf(seg);
          return {
            time,
            label: `マイセカイ採取　${memori}メモリ　${fmtDuration(seg.minutes)}`,
            sub: points
              ? [
                  gained > 0 ? `+${gained.toLocaleString()}pt` : null,
                  gauge(pt.endPercent),
                ]
                  .filter(Boolean)
                  .join(" ・ ")
              : fmtDuration(seg.minutes),
            percent: cum ?? `${pt.endPercent.toFixed(1)}%`,
            warn: false,
          };
        }
        const restSub =
          pt.endPercent > 0
            ? `次の減少まで${Math.max(0, Math.ceil(30 - pt.decayProgressMin))}分`
            : undefined;
        return {
          time,
          label: `休憩　${fmtDuration(seg.minutes)}`,
          sub: points
            ? [gauge(pt.endPercent), restSub].filter(Boolean).join(" ・ ")
            : restSub,
          percent: cum ?? `${pt.endPercent.toFixed(1)}%`,
          warn: false,
        };
      }),
      summary: points
        ? [
            { label: "到達ポイント", value: finalPoints.toLocaleString() },
            { label: "獲得", value: `+${gainedPoints.toLocaleString()}` },
            { label: "総時間", value: fmtDuration(result.totalMinutes) },
            {
              label: "終了時刻",
              value: fmtClock(startMOD, result.totalMinutes),
            },
            {
              label: "終了ゲージ",
              value: `${result.finalPercent.toFixed(1)}%`,
            },
          ]
        : [
            { label: "総時間", value: fmtDuration(result.totalMinutes) },
            {
              label: "終了時刻",
              value: fmtClock(startMOD, result.totalMinutes),
            },
            {
              label: "終了ゲージ",
              value: `${result.finalPercent.toFixed(1)}%`,
            },
            {
              label: "ムダ時間",
              value: fmtDuration(result.totalWastedMinutes),
            },
          ],
      accent,
      rightColW: points ? 150 : undefined,
    };
  };

  const copyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await drawPlanCanvas(canvas, buildCanvasData());
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
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
    <Panel
      title={
        points
          ? "タイムライン（曲・休憩・マイセカイ・到達pt）"
          : "周回プラン（休憩込み）"
      }
    >
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
          <NeuButton
            onClick={() => addPlay(60)}
            disabled={!canAddPlay}
            className="!py-1.5"
          >
            ＋稼働
          </NeuButton>
          <NeuButton onClick={() => addRest(30)} className="!py-1.5">
            ＋休憩
          </NeuButton>
          <NeuButton onClick={addMysekai} className="!py-1.5">
            ＋マイセカイ
          </NeuButton>
          {segments.length > 0 && (
            <NeuButton
              onClick={() => setSegments([])}
              className="!py-1.5 !text-xs"
            >
              クリア
            </NeuButton>
          )}
        </div>
      </div>

      {segments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          「＋稼働」「＋休憩」「＋マイセカイ」でシフトを積むと、各時点の時刻とゲージが出ます。
          稼働は初期値1時間（各ブロックで調整可）。曲は上の「曲」で選んでから追加してください。
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {result.points.map((pt, i) => {
              const seg = pt.segment;
              const capped = pt.wastedPlays >= 1;
              return (
                <li
                  key={seg.id}
                  className="neu-raised flex items-center gap-3 p-3"
                >
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
                        <span className="max-w-36 truncate font-bold text-slate-700">
                          {seg.title}
                        </span>
                        <DurationInput
                          value={seg.minutes}
                          onChange={(v) => setPlayMinutes(seg.id, v)}
                        />
                        <span className="text-xs text-slate-400">
                          ≈{Math.round(pt.plays)}回
                        </span>
                        {points && pointRows && (
                          <>
                            <span className="text-xs text-slate-500">焚き</span>
                            <TakiInput
                              value={seg.taki ?? points.refTaki}
                              onChange={(v) => setPlayTaki(seg.id, v)}
                            />
                            <span
                              className="text-xs font-bold"
                              style={{ color: "var(--unit-color)" }}
                            >
                              +{pointRows[i].gained.toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    ) : seg.kind === "mysekai" ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className="material-icons text-base text-emerald-500"
                          aria-hidden
                        >
                          park
                        </span>
                        <span className="font-bold text-slate-600">
                          マイセカイ
                        </span>
                        <span className="text-xs text-slate-500">メモリ</span>
                        <input
                          inputMode="decimal"
                          value={String(mysekaiMemoriOf(seg))}
                          onChange={(e) =>
                            setMysekaiMemori(
                              seg.id,
                              Math.max(0, Number(e.target.value) || 0),
                            )
                          }
                          className="w-16 rounded-lg bg-neu px-1 py-1 text-center text-slate-800 shadow-neu-inset outline-none"
                          aria-label="メモリ数"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setMysekaiMemori(
                              seg.id,
                              MYSEKAI_FULL_HARVEST_MEMORI,
                            )
                          }
                          className="neu-raised neu-tactile rounded-lg px-2 py-1 text-[10px] text-slate-600"
                        >
                          全回収
                        </button>
                        <span className="text-[10px] text-slate-400">
                          ≈スタミナ{Math.round(mysekaiMemoriOf(seg) * 5)}
                        </span>
                        <DurationInput
                          value={seg.minutes}
                          onChange={(v) => setMysekaiMinutes(seg.id, v)}
                          step={15}
                        />
                        {points && pointRows && pointRows[i].gained > 0 && (
                          <span
                            className="text-xs font-bold"
                            style={{ color: "var(--unit-color)" }}
                          >
                            +{pointRows[i].gained.toLocaleString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className="material-icons text-base text-slate-400"
                          aria-hidden
                        >
                          bedtime
                        </span>
                        <span className="font-bold text-slate-600">休憩</span>
                        <DurationInput
                          value={seg.minutes}
                          onChange={(v) => setRestMinutes(seg.id, v)}
                        />
                      </div>
                    )}
                    {capped && (
                      <p className="mt-1 text-xs text-rose-600">
                        ⚠ うち約{Math.round(pt.wastedMinutes)}分（
                        {Math.round(pt.wastedPlays)}回）は100%到達後でムダ
                      </p>
                    )}
                    {seg.kind === "rest" && pt.endPercent > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        次の減少まであと
                        {Math.max(0, Math.ceil(30 - pt.decayProgressMin))}分
                        <span className="text-slate-400">
                          （累計{Math.round(pt.decayProgressMin)}
                          /30分・繰り越し）
                        </span>
                      </p>
                    )}
                  </div>

                  <div
                    className={`shrink-0 text-right ${points ? "w-28" : "w-20"}`}
                  >
                    {points && pointRows ? (
                      <>
                        <div className="break-all font-bold leading-tight tabular-nums text-slate-700">
                          {pointRows[i].cumulative.toLocaleString()}
                        </div>
                        <div
                          className="text-[10px]"
                          style={{
                            color:
                              pt.endPercent >= 100
                                ? "var(--color-rose-600)"
                                : "var(--unit-color)",
                          }}
                        >
                          ゲージ{pt.endPercent.toFixed(1)}%
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="font-bold"
                          style={{
                            color:
                              pt.endPercent >= 100
                                ? "var(--color-rose-600)"
                                : "var(--unit-color)",
                          }}
                        >
                          {pt.endPercent.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {pt.startPercent.toFixed(1)}%→
                        </div>
                      </>
                    )}
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

          {points && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Stat label="到達ポイント" value={finalPoints.toLocaleString()} />
              <Stat
                label="獲得ポイント"
                value={`+${gainedPoints.toLocaleString()}`}
              />
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="総時間" value={fmtDuration(result.totalMinutes)} />
            <Stat
              label="終了時刻"
              value={fmtClock(startMOD, result.totalMinutes)}
            />
            <Stat
              label="終了ゲージ"
              value={`${result.finalPercent.toFixed(1)}%`}
            />
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
          <canvas
            ref={canvasRef}
            aria-hidden
            className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px"
          />
        </>
      )}
    </Panel>
  );
}
