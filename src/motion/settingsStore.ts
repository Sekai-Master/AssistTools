/**
 * モーション設定の永続化。planStorage.ts と同じ流儀
 * （バージョン付きキー・try/catch で握り潰し・型を検証してから使う）。
 *
 * React の外に単一の値を置き、useSyncExternalStore で購読する。設定画面と
 * 遷移ステージが同じ値を見るため、選んだ瞬間に演出が切り替わる。
 */
import { useSyncExternalStore } from "react";
import { MOTION_SETTINGS, type MotionSetting } from "./plan";

const KEY = "sekaimaster:motion:v1";

/**
 * localStorage は旧バージョンの自分や手書きに汚染されうるので、型を見てから使う。
 * 不正値は既定（auto ＝ OS 追随）へ落とす。
 */
export function parseMotionSetting(raw: unknown): MotionSetting {
  return typeof raw === "string" && (MOTION_SETTINGS as readonly string[]).includes(raw)
    ? (raw as MotionSetting)
    : "auto";
}

/** Storage を注入できるようにして node 環境のテストから触れるようにする。 */
export function readMotionSetting(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage()
): MotionSetting {
  try {
    return parseMotionSetting(storage?.getItem(KEY) ?? null);
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

let current: MotionSetting = readMotionSetting();
const listeners = new Set<() => void>();

export function getMotionSetting(): MotionSetting {
  return current;
}

export function setMotionSetting(next: MotionSetting): void {
  if (next === current) return;
  current = next;
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

export function useMotionSetting(): MotionSetting {
  return useSyncExternalStore(subscribe, getMotionSetting, getMotionSetting);
}
