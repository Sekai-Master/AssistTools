import { Delta } from "../../components/ui/Delta";

/**
 * 大きな数値＋ラベルの結果セル（結果表示で共用）。
 *
 * delta に生の数値を渡すと、前回からの変化量を一瞬だけ脇に出す。
 * 「入力をいじって結果を見る」の繰り返しで、どのつまみが効くかを分かりやすくする。
 */
export function Stat({
  label,
  value,
  sub,
  delta,
  formatDelta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  formatDelta?: (n: number) => string;
}) {
  return (
    <div className="rounded-xl bg-neu p-4 shadow-neu-inset text-center">
      <div className="text-xs font-bold text-slate-500">
        {label}
        {delta !== undefined && <Delta value={delta} format={formatDelta} />}
      </div>
      <div
        className="mt-1 text-xl font-extrabold tabular-nums leading-tight break-all sm:text-2xl"
        style={{ color: "var(--unit-color)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
