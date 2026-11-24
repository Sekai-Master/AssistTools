import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/utils";
import {
  DIAL_SWEEP_DEG,
  type DialDrag,
  dialAngle,
  dialAngleOfPoint,
  dialMove,
  dialStart,
} from "./dialMath";

/** 目盛りの円（viewBox 100 の中）。溝と値の弧はこの円の 300° ぶん。 */
const R = 38;
const CIRC = 2 * Math.PI * R;
const TRACK = (CIRC * DIAL_SWEEP_DEG) / 360;
/**
 * 指の位置を拾わない内側（直径に対する半径の比）。指を受ける輪の内側の縁と同じ（下の見えない輪は半径 25〜50）。
 * 回している途中に中心をまたぐと、ここを抜けた先で向きが反転するので、dialMove が「跳び」として前の値で止める。
 */
const INNER = 0.25;
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
  /** 回している途中の状態（null は回していない）。dialMath の dialStart・dialMove が作る。 */
  const drag = useRef<DialDrag | null>(null);
  // 回している間は、つまみの動きを指に遅れさせない（押した所へ飛ぶときだけ動かす）
  const [dragging, setDragging] = useState(false);

  const end = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    // 輪をなぞってもページがスクロールしないように。React の touch は passive なので、ここだけ自前で付ける
    const el = hitRef.current;
    const noScroll = (e: TouchEvent) => e.preventDefault();
    el?.addEventListener("touchstart", noScroll, { passive: false });
    // ★ 指を捕まえられない環境では、輪の外で離すと輪に pointerup が来ない。ページのどこで離しても終える
    //   （終えないと、ボタンを押さずに輪の上を動かすだけで値が変わる。検分 #279 L）
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      el?.removeEventListener("touchstart", noScroll);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [end]);

  /** 指の向き。中心の近く（輪の内側）は向きが定まらないので null（その移動は無かったことにする）。 */
  const angleOf = (e: ReactPointerEvent<SVGCircleElement>): number | null => {
    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < rect.width * INNER) return null;
    return dialAngleOfPoint(dx, dy);
  };

  const commit = (s: DialDrag) => {
    drag.current = s;
    if (s.value !== value) onChange(s.value);
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
            const deg = angleOf(e);
            if (deg != null) commit(dialStart(deg, min, max));
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            // ボタンを離したのに終わっていなければ、ここで終える（マウス）
            if (e.pointerType === "mouse" && e.buttons === 0) return end();
            const deg = angleOf(e);
            if (deg == null) return;
            if (!dragging) setDragging(true);
            commit(dialMove(drag.current, deg, min, max));
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
