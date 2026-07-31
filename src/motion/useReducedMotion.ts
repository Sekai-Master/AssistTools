/**
 * OS の「視差効果を減らす」(prefers-reduced-motion: reduce) を購読する。
 *
 * 設定画面で OS 側を切り替えたときにリロード無しで反映させたいので、
 * 一度読むだけでなく change を購読する。
 */
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function mediaQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(QUERY);
}

function subscribe(listener: () => void): () => void {
  const mq = mediaQuery();
  if (!mq) return () => {};
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
