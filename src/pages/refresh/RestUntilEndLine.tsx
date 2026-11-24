import { useEffect, useState } from "react";
import { useCurrentBorder } from "../hub/useCurrentBorder";
import { clockToMs, formatEventEnd, restUntilEnd, restUntilEndParts } from "./lib/restUntilEnd";

interface Props {
  /** 起点のゲージ（表示%） */
  startPercent: number;
  /** 起点で繰り越している減少タイマーの進捗（分） */
  decayProgressMin: number;
  /** 残りを走る曲（上で選んでいる曲）と周回のロス */
  refreshConstant: number;
  songLengthSec: number;
  overheadSec: number;
  /**
   * 起点の時刻。省略は「いま」（リフレッシュゲージ）。
   * 周回プランは積んだタイムラインの終わり（開始時刻の時計 + 総時間）。
   */
  from?: { startMinOfDay: number; offsetMinutes: number };
  className?: string;
}

/**
 * 「イベ乙（11/29 20:59）までに、あと合計 2時間30分休めば 100% ちょうど」の 1 行（計算は lib/restUntilEnd.ts）。
 *
 * イベ乙の時刻は /api/border/current（同じサイトの Pages Functions。トップの開催中のイベントと同じ読み口）の回の aggregateAt。
 * ★ 利用者のブラウザから外部へ接続しない（プライバシーポリシー第 5 項）ので、同じオリジンのものだけを使う。
 *   その回が終わっていて次の回の日程が分からない（次の回は始まるまで current に出ない）あいだは、この行を出さない。
 */
export function RestUntilEndLine({
  startPercent,
  decayProgressMin,
  refreshConstant,
  songLengthSec,
  overheadSec,
  from,
  className = "",
}: Props) {
  const { current } = useCurrentBorder();
  const now = useMinuteClock();
  if (!current) return null;
  const aggregateAt = current.event.aggregateAt;
  const originMs = from ? clockToMs(from.startMinOfDay, now) + from.offsetMinutes * 60_000 : now;
  const r = restUntilEnd({
    startPercent,
    decayProgressMin,
    minutesLeft: (aggregateAt - originMs) / 60_000,
    refreshConstant,
    songLengthSec,
    overheadSec,
  });
  if (!r) return null;
  const [lead, value, trail] = restUntilEndParts(r, formatEventEnd(aggregateAt));
  return (
    <p className={`text-sm text-slate-600 ${className}`}>
      {lead}
      <span className="font-bold" style={{ color: "var(--unit-color)" }}>
        {value}
      </span>
      {trail}
    </p>
  );
}

/** いまの時刻。残りの分が古くならないよう 1 分ごとに進める（この行だけを描き直す）。 */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}
