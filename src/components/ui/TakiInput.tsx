import { useState } from "react";

/**
 * 焚き数（ライブボーナス消費数 0〜10）の小さな入力。±ボタン＋直接入力。
 *
 * min は下限（既定 0）。**オートは0焚きができないので 1 を渡す**（2026-11-21 Nori 指摘）。
 * ★ 焚き数をモード間で共有している画面では、ほかのモードで入れた 0 が下限 1 の欄に渡ってくる。
 *   そのときも下限で出し、±は出している値から数える（0 のまま＋して 1 になり、見た目が動かない、にしない）。
 * ★ 下限が 1 以上の欄を消したときは、すぐ下限を入れずに空のまま次の字を待つ。すぐ 1 を入れると、
 *   続けて打った字が後ろに付き、スマホで「5 を消して 3 を打つ」と 13 → 10 焚きになる（画面の確かめで発見）。
 *   打たずに離れたら元の値に戻す。下限 0 の欄は今までどおり、消すと 0。
 */
export function TakiInput({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Math.max(min, Math.min(10, value));
  const step = (v: number) => {
    setDraft(null);
    onChange(v);
  };
  const btn =
    "neu-raised neu-tactile flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={btn} disabled={shown <= min} onClick={() => step(shown - 1)}>
        −
      </button>
      <input
        inputMode="numeric"
        value={draft ?? String(shown)}
        onChange={(e) => {
          const text = e.target.value;
          if (text === "" && min > 0) {
            setDraft("");
            return;
          }
          step(Math.max(min, Math.min(10, Number(text) || 0)));
        }}
        onBlur={() => setDraft(null)}
        className="w-10 rounded-lg bg-neu px-1 py-1 text-center text-slate-800 shadow-neu-inset outline-none"
        aria-label="焚き数"
      />
      <button type="button" className={btn} disabled={shown >= 10} onClick={() => step(shown + 1)}>
        ＋
      </button>
    </span>
  );
}
