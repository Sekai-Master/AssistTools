import { useCallback, useEffect, useRef, useState } from "react";
import { initialState, normalize, type LapState } from "./lib/lap";

/** ★ 新設したら src/pages/settings/lib/storedItems.ts にも足すこと。 */
export const LAP_STORAGE_KEY = "sekaimaster:lap:v1";

/**
 * 計測の状態を保存しながら持つ。
 *
 * ★ **保存できていないことに気付かないまま数時間測って全損する**のが最悪の事故。
 *   書き込みに失敗したら黙らず、画面に出す（saveError）。
 */
/** 保存されている記録を読む。読めなければ初期値。 */
export function loadLapState(): LapState {
  try {
    const raw = localStorage.getItem(LAP_STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : initialState();
  } catch {
    return initialState();
  }
}

export function useLapTimer() {
  // ★ 読み込みは最初の描画で1回だけ。効果の中で読んで setState すると、
  //   一瞬「記録なし」の画面が出てから戻る（開始ボタンが出たり消えたりする）。
  const [state, setInner] = useState<LapState>(loadLapState);
  // 直前の値を持つ写し。**描画では読まない**（更新と保存のときだけ使う）。
  const ref = useRef<LapState | null>(null);
  const [saveError, setSaveError] = useState(false);

  const setState = useCallback((next: LapState) => {
    ref.current = next;
    setInner(next);
    try {
      localStorage.setItem(LAP_STORAGE_KEY, JSON.stringify(next));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, []);

  // ★ 直前の値は ref から取る。**保存は状態更新の中でやらない**
  //   （更新関数は React が2回呼ぶことがあり、副作用を置く場所ではない）。
  const update = useCallback(
    (f: (s: LapState) => LapState) =>
      setState(f(ref.current ?? loadLapState())),
    [setState],
  );

  return { state, setState, update, saveError };
}

/**
 * 1秒ごとに再描画するための値。**計測中だけ動かす。**
 * 止まっているときにも回すと、何もしていない画面が毎秒描き直される。
 */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * 計測中に画面が消えると押せないので、可能なら消灯を抑止する。
 *
 * ★ iOS は低電力モードで reject する。深夜の周回中に自動で入ると押し逃すので、
 *   取れなかったことは黙らずに返す（画面側で「自動ロックを切って」と出す）。
 */
export function useWakeLock(active: boolean): { failed: boolean } {
  const [failed, setFailed] = useState(false);
  const ref = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      ref.current?.release().catch(() => {});
      ref.current = null;
      return;
    }
    if (!("wakeLock" in navigator)) return;
    let cancelled = false;

    const acquire = async () => {
      if (ref.current) return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          s.release().catch(() => {});
          return;
        }
        ref.current = s;
        s.addEventListener("release", () => {
          ref.current = null;
        });
        setFailed(false);
      } catch {
        ref.current = null;
        setFailed(true);
      }
    };
    // タブを戻したときに取り直す（バックグラウンドで自動的に外れるため）。
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      ref.current?.release().catch(() => {});
      ref.current = null;
    };
  }, [active]);

  return { failed };
}

/** 計測中の離脱を止める（タブを閉じると記録は残るが、続きが測れなくなる）。 */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [active]);
}
