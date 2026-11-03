import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { formatMan } from "../../../workers/border/src/posts";
import { formatAxisMan } from "./chartData";
import { HISTORY_RANKS, type HistoryRank } from "./historyView";
import { SHAPE_POINTS, dayTicks, elapsedLabel, extentOf, hourAt, parseShape, runsOf, valueAxis, type ShapeSeries } from "./historyShape";

/**
 * 終わった回のボーダーの推移。6順位を1枚に重ね、順位はつけ外しできる（2026-11-03 Nori「一つのグラフに6順位分」
 * 「表示する数字に応じて縦横もアニメーション付きで可変」）。
 *
 * ★ 予測のページ（BorderChart.tsx）は「桁が違うので1枚に重ねない」にしている。ここは順位を外すと縦軸が
 *   残りの順位に合わせて縮むので、下の順位を見たいときは上の順位を外せば読める。
 * ★ 色: 6本を色で分ける。どれも面（明 #e0e5ec 付近・暗 #2a2e36 付近）に対して 3:1 以上になる濃さにした。
 *   色だけに頼らず、つけ外しの札と吹き出しに順位の名前を添える。
 */

const PLOT_H = 220;
const PAD = { l: 48, r: 12, t: 10, b: 24 };
const TICK_LABEL_W = 44;
const TWEEN_MS = 450;

const RANK_COLOR: Record<HistoryRank, string> = {
  "50": "light-dark(#1d4ed8, #7aa2ff)",
  "100": "light-dark(#0f766e, #4fd1c5)",
  "200": "light-dark(#7c3aed, #b79cff)",
  "500": "light-dark(#b45309, #f0b45f)",
  "1000": "light-dark(#be123c, #ff7d99)",
  "2000": "light-dark(#475569, #cbd5e1)",
};
const GRID_COLOR = "light-dark(#dcdcdc, #3a3f4a)";
const SURFACE = "var(--color-neu)";

type Load = { id: number; series: ShapeSeries[] | null; failed: boolean };

function useShape(eventId: number): { series: ShapeSeries[] | null; loading: boolean; failed: boolean } {
  const [state, setState] = useState<Load | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${import.meta.env.BASE_URL}api/border/events/${eventId}/shape`, { signal: ctrl.signal })
      .then(async (res) => {
        // 404 は「この版の Worker・サイトにまだ道が無い」。記録が無いのと同じに扱う
        if (res.status === 404) return setState({ id: eventId, series: [], failed: false });
        if (!res.ok) throw new Error(String(res.status));
        setState({ id: eventId, series: parseShape(await res.json()), failed: false });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ id: eventId, series: null, failed: true });
      });
    return () => ctrl.abort();
  }, [eventId]);
  // 回を選び直した直後は、前の回の線を出さない
  const cur = state?.id === eventId ? state : null;
  return { series: cur?.series ?? null, loading: cur == null, failed: cur?.failed ?? false };
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type Range = { top: number; xEnd: number };

/**
 * 軸の範囲を目標へなめらかに寄せる（動きを減らす設定なら即座に）。target が null（読み込み中）のあいだは今の範囲のまま。
 * 最初の目標はそのまま使う（0 から伸ばす演出はしない）
 */
function useTween(target: Range | null): Range | null {
  const [cur, setCur] = useState<Range | null>(target);
  const curRef = useRef<Range | null>(null);
  // 最初の目標は描きながら入れる（描いたあとの effect で入れると、2回目の変更の最初の1コマが行き先の値に跳ぶ。#189 レビュー M2）
  if (cur == null && target != null) setCur(target);
  const top = target?.top;
  const xEnd = target?.xEnd;
  useEffect(() => {
    if (top == null || xEnd == null) return;
    const from = curRef.current;
    const to = { top, xEnd };
    if (from == null) {
      curRef.current = to;
      return;
    }
    if (from.top === top && from.xEnd === xEnd) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = reduce ? 1 : Math.min(1, (now - t0) / TWEEN_MS);
      const e = 1 - (1 - k) ** 3; // ease-out
      const next = { top: from.top + (top - from.top) * e, xEnd: from.xEnd + (xEnd - from.xEnd) * e };
      curRef.current = next;
      setCur(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [top, xEnd]);
  return cur ?? target;
}

function Swatch({ rank }: { rank: HistoryRank }) {
  return <span aria-hidden className="inline-block h-2 w-3.5 shrink-0 rounded-full" style={{ background: RANK_COLOR[rank] }} />;
}

export function HistoryShapeChart({ eventId, hours }: { eventId: number; hours: number }) {
  const { series, loading, failed } = useShape(eventId);
  // 外した順位（回を選び直しても覚えておく）
  const [hidden, setHidden] = useState<readonly HistoryRank[]>([]);
  const available = useMemo(() => (series ?? []).map((s) => s.rank), [series]);
  // 外した順位しか無い回（別の回で外したまま選び直した）では、外したのを無視して出せる順位を出す（#189 レビュー M1）
  const allHidden = available.length > 0 && available.every((r) => hidden.includes(r));
  const shown = useMemo(() => (series ?? []).filter((s) => allHidden || !hidden.includes(s.rank)), [series, hidden, allHidden]);
  // 軸の動きはここで持つ（回を選び直して読み込み中にグラフが消えても、前の回の範囲から次の回の範囲へ動かす）
  const extent = useMemo(() => (shown.length > 0 ? extentOf(shown, hours) : null), [shown, hours]);
  const target = useMemo(() => (extent ? { top: valueAxis(extent.maxValue).top, xEnd: Math.max(1, extent.xEnd) } : null), [extent]);
  const view = useTween(target);
  const toggle = (rank: HistoryRank) => {
    const base = allHidden ? hidden.filter((r) => !available.includes(r)) : hidden;
    const next = base.includes(rank) ? base.filter((r) => r !== rank) : [...base, rank];
    // この回で出せる順位を全部外すと何も描けないので、最後の1つは外させない
    if (available.some((r) => !next.includes(r))) setHidden(next);
  };

  return (
    <div>
      <div role="group" aria-label="出す順位" className="flex flex-wrap gap-2">
        {HISTORY_RANKS.map((rank) => {
          const has = available.includes(rank);
          const on = has && (allHidden || !hidden.includes(rank));
          return (
            <button
              key={rank}
              type="button"
              aria-pressed={on}
              disabled={!has}
              onClick={() => toggle(rank)}
              className={
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)] disabled:opacity-40 " +
                (on ? "neu-inset text-slate-700" : "bg-neu text-slate-500 shadow-neu-sm")
              }
            >
              <span className={on ? "" : "opacity-30"}>
                <Swatch rank={rank} />
              </span>
              {rank}位
            </button>
          );
        })}
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-slate-500">
          読み込み中…
        </p>
      )}
      {!loading && failed && <p className="mt-4 text-sm text-slate-600">推移を読み込めませんでした。時間をおいて開き直してください。</p>}
      {!loading && !failed && available.length === 0 && (
        <p className="mt-4 text-sm leading-7 text-slate-500">この回は推移の記録がありません（記録の欠けている時間が長い回は、推移を作っていません）。</p>
      )}
      {!loading && !failed && extent && target && <Plot series={shown} hours={hours} lastHour={extent.xEnd} target={target} view={view ?? target} />}
    </div>
  );
}

function Plot({ series, hours, lastHour, target, view }: { series: ShapeSeries[]; hours: number; lastHour: number; target: Range; view: Range }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const { top, xEnd } = view;
  const plotW = Math.max(1, width - PAD.l - PAD.r);
  const height = PAD.t + PLOT_H + PAD.b;
  const x = (h: number) => PAD.l + (h / xEnd) * plotW;
  const y = (v: number) => PAD.t + PLOT_H - (v / top) * PLOT_H;
  const path = (pts: { i: number; v: number }[]) =>
    pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(hourAt(p.i, hours)).toFixed(1)},${y(p.v).toFixed(1)}`).join("");

  // 十字線は格子の点に吸い付く
  const lastI = Math.round((lastHour / hours) * (SHAPE_POINTS - 1));
  const nearest = (px: number) => Math.min(lastI, Math.max(0, Math.round((((px - PAD.l) / plotW) * xEnd * (SHAPE_POINTS - 1)) / hours)));
  const onMove = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const i = active ?? lastI;
    const next = ({ ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: lastI } as Record<string, number>)[e.key];
    if (next == null) return;
    e.preventDefault();
    setActive(Math.min(lastI, Math.max(0, next)));
  };
  // 順位を外して右端が縮んだとき、選んでいた点が範囲の外に残らないように（#189 レビュー L2）
  const a = active != null ? Math.min(active, lastI) : null;
  const summary = `ボーダーの推移。${series.map((s) => `${s.rank}位 終値 ${formatMan(s.final)}`).join("、")}`;
  // useId の «» や : は url(#…) で読めないので、英数字だけにする
  const clipId = `shape-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div ref={ref} className="relative mt-4" style={{ height } as CSSProperties}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          className="block touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(lastI)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.l} y={PAD.t - 4} width={plotW + 4} height={PLOT_H + 8} />
            </clipPath>
          </defs>
          {/* 目盛りは行き先の範囲で切り、動いている途中の範囲に置く（縮む・伸びるのに合わせて滑る） */}
          {valueAxis(target.top).ticks
            .filter((v) => v <= top * 1.001)
            .map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={y(v)} y2={y(v)} style={{ stroke: GRID_COLOR }} strokeWidth={1} />
                <text x={PAD.l - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px] tabular-nums">
                  {formatAxisMan(v)}
                </text>
              </g>
            ))}
          {dayTicks(target.xEnd, Math.max(2, Math.floor(plotW / TICK_LABEL_W)))
            .filter((tk) => tk.h <= xEnd + 1e-6)
            .map((tk) => (
              <text key={tk.h} x={x(tk.h)} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px] tabular-nums">
                {tk.label}
              </text>
            ))}
          <g clipPath={`url(#${clipId})`}>
            {series.map((s) =>
              runsOf(s.values).map((run) =>
                run.length === 1 ? (
                  <circle key={`${s.rank}-${run[0].i}`} cx={x(hourAt(run[0].i, hours))} cy={y(run[0].v)} r={2.5} style={{ fill: RANK_COLOR[s.rank] }} />
                ) : (
                  <path
                    key={`${s.rank}-${run[0].i}`}
                    d={path(run)}
                    fill="none"
                    style={{ stroke: RANK_COLOR[s.rank] }}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
              ),
            )}
          </g>
          {a != null && (
            <g pointerEvents="none">
              <line x1={x(hourAt(a, hours))} x2={x(hourAt(a, hours))} y1={PAD.t} y2={PAD.t + PLOT_H} className="stroke-slate-400" strokeOpacity={0.6} strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[a];
                return v == null ? null : (
                  <circle key={s.rank} cx={x(hourAt(a, hours))} cy={y(v)} r={4} style={{ fill: RANK_COLOR[s.rank], stroke: SURFACE }} strokeWidth={2} />
                );
              })}
            </g>
          )}
        </svg>
      )}
      {a != null && width > 0 && <Tooltip series={series} i={a} hours={hours} left={x(hourAt(a, hours))} width={width} />}
      {/* 矢印キーで点を動かしたとき、吹き出しの中身を読み上げる（吹き出しは目で見る人向け。#189 レビュー M3） */}
      <p className="sr-only" aria-live="polite">
        {a != null &&
          `${elapsedLabel(a, hours)}。${series.map((s) => `${s.rank}位 ${s.values[a] != null ? formatMan(s.values[a]) : "記録なし"}`).join("、")}`}
      </p>
    </div>
  );
}

/** 値が先、順位が後。上の順位から */
function Tooltip({ series, i, hours, left, width }: { series: ShapeSeries[]; i: number; hours: number; left: number; width: number }) {
  const side: CSSProperties = left > width / 2 ? { right: width - left + 10 } : { left: left + 10 };
  return (
    <div className="pointer-events-none absolute top-0 z-10 rounded-lg bg-[color:var(--color-neu)] px-2.5 py-1.5 text-[11px] leading-5 shadow-neu-sm" style={side}>
      <p className="whitespace-nowrap text-slate-500">{elapsedLabel(i, hours)}</p>
      {series.map((s) => (
        <p key={s.rank} className="flex items-center gap-1.5 whitespace-nowrap">
          <Swatch rank={s.rank} />
          <b className="tabular-nums text-slate-800">{s.values[i] != null ? formatMan(s.values[i]) : "—"}</b>
          <span className="text-slate-500">{s.rank}位</span>
        </p>
      ))}
    </div>
  );
}
