import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { formatMan, formatRange } from "../../../workers/border/src/posts";
import { formatJst } from "./borderView";
import { formatAxisMan, isShown, shownRuns, timeTicks, visibleEnd, yTicks, yTop, type HistoryPoint } from "./chartData";

/**
 * 推移のグラフ。順位ごとの小さなグラフを並べる。
 *
 * ★ 順位ごとに桁が違うので1枚に重ねない（縦軸を2本にしない）。
 * ★ 色: 実測＝中立の濃い色、予測＝深い緑。どちらも面に対して 3:1 以上あることを
 *   データ可視化の検査スクリプトで確かめた（明: #475569・#4e8f1f／暗: #cbd5e1・#5fa52f）。
 *   ページの色（MMJ の #88dd44）は明るい面では 1.5:1 しかなく、線には使えない。
 *   見分けは色だけに頼らず、実線／破線と凡例でも付ける。
 */

const PLOT_H = 140;
const PAD = { l: 44, r: 10, t: 8, b: 22 };
const TICK_LABEL_W = 48;

const VARS = {
  "--bp-actual": "light-dark(#475569, #cbd5e1)",
  "--bp-pred": "light-dark(#4e8f1f, #5fa52f)",
  "--bp-grid": "light-dark(#dcdcdc, #3a3f4a)",
} as CSSProperties;

const ACTUAL = "var(--bp-actual)";
const PRED = "var(--bp-pred)";
const GRID = "var(--bp-grid)";
const SURFACE = "var(--color-neu)";

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

function LineKey({ dashed }: { dashed?: boolean }) {
  return (
    <svg width="16" height="6" aria-hidden className="shrink-0">
      <line x1="1" x2="15" y1="3" y2="3" style={{ stroke: dashed ? PRED : ACTUAL }} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      <li className="flex items-center gap-1.5"><LineKey />実測</li>
      <li className="flex items-center gap-1.5"><LineKey dashed />その時点の予測（最終値）</li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm" style={{ background: PRED, opacity: 0.2 }} />
        8割の幅
      </li>
    </ul>
  );
}

/** 値が先、名前が後（読む人は系列を知っていて数字が欲しい） */
function Tooltip({ p, left, width }: { p: HistoryPoint; left: number; width: number }) {
  const side: CSSProperties = left > width / 2 ? { right: width - left + 10 } : { left: left + 10 };
  return (
    <div className="pointer-events-none absolute top-0 z-10 rounded-lg bg-[color:var(--color-neu)] px-2.5 py-1.5 text-[11px] leading-5 shadow-neu-sm" style={side}>
      <p className="text-slate-500">{formatJst(p.t)}</p>
      <p className="flex items-center gap-1.5 whitespace-nowrap">
        <LineKey />
        <b className="tabular-nums text-slate-800">{formatMan(p.current)}</b>
        <span className="text-slate-500">実測</span>
      </p>
      {p.predicted != null && (
        <p className="flex items-center gap-1.5 whitespace-nowrap">
          <LineKey dashed />
          <b className="tabular-nums text-slate-800">{formatMan(p.predicted)}</b>
          <span className="text-slate-500">予測</span>
        </p>
      )}
      {p.low != null && p.high != null && (
        <p className="whitespace-nowrap tabular-nums text-slate-500">8割の幅 {formatRange(p.low, p.high)}</p>
      )}
    </div>
  );
}

function RankChart({ rank, points, startAt, endAt }: { rank: number; points: HistoryPoint[]; startAt: number; endAt: number }) {
  const [ref, width] = useWidth();
  /** 選んでいる点。"latest" はいちばん新しい点（10分ごとの読み直しで点が増えても付いていく） */
  const [active, setActive] = useState<number | "latest" | null>(null);
  const last = points[points.length - 1];
  const lastShown = [...points].reverse().find(isShown);
  const plotW = Math.max(1, width - PAD.l - PAD.r);
  const height = PAD.t + PLOT_H + PAD.b;

  // 線と帯の形は、データと幅が変わったときだけ作る（ポインタが動くたびに作り直さない）
  const geo = useMemo(() => {
    const top = yTop(points);
    const span = Math.max(1, endAt - startAt);
    const x = (t: number) => PAD.l + ((t - startAt) / span) * plotW;
    const y = (v: number) => PAD.t + PLOT_H - (v / top) * PLOT_H;
    const line = <T extends HistoryPoint>(pts: readonly T[], pick: (p: T) => number) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(pick(p)).toFixed(1)}`).join("");
    const shown = shownRuns(points);
    const runs = shown.map((run, i) => ({
      key: run[0].t,
      // 1点だけの区間（予測を出し始めた最初の30分など）は、線も帯も長さ・面積が0で見えない。点と縦の幅で描く
      single: run.length === 1 ? run[0] : null,
      // 最新の予測には、実測の線と同じく終わりに点を打つ（出し始めの数時間は帯が細い筋で、破線もごく短い）
      end: i === shown.length - 1 && run.length > 1 ? run[run.length - 1] : null,
      band: `${line(run, (p) => p.high)}${[...run].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.low).toFixed(1)}`).join("")}Z`,
      predicted: line(run, (p) => p.predicted),
    }));
    return { top, x, y, runs, actual: line(points, (p) => p.current) };
  }, [points, startAt, endAt, plotW]);
  const { top, x, y } = geo;

  // 十字線は一番近い時刻に吸い付く（2px の線を狙わせない）
  const nearest = (px: number) =>
    points.reduce((best, p, i) => (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px) ? i : best), 0);
  const onMove = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left));
  const index = active === "latest" ? points.length - 1 : active;
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const i = index ?? points.length - 1;
    const next = ({ ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: points.length - 1 } as Record<string, number>)[e.key];
    if (next == null) return;
    e.preventDefault();
    const clamped = Math.min(points.length - 1, Math.max(0, next));
    setActive(clamped === points.length - 1 ? "latest" : clamped);
  };
  const a = index != null ? points[Math.min(index, points.length - 1)] : null;
  const summary =
    `${rank}位の推移。${formatJst(last.t)} 時点の実測 ${formatMan(last.current)}` +
    (lastShown?.predicted != null ? `、予測 ${formatMan(lastShown.predicted)}` : "、予測はまだ出していません");

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-slate-700">{rank}位</span>
        <span className="truncate tabular-nums text-slate-500">
          いま {formatMan(last.current)}
          {lastShown?.predicted != null && `・予測 ${formatMan(lastShown.predicted)}`}
        </span>
      </figcaption>
      <div ref={ref} className="relative mt-1" style={{ height }}>
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
            onFocus={() => setActive("latest")}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            {yTicks(top).map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={y(v)} y2={y(v)} style={{ stroke: GRID }} strokeWidth={1} />
                <text x={PAD.l - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px] tabular-nums">
                  {formatAxisMan(v)}
                </text>
              </g>
            ))}
            {timeTicks(startAt, endAt, Math.max(2, Math.floor(plotW / TICK_LABEL_W))).map((tk) => (
              <text key={tk.t} x={x(tk.t)} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px] tabular-nums">
                {tk.label}
              </text>
            ))}
            {geo.runs.map((run) =>
              run.single ? (
                <g key={run.key} data-mark="pred-single">
                  {/* 幅8pxの棒は、面の帯（0.12）と同じ薄さだと見えないので、凡例の見本と同じ 0.2 にしてある */}
                  <line
                    x1={x(run.single.t)}
                    x2={x(run.single.t)}
                    y1={y(run.single.high)}
                    y2={y(run.single.low)}
                    style={{ stroke: PRED }}
                    strokeOpacity={0.2}
                    strokeWidth={8}
                  />
                  <circle cx={x(run.single.t)} cy={y(run.single.predicted)} r={4} style={{ fill: PRED, stroke: SURFACE }} strokeWidth={2} />
                </g>
              ) : (
                <g key={run.key} data-mark="pred-line">
                  <path d={run.band} style={{ fill: PRED }} fillOpacity={0.12} />
                  <path d={run.predicted} fill="none" style={{ stroke: PRED }} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
                  {run.end && (
                    <circle data-mark="pred-end" cx={x(run.end.t)} cy={y(run.end.predicted)} r={4} style={{ fill: PRED, stroke: SURFACE }} strokeWidth={2} />
                  )}
                </g>
              ),
            )}
            <path d={geo.actual} fill="none" style={{ stroke: ACTUAL }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(last.t)} cy={y(last.current)} r={4} style={{ fill: ACTUAL, stroke: SURFACE }} strokeWidth={2} />
            {a && (
              <g pointerEvents="none">
                <line x1={x(a.t)} x2={x(a.t)} y1={PAD.t} y2={PAD.t + PLOT_H} style={{ stroke: ACTUAL }} strokeOpacity={0.35} strokeWidth={1} />
                <circle cx={x(a.t)} cy={y(a.current)} r={4} style={{ fill: ACTUAL, stroke: SURFACE }} strokeWidth={2} />
                {a.predicted != null && <circle cx={x(a.t)} cy={y(a.predicted)} r={4} style={{ fill: PRED, stroke: SURFACE }} strokeWidth={2} />}
              </g>
            )}
          </svg>
        )}
        {a && width > 0 && <Tooltip p={a} left={x(a.t)} width={width} />}
      </div>
    </figure>
  );
}

/** グラフと同じ数字を表でも読めるようにする（グラフに触れない人・読み上げのため）。開いたときだけ作る */
function HistoryTable({ series }: { series: readonly (readonly [number, HistoryPoint[]])[] }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-4 text-xs" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-slate-500">数字の表で見る（30分ごと・新しい順）</summary>
      {open && (
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {series.map(([rank, pts]) => (
            <table key={rank} className="w-full text-left tabular-nums">
              <caption className="py-1 text-left font-bold text-slate-700">{rank}位</caption>
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 font-normal">時刻</th>
                  <th className="py-1 font-normal">実測</th>
                  <th className="py-1 font-normal">予測（8割の幅）</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {[...pts].reverse().map((p) => (
                  <tr key={p.t} className="border-t border-[color:var(--neu-edge)]">
                    <td className="py-1 pr-2 whitespace-nowrap">{formatJst(p.t)}</td>
                    <td className="py-1 pr-2">{formatMan(p.current)}</td>
                    <td className="py-1">
                      {p.predicted != null ? formatMan(p.predicted) : "—"}
                      {p.low != null && p.high != null && <span className="text-slate-500">（{formatRange(p.low, p.high)}）</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
    </details>
  );
}

export function BorderCharts({
  history,
  ranks,
  startAt,
  endAt,
}: {
  history: Map<number, HistoryPoint[]>;
  ranks: readonly number[];
  startAt: number;
  endAt: number;
}) {
  const series = ranks.map((r) => [r, history.get(r) ?? []] as const).filter(([, pts]) => pts.length > 0);
  if (series.length === 0) return null;
  // 6つのグラフで横軸をそろえる（見比べられるように）。右端は最新の少し先まで
  const lastT = Math.max(...series.map(([, pts]) => pts[pts.length - 1].t));
  const xEnd = visibleEnd(startAt, endAt, lastT);
  return (
    <div style={VARS}>
      <Legend />
      {xEnd < endAt && (
        <p className="mt-1 text-[11px] text-slate-500">横軸は開始から最新の少し先まで（時間が経つと終了の {formatJst(endAt)} まで広がります）</p>
      )}
      <div className="mt-3 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {series.map(([rank, pts]) => (
          <RankChart key={rank} rank={rank} points={pts} startAt={startAt} endAt={xEnd} />
        ))}
      </div>
      <HistoryTable series={series} />
    </div>
  );
}
