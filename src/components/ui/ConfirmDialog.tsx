import { useId, useRef, type ReactNode } from "react";
import { useModalA11y } from "../../lib/a11y";
import { NeuButton } from "./NeuButton";

/**
 * 取り返しのつかない書き込みの前に挟む確認。
 *
 * ★ **「何が・どこへ」を本文に出すこと。** 「よろしいですか？」だけの確認は、
 *   方向を取り違えている人には効かない（取り違えたまま「はい」を押す）。
 *   ここは children に差分を並べる前提で作ってある。
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel = "上書きする",
  cancelLabel = "やめる",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(open, onCancel, dialogRef);
  if (!open) return null;

  return (
    <div
      // 開いたまま遷移したときにブロック演出を降ろすための印（SongSearchModal と同じ）。
      data-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="neu-panel w-full max-w-md p-5"
      >
        <h2 id={titleId} className="text-base font-bold text-slate-700">
          {title}
        </h2>
        <div className="mt-3 text-sm text-slate-600">{children}</div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <NeuButton className="!px-3 !py-1.5 !text-sm" onClick={onCancel}>
            {cancelLabel}
          </NeuButton>
          <NeuButton className="!px-3 !py-1.5 !text-sm" onClick={onConfirm}>
            {confirmLabel}
          </NeuButton>
        </div>
      </div>
    </div>
  );
}
