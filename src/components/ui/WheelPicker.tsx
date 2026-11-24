import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

/** 1 段の高さ（px）。h-10 と同じ。見える段は 3 段なので、ドラムの高さは 3 倍の 120px（h-30）。 */
const ROW = 40;

/**
 * ドラム式（ホイール）のピッカー。min〜max の整数が縦に並び、上下に回すと真ん中の段にスナップして選ばれる。
 * 上下限がはっきりした小さな範囲（例: 0〜30 分）に使う。
 *
 * - 土台はネイティブの range（sr-only）。キーボード（矢印・PageUp/PageDown・Home/End）と読み上げ（VoiceOver の上下スワイプなど）は
 *   そのまま効く（Switch がネイティブの checkbox を土台にしているのと同じ作り）
 * - 見えるドラムは指・マウスで回す。指はブラウザのスクロールとスナップ（CSS の scroll-snap、慣性もブラウザ）、
 *   マウスホイールは 1 目盛り 1 段、クリックした段も選べる。端の先へのホイールはページのスクロールに渡す
 * - value が null（未設定）のときは fallback の段を出す
 */
export function WheelPicker({
  id,
  value,
  fallback,
  min = 0,
  max,
  unit,
  valueText,
  onChange,
  className,
}: {
  /** ラベル（Field の htmlFor）を結ぶ id。range に付く。 */
  id: string;
  value: number | null;
  /** 未設定のときに出す段。 */
  fallback: number;
  min?: number;
  max: number;
  /** 真ん中の段の横に出す単位（「分」など）。 */
  unit: string;
  /** 読み上げの文（aria-valuetext）。 */
  valueText: string;
  onChange: (v: number) => void;
  className?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const shown = clamp(value ?? fallback);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** なめらかに回している途中の行き先。着くまでの途中の段では値を変えない（指が触れたら捨てる）。 */
  const target = useRef<number | null>(null);
  const mounted = useRef(false);
  /** 回し終わり（スクロールが止まって少し経った）にスナップの途中で止まっていたら、近い段へそろえる。 */
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );
  // ホイールの受け口はページに 1 回だけ付ける（passive: false）ので、今の値と onChange は ref で渡す
  const latest = useRef({ shown, onChange });
  useEffect(() => {
    latest.current = { shown, onChange };
  });

  // 値 → ドラムの位置（キーボード・クリック・保存の呼び出し）。指で回したときは同じ段にいるので動かさない
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const top = (shown - min) * ROW;
    const first = !mounted.current;
    mounted.current = true;
    if (Math.round(el.scrollTop / ROW) === shown - min) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (first || reduce || typeof el.scrollTo !== "function") {
      el.scrollTop = top;
      return;
    }
    target.current = shown - min;
    el.scrollTo({ top, behavior: "smooth" });
  }, [shown, min]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const { shown: cur, onChange: change } = latest.current;
      const dir = Math.sign(e.deltaY);
      // 端の先へは回さない。ページのスクロールに渡す（奪わない）
      if (dir === 0 || (dir < 0 && cur <= min) || (dir > 0 && cur >= max)) return;
      e.preventDefault();
      target.current = null;
      // マウスの 1 目盛り（行単位か大きな量）は 1 段。トラックパッドの細かい量は 1 段の高さぶんたまったら 1 段
      if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= ROW) {
        acc = 0;
        change(Math.max(min, Math.min(max, cur + dir)));
        return;
      }
      acc += e.deltaY;
      if (Math.abs(acc) < ROW) return;
      acc -= Math.sign(acc) * ROW;
      change(Math.max(min, Math.min(max, cur + dir)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [min, max]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const at = Math.max(0, Math.min(max - min, Math.round(el.scrollTop / ROW)));
    // ★ ブラウザによっては指を離した後のスナップが段の途中で止まる（ヘッドレスの Chromium で 525px = 13.1 段を見た）
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const box = scrollerRef.current;
      if (!box) return;
      const i = Math.max(0, Math.min(max - min, Math.round(box.scrollTop / ROW)));
      if (Math.abs(box.scrollTop - i * ROW) > 1) box.scrollTop = i * ROW;
    }, 150);
    if (target.current != null) {
      if (at === target.current) target.current = null;
      return;
    }
    if (at + min !== shown) onChange(at + min);
  };

  // 指・マウスで触れたら、なめらかに回している途中でも指を優先する。キーボードの操作は range へ
  const takeOver = () => {
    target.current = null;
    inputRef.current?.focus({ preventScroll: true });
  };

  const values: number[] = [];
  for (let v = min; v <= max; v++) values.push(v);

  return (
    <div className={cn("relative inline-flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={shown}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-valuetext={valueText}
        className="peer sr-only"
      />
      <div
        aria-hidden
        className="relative h-30 w-16 overflow-hidden rounded-lg bg-neu shadow-neu-inset peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--unit-color)]"
      >
        {/* 真ん中の段の帯 */}
        <div className="pointer-events-none absolute inset-x-1 top-10 h-10 rounded-md bg-[color:var(--neu-hi)]" />
        <div
          ref={scrollerRef}
          tabIndex={-1}
          onScroll={onScroll}
          onPointerDown={takeOver}
          onTouchStart={takeOver}
          className="relative h-full snap-y snap-mandatory overflow-y-auto py-10 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {values.map((v) => (
            <div
              key={v}
              data-value={v}
              data-selected={v === shown}
              onClick={() => {
                target.current = null;
                if (v !== shown) onChange(v);
              }}
              className={cn(
                "flex h-10 cursor-pointer snap-center items-center justify-center font-num text-base tabular-nums",
                v === shown ? "font-bold text-slate-800" : "text-slate-400",
              )}
            >
              {v}
            </div>
          ))}
        </div>
      </div>
      <span className="text-slate-500">{unit}</span>
    </div>
  );
}
