import { useCallback, useLayoutEffect, useRef } from "react";

/** 状態が変わった直後に押下を無視する長さ（ms）。二度押しの間隔（だいたい 100〜400ms）より長く、1 周より十分短い。 */
export const TAP_GUARD_MS = 600;

/**
 * 計測の状態（計測前・計測中・中断中）が変わった直後の押下を無視するための判定。
 *
 * ★ 検分 #241 高-1: 開始の直後に同じ点をもう一度押すと、そこへ来た「1つ戻す」「終了して保存」に当たって
 *   計測が消えた・終わった。「終了して保存」の二度押しでは次の計測が勝手に始まった。
 *   主ボタンは固定バーに置いて動かなくしたが、二度押しそのものも状態の変わり目では受け付けない。
 * ★ 初めの描画は「変わった」に数えない（開いた直後の 1 押しを捨てない）。
 * ★ 時刻は Date.now（計測の記録と同じ時計）。押した手で状態が変わると、その描画の直後にここで時刻を取る。
 *
 * @returns 押下を無視すべきなら true を返す関数
 */
export function useTapGuard(phase: string, ms: number = TAP_GUARD_MS): () => boolean {
  const changedAt = useRef<number | null>(null);
  const prev = useRef(phase);

  useLayoutEffect(() => {
    if (prev.current === phase) return;
    prev.current = phase;
    changedAt.current = Date.now();
  }, [phase]);

  return useCallback(
    () => changedAt.current != null && Date.now() - changedAt.current < ms,
    [ms],
  );
}
