import { useEffect, useRef, useState } from "react";

/**
 * 結果が前回からどれだけ動いたかを、一瞬だけ数字の脇に出す。
 *
 * 数値ツールは「入力をいじって結果を見る」の繰り返しなので、**どのつまみが
 * どれだけ効いたか**が分かると調整が速くなる。結果そのものを読み比べて頭で
 * 引き算する手間を省くだけの、地味だが効く表示。
 *
 * ★ 数字そのものは回さない（オドメーター等にしない）。電卓では可読性が第一で、
 *   回転は読みづらさに直結する。「変化を見せる」目的は差分の表示で足りる。
 */
export function useDelta(value: number | null | undefined, holdMs = 2600): number | null {
  const prev = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    const v = typeof value === "number" && Number.isFinite(value) ? value : null;
    const before = prev.current;
    prev.current = v;

    // 初回（比較対象が無い）と、変わっていないときは出さない。
    if (before == null || v == null || before === v) return;
    setDelta(v - before);
    const t = window.setTimeout(() => setDelta(null), holdMs);
    return () => clearTimeout(t);
  }, [value, holdMs]);

  return delta;
}

/**
 * 差分のバッジ。増減で色を変え、しばらくして自然に消える。
 * @param format 表示の作り方。桁区切りや単位はツール側の流儀に合わせる。
 */
export function Delta({
  value,
  format = (n) => n.toLocaleString(),
}: {
  value: number | null | undefined;
  format?: (n: number) => string;
}) {
  const delta = useDelta(value);
  if (delta == null) return null;
  const up = delta > 0;
  return (
    <span
      // 読み上げは邪魔になるので出さない（本体の数値が既に読まれている）。
      aria-hidden
      className={`delta-badge ml-1.5 text-xs font-bold tabular-nums ${
        up ? "text-emerald-500" : "text-rose-500"
      }`}
    >
      {up ? "+" : "−"}
      {format(Math.abs(delta))}
    </span>
  );
}
