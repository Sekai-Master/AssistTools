import type { KeyboardEvent } from "react";

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

/** キーボードフォーカス時にリングを出す共通クラス（focus-visible のみ＝マウス時は出さない）。 */
export const FOCUS_RING =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";
