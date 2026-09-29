import { useEffect, useState } from "react";
import type { Snapshot, TrackRecord } from "./borderView";

/**
 * /api/border（同じサイトの Pages Functions）から読む。
 *
 * ★ 開催中はボーダーが30分ごとに更新されるので、開いたままでも追いつくよう10分ごとに読み直す。
 *   タブが裏にあるあいだは読まず、戻ってきたときに1回読む。
 */
const REFRESH_MS = 10 * 60_000;

async function getJson<T>(path: string, signal: AbortSignal): Promise<T | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/border/${path}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export interface BorderData {
  current: Snapshot | null;
  record: TrackRecord | null;
  loading: boolean;
  error: string | null;
  now: number;
}

export function useBorderData(): BorderData {
  // 初期値は遅延初期化で1回だけ作る（描画のたびに Date.now() を呼ばない）
  const [data, setData] = useState<BorderData>(() => ({ current: null, record: null, loading: true, error: null, now: Date.now() }));

  useEffect(() => {
    let ctrl = new AbortController();
    const load = () => {
      ctrl.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      Promise.all([getJson<Snapshot>("current", signal), getJson<TrackRecord>("track-record", signal)])
        .then(([current, record]) => setData({ current, record, loading: false, error: null, now: Date.now() }))
        .catch((err: unknown) => {
          if (signal.aborted) return;
          setData((d) => ({ ...d, loading: false, error: err instanceof Error ? err.message : String(err), now: Date.now() }));
        });
    };
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ctrl.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return data;
}
