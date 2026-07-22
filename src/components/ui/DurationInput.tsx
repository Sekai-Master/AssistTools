/**
 * 時間入力。時・分を直接打てる＋±step分ナッジ。
 * 大きい単位（8時間など）は時フィールドで一発、細かい調整は±ボタンで。
 */
export function DurationInput({
  value,
  onChange,
  step = 30,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const h = Math.floor(value / 60);
  const m = value % 60;
  const cell =
    "w-10 rounded-lg bg-neu px-1 py-1 text-center text-slate-800 shadow-neu-inset outline-none";
  const btn =
    "neu-raised neu-tactile flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className={btn}
        disabled={value <= 0}
        aria-label={`${step}分減らす`}
        onClick={() => onChange(Math.max(0, value - step))}
      >
        −
      </button>
      <input
        inputMode="numeric"
        value={String(h)}
        onChange={(e) => onChange(Math.max(0, (Number(e.target.value) || 0) * 60 + m))}
        className={cell}
        aria-label="時間"
      />
      <span className="text-xs text-slate-500">時間</span>
      <input
        inputMode="numeric"
        value={String(m)}
        onChange={(e) => onChange(Math.max(0, h * 60 + Math.min(59, Number(e.target.value) || 0)))}
        className={cell}
        aria-label="分"
      />
      <span className="text-xs text-slate-500">分</span>
      <button
        type="button"
        className={btn}
        aria-label={`${step}分増やす`}
        onClick={() => onChange(value + step)}
      >
        ＋
      </button>
    </span>
  );
}
