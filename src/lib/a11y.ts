import { type KeyboardEvent, type RefObject, useEffect } from "react";

/**
 * div など非フォーカス要素を「ボタンのように」キーボード操作可能にする props。
 *
 * このアプリの中核操作（楽曲選択・プラン選択）は div+onClick で実装されており、
 * Tab でフォーカスできずキーボードだけのユーザーが操作を完了できなかった。
 * 各所で同じ role/tabIndex/onKeyDown を書くと抜け漏れるので1箇所にまとめる。
 *
 * role を上書きしたい場合（listbox の option など）はスプレッド後に role を指定する:
 *   <div {...clickableProps(onSelect)} role="option" aria-selected={...} />
 */
export function clickableProps(onClick?: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      if (!onClick) return;
      // Enter / Space をネイティブボタンと同じく発火させる。
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}

/**
 * モーダルの共通アクセシビリティ。
 *  - Escape で閉じる
 *  - 背景スクロールをロック
 *  - Tab をモーダル内で巡回させるフォーカストラップ
 *  - 開いたら先頭要素にフォーカス、閉じたら元の要素へ戻す
 * containerRef はダイアログ本体の要素。
 */
export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const focusables = (): HTMLElement[] => {
      if (!container) return [];
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
    };

    // autoFocus 等で既にモーダル内へフォーカスが入っていれば奪わない。
    if (!container?.contains(document.activeElement)) {
      (focusables()[0] ?? container)?.focus?.();
    }

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        container?.focus?.();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prevFocus?.focus?.();
    };
  }, [isOpen, onClose, containerRef]);
}

/** キーボードフォーカス時にリングを出す共通クラス（focus-visible のみ＝マウス時は出さない）。 */
export const FOCUS_RING =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";
