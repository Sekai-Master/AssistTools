/**
 * 明暗テーマ。motion/settingsStore.ts と同じ流儀
 *（バージョン付きキー・try/catch で握り潰し・型を検証してから使う）。
 *
 * ★ CSS 側は light-dark() で両方の値を1箇所に書いてあるので、ここがやることは
 *   :root の color-scheme を固定するかどうかだけ。テーマごとの変数テーブルは無い。
 *     auto  → data-theme を外す（:root の `color-scheme: light dark` ＝ 端末追随）
 *     light → data-theme="light"（color-scheme: light に固定）
 *     dark  → data-theme="dark"
 */
import { useSyncExternalStore } from "react";

export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** ★ index.html のインラインスクリプトにも同じ文字列がある。変えるなら両方。 */
const KEY = "sekaimaster:theme:v1";

export const THEME_LABEL: Record<Theme, string> = {
  auto: "自動",
  light: "ライト",
  dark: "ダーク",
};

export const THEME_NOTE: Record<Theme, string> = {
  auto: "端末の設定に合わせます。OS をダークにすればこのサイトもダークになります。",
  light: "常に明るい配色にします。端末がダークでもこちらが優先されます。",
  dark: "常に暗い配色にします。端末がライトでもこちらが優先されます。",
};

export function parseTheme(raw: unknown): Theme {
  return typeof raw === "string" && (THEMES as readonly string[]).includes(raw)
    ? (raw as Theme)
    : "auto";
}

/** Storage を注入できるようにして node 環境のテストから触れるようにする。 */
export function readTheme(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): Theme {
  try {
    return parseTheme(storage?.getItem(KEY) ?? null);
  } catch {
    // プライベートモード等で getItem 自体が throw することがある。
    return "auto";
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** html[data-theme] を実際の DOM へ反映する。auto は属性ごと外す。 */
export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  if (theme === "auto") delete el.dataset.theme;
  else el.dataset.theme = theme;
}

let current: Theme = readTheme();
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  return current;
}

export function setTheme(next: Theme): void {
  if (next === current) return;
  current = next;
  applyTheme(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // 書けなくてもセッション内では効かせる（保存は best-effort）。
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}

/* ---- 端末の明暗（「自動」が何に解決されたかを見せるため）------------------ */

const DARK = "(prefers-color-scheme: dark)";

function darkQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(DARK);
}

export const prefersDark = (): boolean => darkQuery()?.matches ?? false;

function subscribeDark(listener: () => void): () => void {
  const m = darkQuery();
  if (!m) return () => {};
  m.addEventListener("change", listener);
  return () => m.removeEventListener("change", listener);
}

export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribeDark, prefersDark, () => false);
}

/** 実際に適用される明暗。設定画面の「この端末では〜」表示に使う。 */
export function resolveTheme(theme: Theme, deviceDark: boolean): "light" | "dark" {
  if (theme === "auto") return deviceDark ? "dark" : "light";
  return theme;
}
