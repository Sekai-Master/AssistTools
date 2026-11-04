import { useEffect, useState } from "react";
import type { Snapshot } from "../border/borderView";

/**
 * トップ用に、開催中のイベントの1行（/api/border/current）だけを読む。
 *
 * ボーダー予測のページ（useBorderData）と同じく、開いたままでも追いつくよう10分ごとに読み直し、
 * タブが裏にあるあいだは読まない。トップは答え合わせ・推移を出さないので、その2つは読まない
 * （Workers のリクエストは1回の表示で1回。上限10万/日に対して、トップは1日30回ほど）。
 */
const REFRESH_MS = 10 * 60_000;

export interface CurrentBorder {
  current: Snapshot | null;
  loading: boolean;
}

export function useCurrentBorder(): CurrentBorder {
  const [data, setData] = useState<CurrentBorder>({ current: null, loading: true });

  useEffect(() => {
    let ctrl = new AbortController();
    const load = () => {
      ctrl.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      fetch(`${import.meta.env.BASE_URL}api/border/current`, { signal })
        .then(async (res) => (res.ok ? ((await res.json()) as Snapshot) : null))
        .then((current) => {
          if (!signal.aborted) setData({ current: isSnapshot(current) ? current : null, loading: false });
        })
        .catch(() => {
          // ★ トップでは付け足しの欄なので、読めなければ欄ごと出さない（ツールの一覧は出す）
          if (!signal.aborted) setData((d) => ({ ...d, loading: false }));
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

/** 形の崩れた応答で画面を落とさない（イベントと順位の配列があるものだけ使う）。 */
function isSnapshot(v: unknown): v is Snapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<Snapshot>;
  return (
    !!s.event &&
    typeof s.event.id === "number" &&
    typeof s.event.startAt === "number" &&
    typeof s.event.aggregateAt === "number" &&
    Array.isArray(s.ranks)
  );
}
