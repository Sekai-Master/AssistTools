import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/utils";
import { DIAL_SWEEP_DEG, dialAngle, dialValueFromPoint } from "./dialMath";

/** 目盛りの円（viewBox 100 の中）。溝と値の弧はこの円の 300° ぶん。 */
const R = 38;
const CIRC = 2 * Math.PI * R;
const TRACK = (CIRC * DIAL_SWEEP_DEG) / 360;
/** 円の描き始め（右）を、目盛りの始まり（左下、真上から -150°）へ回す角度。 */
const ARC_ROTATE = `rotate(${-DIAL_SWEEP_DEG / 2 - 90} 50 50)`;

/**
 * 回して選ぶダイヤル（min〜max の整数）。上下限がはっきりした小さな範囲（例: 0〜30 分）に使う。
 *
 * - 土台はネイティブの range（sr-only）。キーボード（矢印・PageUp/PageDown・Home/End）と読み上げ（VoiceOver の上下スワイプなど）は
 *   そのまま効く。Switch がネイティブの checkbox を土台にしているのと同じ作り
 * - 見た目の円は指・マウスで回すためのもの。外側の輪をなぞると回り、押した所へ飛ぶ。中心はページのスクロールに残す
 * - value が null（未設定）のときは fallback の位置に薄く出す。回すと値が入る
 */
export function Dial({
  id,
  value,
  fallback,
  min = 0,
  max,
  unit,
  valueText,
  onChange,
  tickEvery = 5,
  className,
}: {
  /** ラベル（Field の htmlFor）を結ぶ id。range に付く。 */
  id: string;
  value: number | null;
  /** 未設定のときに出す位置。 */
  fallback: number;
  min?: number;
  max: number;
  /** 数字の下の単位（「分」など）。 */
  unit: string;
  /** 読み上げの文（aria-valuetext）。 */
  valueText: string;
  onChange: (v: number) => void;
  /** 目盛りの間隔。 */
  tickEvery?: number;
  className?: string;
}) {
  const shown = Math.max(min, Math.min(max, value ?? fallback));
  const set = value != null;
  const hitRef = useRef<SVGCircleElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 回している途中か・ひとつ前の値（切れ目をまたいで端から端へ飛ばないため）。 */
  const active = useRef(false);
  const last = useRef<number | undefined>(undefined);
  // 回している間は、つまみの動きを指に遅れさせない（押した所へ飛ぶときだけ動かす）
  const [dragging, setDragging] = useState(false);

  // 輪をなぞってもページがスクロールしないように。React の touch は passive なので、ここだけ自前で付ける
  useEffect(() => {
    const el = hitRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    return () => el.removeEventListener("touchstart", stop);
  }, []);

  const pick = (e: ReactPointerEvent<SVGCircleElement>) => {
    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    // 中心の近くは向きが定まらないので拾わない
    if (Math.hypot(dx, dy) < rect.width * 0.12) return;
    const v = dialValueFromPoint(dx, dy, min, max, last.current);
    last.current = v;
    if (v !== value) onChange(v);
  };

  const end = () => {
    active.current = false;
    last.current = undefined;
    setDragging(false);
  };

  const angle = dialAngle(shown, min, max);
  const len = max > min ? (TRACK * (shown - min)) / (max - min) : 0;
  const ticks: number[] = [];
  for (let v = min; v <= max; v += tickEvery) ticks.push(v);
  const motion = dragging ? "" : "duration-150 ease-out motion-reduce:transition-none";

  return (
    <div className={cn("relative size-44 shrink-0 select-none", className)}>
      <input
        ref={inputRef}
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={valueText}
        className="peer sr-only"
      />
      <div
        aria-hidden
        className="absolute inset-0 rounded-full bg-neu shadow-neu-inset peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--unit-color)]"
      />
      <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute inset-0 size-full">
        {ticks.map((v) => {
          const a = (dialAngle(v, min, max) * Math.PI) / 180;
          return (
            <line
              key={v}
              x1={50 + 44.5 * Math.sin(a)}
              y1={50 - 44.5 * Math.cos(a)}
              x2={50 + 48 * Math.sin(a)}
              y2={50 - 48 * Math.cos(a)}
              stroke="currentColor"
              strokeWidth={1}
              strokeLinecap="round"
              className="text-slate-400"
            />
          );
        })}
        <circle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${TRACK} ${CIRC}`}
          transform={ARC_ROTATE}
          className="text-slate-300"
        />
        <circle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke={set ? "var(--unit-color)" : "currentColor"}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${len} ${CIRC}`}
          transform={ARC_ROTATE}
          className={cn("transition-[stroke-dasharray]", motion, !set && "text-slate-400")}
        />
        <g
          style={{ transform: `rotate(${angle}deg)`, transformOrigin: "50px 50px" }}
          className={cn("transition-transform", motion)}
        >
          <circle
            cx={50}
            cy={50 - R}
            r={7}
            fill="var(--neu-hi)"
            style={{ filter: "drop-shadow(1px 1px 1.5px var(--neu-lo))" }}
          />
        </g>
        {/* 指・マウスを受ける見えない輪（溝の内外に広げて取りやすく）。中心は受けない */}
        <circle
          ref={hitRef}
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke="transparent"
          strokeWidth={26}
          style={{ pointerEvents: "stroke", touchAction: "none" }}
          className="cursor-pointer"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault(); // 文字の選択とマウスの互換イベントを止める（フォーカスは下で渡す）
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // 捕まえられない環境では、輪の上を動く間だけ追う
            }
            inputRef.current?.focus({ preventScroll: true });
            active.current = true;
            last.current = undefined;
            pick(e);
          }}
          onPointerMove={(e) => {
            if (!active.current) return;
            if (!dragging) setDragging(true);
            pick(e);
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
        />
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className={cn("font-num text-3xl font-bold leading-none", set ? "text-slate-700" : "text-slate-400")}>
          {shown}
        </span>
        <span className="mt-1 text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}
