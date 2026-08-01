/**
 * 「自動」がどの段階に落ちるかを決めるための環境検出。
 *
 * OS の視差軽減と、端末が「スマホ/タブレットか」を見る。どちらもメディアクエリで、
 * 途中で変わりうる（OS 設定の切り替え、Bluetooth マウスの接続）ので購読する。
 */
import { useSyncExternalStore } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

/**
 * 主入力がタッチで、かつホバーできる装置が1つも無い端末。
 *
 * ★ 画面幅では判定しない。PC でウィンドウを細くしただけで演出が変わってしまい、
 *   「同じ端末なのに挙動が変わる」という説明できない動きになる。
 *
 * `pointer: coarse` だけだとタッチ対応ノートPCも拾ってしまうので、
 * `any-hover: none`（トラックパッドもマウスも一切無い）と AND を取る。
 * これでタッチ操作のできる Windows ノートは「PC」側に残る。
 */
const TOUCH_ONLY = "(pointer: coarse) and (any-hover: none)";

function mq(query: string): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(query);
}

function subscribeTo(query: string) {
  return (listener: () => void): (() => void) => {
    const m = mq(query);
    if (!m) return () => {};
    m.addEventListener("change", listener);
    return () => m.removeEventListener("change", listener);
  };
}

export const prefersReducedMotion = (): boolean => mq(REDUCE)?.matches ?? false;
export const isTouchOnly = (): boolean => mq(TOUCH_ONLY)?.matches ?? false;

const subscribeReduce = subscribeTo(REDUCE);
const subscribeTouch = subscribeTo(TOUCH_ONLY);

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, prefersReducedMotion, () => false);
}

export function useTouchOnly(): boolean {
  return useSyncExternalStore(subscribeTouch, isTouchOnly, () => false);
}

/** いま観測できる環境をまとめて読む（React の外から呼ぶ用）。 */
export function readEnvironment() {
  return { osReduce: prefersReducedMotion(), touchOnly: isTouchOnly() };
}
