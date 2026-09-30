import { useEffect, useState } from "react";
import type { Snapshot, TrackRecord } from "./borderView";
import { parseHistory, type HistoryPoint } from "./chartData";

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
  /** 開催中（直近）のイベントの推移。順位 → 時刻順の点。読めなければ空 */
  history: Map<number, HistoryPoint[]>;
  loading: boolean;
  error: string | null;
  now: number;
}

/**
 * 推移（グラフ用）。★ グラフは付け足しなので、読めなくてもページ全体は落とさない（空で返す）。
 */
async function getHistory(current: Snapshot | null, signal: AbortSignal): Promise<Map<number, HistoryPoint[]>> {
  if (!current) return new Map();
  try {
    return parseHistory(await getJson<unknown>(`events/${current.event.id}/history`, signal));
  } catch {
    return new Map();
  }
}

export function useBorderData(): BorderData {
  // 初期値は遅延初期化で1回だけ作る（描画のたびに Date.now() を呼ばない）
  const [data, setData] = useState<BorderData>(() => ({
    current: null,
    record: null,
    history: new Map(),
    loading: true,
    error: null,
    now: Date.now(),
  }));

  useEffect(() => {
    let ctrl = new AbortController();
    const load = () => {
      ctrl.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      Promise.all([getJson<Snapshot>("current", signal), getJson<TrackRecord>("track-record", signal)])
        .then(async ([current, record]) => {
          const history = await getHistory(current, signal);
          if (signal.aborted) return;
          setData({ current, record, history, loading: false, error: null, now: Date.now() });
        })
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
