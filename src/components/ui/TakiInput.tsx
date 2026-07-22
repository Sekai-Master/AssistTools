/** 焚き数（ライブボーナス消費数 0〜10）の小さな入力。±ボタン＋直接入力。 */
export function TakiInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const btn =
    "neu-raised neu-tactile flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={btn} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <input
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
        className="w-10 rounded-lg bg-neu px-1 py-1 text-center text-slate-800 shadow-neu-inset outline-none"
        aria-label="焚き数"
      />
      <button type="button" className={btn} disabled={value >= 10} onClick={() => onChange(value + 1)}>
        ＋
      </button>
    </span>
  );
}
