import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

/** 1 段の高さ（px）。押せる高さの 44px（h-11）。 */
export const WHEEL_ROW = 44;
/**
 * 上下の段の見せる量（px）。1 段の 6 割（4 割は隠す）。ドラムの高さは 44 + 26 × 2 = 96px（h-24）。
 * 上下の余白も同じ量にするので、i 段目が真ん中に来るスクロール位置は i × 44px のまま（2026-11-25 持ち主「もっと細く」）。
 */
export const WHEEL_PEEK = 26;
/** 回し終わり（最後のスクロールから）の待ち時間。この後にそろえる・指を離したことにする。 */
const SETTLE_MS = 150;

/**
 * ドラム式（ホイール）のピッカー。min〜max の整数が縦に並び、上下に回すと真ん中の段にスナップして選ばれる。
 * 上下限がはっきりした小さな範囲（例: 0〜30 分）に使う。
 *
 * - 土台はネイティブの range（sr-only）。キーボード（矢印・PageUp/PageDown・Home/End）と読み上げ（VoiceOver の上下スワイプなど）は
 *   そのまま効く（Switch がネイティブの checkbox を土台にしているのと同じ作り）
 * - 見えるドラムは指・マウスで回す。指はブラウザのスクロールとスナップ（CSS の scroll-snap、慣性もブラウザ）、
 *   マウスホイールは 1 目盛り 1 段、クリックした段も選べる。端の先へのホイールはページのスクロールに渡す
 * - value が null（未設定）のときは fallback の段を出す。その段をクリックすると値が入る
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
  /** なめらかに回している途中の行き先（段の番号）。着くまでの途中の段では値を変えない。 */
  const target = useRef<number | null>(null);
  /**
   * 指で回している途中か（触れてから、回し終わりの待ちが済むまで）。この間は値からドラムを動かさない。
   * ★ 慣性で回っている最中に、値の更新から scrollTo で引き戻すと、慣性を奪って行き来する（iOS Safari。検分 #286 M）
   */
  const fingering = useRef(false);
  /** スクロールから入れた値。この値への更新では、ドラムを動かさない（もう動いている）。 */
  const fromScroll = useRef<number | null>(null);
  const mounted = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );
  // ホイールの受け口はページに 1 回だけ付ける（passive: false）ので、今の値と onChange は ref で渡す
  const latest = useRef({ shown, onChange });
  useEffect(() => {
    latest.current = { shown, onChange };
  });

  const indexOf = (el: HTMLElement) => Math.max(0, Math.min(max - min, Math.round(el.scrollTop / WHEEL_ROW)));

  // 値 → ドラムの位置（キーボード・クリック・ホイール・保存の呼び出し）
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const first = !mounted.current;
    mounted.current = true;
    if (fromScroll.current === shown) {
      fromScroll.current = null;
      return;
    }
    fromScroll.current = null;
    if (fingering.current || Math.round(el.scrollTop / WHEEL_ROW) === shown - min) return;
    const top = (shown - min) * WHEEL_ROW;
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

  /**
   * 回し終わり（最後のスクロールから SETTLE_MS 経った）。
   * - なめらかに回している途中で止まっていたら（行き先 target が残っていたら）、値の段へ置き直して行き先を捨てる（検分 #286 M）
   * - 指で回したあと段の途中で止まっていたら、近い段へそろえる（ヘッドレスの Chromium で 13.1 段で止まるのを見た）
   * - 指で回している印を下ろす
   */
  const scheduleSettle = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      fingering.current = false;
      const el = scrollerRef.current;
      if (!el) return;
      if (target.current != null) {
        el.scrollTop = target.current * WHEEL_ROW;
        target.current = null;
        return;
      }
      const i = indexOf(el);
      if (Math.abs(el.scrollTop - i * WHEEL_ROW) > 1) el.scrollTop = i * WHEEL_ROW;
      const { shown: cur, onChange: change } = latest.current;
      if (i + min !== cur) {
        fromScroll.current = i + min;
        change(i + min);
      }
    }, SETTLE_MS);
  };

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
      fingering.current = false;
      // マウスの 1 目盛り（行単位か大きな量）は 1 段。トラックパッドの細かい量は 1 段の高さぶんたまったら 1 段
      if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= WHEEL_ROW) {
        acc = 0;
        change(Math.max(min, Math.min(max, cur + dir)));
        return;
      }
      acc += e.deltaY;
      if (Math.abs(acc) < WHEEL_ROW) return;
      acc -= Math.sign(acc) * WHEEL_ROW;
      change(Math.max(min, Math.min(max, cur + dir)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [min, max]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    scheduleSettle();
    const at = indexOf(el);
    if (target.current != null) {
      if (at === target.current) target.current = null;
      return;
    }
    if (at + min !== shown) {
      fromScroll.current = at + min;
      onChange(at + min);
    }
  };

  // 指で触れたら、なめらかに回している途中でも指を優先する。キーボードの操作は range へ
  const onTouchStart = () => {
    target.current = null;
    fingering.current = true;
    inputRef.current?.focus({ preventScroll: true });
  };
  const onPointerDown = () => {
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
        className="relative h-24 w-12 overflow-hidden rounded-lg bg-neu shadow-neu-inset peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--unit-color)]"
      >
        {/* 真ん中の段の帯（上から WHEEL_PEEK） */}
        <div className="pointer-events-none absolute inset-x-1 top-[26px] h-11 rounded-md bg-[color:var(--neu-hi)]" />
        <div
          ref={scrollerRef}
          tabIndex={-1}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onTouchStart={onTouchStart}
          // 触れただけで回さなかったときも、指の印を下ろす
          onTouchEnd={scheduleSettle}
          // 上下の段は端へ向かって薄く（真ん中の段 27〜73% はそのまま）
          className="relative h-full snap-y snap-mandatory overflow-y-auto py-[26px] select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,rgb(0_0_0/0.4),#000_27%,#000_73%,rgb(0_0_0/0.4))] [-webkit-mask-image:linear-gradient(to_bottom,rgb(0_0_0/0.4),#000_27%,#000_73%,rgb(0_0_0/0.4))]"
        >
          {values.map((v) => (
            <div
              key={v}
              data-value={v}
              data-selected={v === shown}
              onClick={() => {
                target.current = null;
                fingering.current = false;
                // 未設定のときは、出している段（fallback）を押しても値を入れる（回した状態にする）
                if (v !== shown || value == null) onChange(v);
              }}
              className={cn(
                "flex h-11 cursor-pointer snap-center items-center justify-center font-num text-base tabular-nums",
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
