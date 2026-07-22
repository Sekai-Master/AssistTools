/** 大きな数値＋ラベルの結果セル（ゲージ計算機の結果表示で共用）。 */
export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-neu p-4 shadow-neu-inset text-center">
      <div className="text-xs font-bold text-slate-500">{label}</div>
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
