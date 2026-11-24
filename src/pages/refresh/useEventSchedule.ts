import { useEffect, useState } from "react";
import { useCurrentBorder } from "../hub/useCurrentBorder";

/** イベ乙までの行に使う回の期間。 */
export interface EventSchedule {
  startAt: number;
  /** 集計の時刻（20:59:59） */
  aggregateAt: number;
}

interface Memo {
  at: number;
  schedule: EventSchedule | null;
}

/** /api/border/upcoming の覚え（ページの中だけ）。出し直しのたびに読みに行かない。 */
let upcomingMemo: Memo | null = null;

/** テスト用: 覚えている次の回を捨てる。 */
export function forgetUpcoming(): void {
  upcomingMemo = null;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** /api/border/upcoming の応答から期間を取り出す。形が違えば null。 */
export function parseUpcoming(v: unknown): EventSchedule | null {
  if (!v || typeof v !== "object") return null;
  const e = (v as { event?: unknown }).event as Partial<EventSchedule> | undefined;
  if (!e || !num(e.startAt) || !num(e.aggregateAt)) return null;
  return { startAt: e.startAt, aggregateAt: e.aggregateAt };
}

/**
 * イベ乙までの行に使う回。開催中（/api/border/current の回が集計前）ならその回、終わっていれば次の回（/api/border/upcoming）。
 * どちらも同じオリジンの Pages Functions（プライバシーポリシー第 5 項）。分からなければ null。
 *
 * ★ 次の回を読むのは、current を読み終えてその回が終わっているときだけ。覚えている値が freshMs より新しければ読まない。
 */
export function useEventSchedule(now: number, freshMs: number): EventSchedule | null {
  const { current, loading } = useCurrentBorder({ freshMs });
  const running = current != null && current.event.aggregateAt > now;
  const needUpcoming = !loading && !running;
  const [upcoming, setUpcoming] = useState<EventSchedule | null>(() => upcomingMemo?.schedule ?? null);

  useEffect(() => {
    if (!needUpcoming) return;
    if (upcomingMemo && Date.now() - upcomingMemo.at < freshMs) return;
    const ctrl = new AbortController();
    fetch(`${import.meta.env.BASE_URL}api/border/upcoming`, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`upcoming: ${res.status}`);
        return parseUpcoming(await res.json());
      })
      .then((schedule) => {
        if (ctrl.signal.aborted) return;
        upcomingMemo = { at: Date.now(), schedule };
        setUpcoming(schedule);
      })
      .catch(() => {
        // 付け足しの行。読めなければ出さない（前の値のまま）
      });
    return () => ctrl.abort();
  }, [needUpcoming, freshMs]);

  if (running && current) return { startAt: current.event.startAt, aggregateAt: current.event.aggregateAt };
  return needUpcoming ? upcoming : null;
}
