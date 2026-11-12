import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { GlossaryEntry } from "./lib/guide";

/**
 * タップで意味が出る用語（第 8 章の用語集から）。
 * - 点線の下線のボタン。押すと説明と「→ N.M」へのリンクが小さな吹き出しで出る
 * - もう一度押す・外を押す・Escape で閉じる。ボタンなので Tab で届き、Enter / Space で開け閉めできる
 * - 説明の描画は呼ぶ側（GuideText）から受け取る（循環を避けるため）
 * - 吹き出しは画面の右端からはみ出さないよう、開いたときに左へずらす（はみ出すとページが横に揺れる）
 */
const POP_WIDTH = 288;

export function GuideTerm({
  text,
  entry,
  renderDef,
}: {
  text: string;
  entry: GlossaryEntry;
  renderDef: (entry: GlossaryEntry) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [shift, setShift] = useState(0);
  const id = useId();

  /** 開くときに、吹き出し（幅 POP_WIDTH、狭い画面では画面幅 − 32px）が右端からはみ出す分だけ左へずらす。 */
  const toggle = () => {
    if (!open && wrap.current) {
      const vw = document.documentElement.clientWidth;
      const width = Math.min(POP_WIDTH, vw - 32);
      const left = wrap.current.getBoundingClientRect().left;
      setShift(Math.min(0, vw - 16 - (left + width)));
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
        className="cursor-help border-b border-dotted border-current text-inherit [font:inherit] focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
      >
        {text}
      </button>
      {open && (
        <span
          id={id}
          role="note"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          className="absolute left-0 top-full z-30 mt-1 block w-[288px] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-300 bg-neu p-3 text-left text-sm font-normal leading-relaxed text-slate-600 shadow-neu-sm"
        >
          <span className="block font-bold text-slate-700">{entry.label}</span>
          <span className="mt-1 block">{renderDef(entry)}</span>
          {entry.refs.length > 0 && (
            <span className="mt-2 block text-xs">
              くわしく →{" "}
              {entry.refs.map((r, i) => (
                <span key={r.to}>
                  {i > 0 && "・"}
                  <Link to={r.to} className="font-bold underline" onClick={() => setOpen(false)}>
                    {r.label}
                  </Link>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
