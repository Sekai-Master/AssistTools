import { type ReactNode, useId, useRef } from "react";
import { useModalA11y } from "../../lib/a11y";
import { cn } from "../../lib/utils";

interface Props {
  /** 見出しの上に小さく出す種類（「読みの頭」「曲」など）。 */
  caption: string;
  title: string;
  /** 見出しの下の 1 行。 */
  sub?: ReactNode;
  onClose: () => void;
  /** 小窓の高さ。一覧を持つ小窓は固定の高さにする（件数で大きさが動かないように）。 */
  className?: string;
  children: ReactNode;
}

/**
 * マスの小窓の枠（お題・曲名で共通）。
 * 作法（data-overlay・useModalA11y・背景の押下で閉じる）は SongSearchModal と同じ。
 */
export function CellSheetFrame({ caption, title, sub, onClose, className, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(true, onClose, dialogRef);

  return (
    <div
      // SongSearchModal と同じ印。開いたまま画面遷移しても位置が飛ばないようにする（motion.css）
      data-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("flex w-full max-w-lg flex-col neu-panel p-4 sm:p-6 focus:outline-none", className)}
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{caption}</p>
            <h2 id={titleId} className="text-xl font-bold text-slate-700 [overflow-wrap:anywhere]">
              {title}
            </h2>
            {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-slate-500 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 小窓の主ボタン（埋める／戻す）。高さ 48px。 */
export function FillButton({ cleared, onSetCleared }: { cleared: boolean; onSetCleared: (v: boolean) => void }) {
  return cleared ? (
    <button
      type="button"
      onClick={() => onSetCleared(false)}
      className="mt-4 min-h-12 w-full shrink-0 rounded-xl bg-neu text-base font-bold text-slate-600 shadow-neu-sm neu-tactile focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
    >
      戻す
    </button>
  ) : (
    <button
      type="button"
      onClick={() => onSetCleared(true)}
      className="neu-cta mt-4 min-h-12 w-full shrink-0 rounded-xl text-base font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
    >
      埋める
    </button>
  );
}
