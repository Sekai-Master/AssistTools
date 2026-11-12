import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * 「詳しく計算する」の段。**主な入力（3〜5 個）の下に 1 つだけ置き、任意の入力をまとめて畳む。**
 * UX 監査 2026-11-12・指示書の共通の型 1。使い方の決まりは docs/design-system.md 7 節。
 *
 * ★ 手本は BINGO の「細かい設定」（pages/bingo/BingoSettings.tsx）。初めは閉じ、閉じていても
 *   使っている設定が分かるように見出しに要約を出す。
 * ★ 見出しには**既定値から変えた項目の数**を出す（changed）。畳んだ中の値も計算に使われるので、
 *   変えたことを忘れたまま結果が変わる事故を防ぐ。数え方は呼ぶ側が countChanged（lib/countChanged.ts）で決める。
 * ★ 中身は閉じていても DOM に残る（<details> の性質）。消すのではなく畳むだけ。
 *
 * @param variant inline = 枠（Panel）の中に置く線の囲み（BINGO と同じ形）。
 *                section = ページの段として置く。見出しを枠の形にし、開いた中身（Panel など）は枠の外に並べる
 *                （枠の中に枠を入れない。design-system.md 6 節の「三重にしない」）。
 */
export function MoreSettings({
  title = "詳しく計算する",
  changed,
  note,
  contents,
  variant = "inline",
  className,
  children,
}: {
  title?: string;
  /** 既定値から変えた項目の数。0 なら出さない */
  changed: number;
  /** 見出しに添える短い要約（例「オートを使用中」）。変えた数とは別に、閉じていても知らせたいもの */
  note?: ReactNode;
  /** 中に何が入っているかの短い一覧（例「基準焚き数・編成・オート」）。閉じていても中身が分かるように */
  contents?: string;
  variant?: "inline" | "section";
  className?: string;
  children: ReactNode;
}) {
  const head = (
    <>
      {/* ★ summary を flex にすると既定の三角が消えるので、開閉の印を自分で出す。
          文字は CSS で出す（data-icon。design-system.md 4 節）。合字の元の文字を要素に入れると、
          見出しの文字として「chevron_right詳しく計算する」と読まれる（検分 #247 低-3） */}
      <span
        aria-hidden
        data-more-settings-marker
        data-icon="chevron_right"
        className="material-icons -ml-1 text-slate-500 transition-transform group-open:rotate-90"
      />
      {title}
      {contents && <span className="text-xs font-normal text-slate-500">{contents}</span>}
      {(changed > 0 || note) && (
        <span className="font-normal text-slate-500">
          （
          {changed > 0 && (
            <>
              <span className="font-num">{changed}</span> 項目を変更中
            </>
          )}
          {changed > 0 && note && "・"}
          {note}）
        </span>
      )}
    </>
  );

  if (variant === "section") {
    return (
      <details className={cn("group", className)}>
        {/* ★ 要約が長いと 320px で見出しの語が割れるので、折り返しは要約ごと次の行へ送る（BingoSettings と同じ） */}
        <summary className="neu-panel flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 px-4 py-3 text-sm font-bold text-slate-600 sm:px-6">
          {head}
        </summary>
        <div className="mt-6 space-y-6">{children}</div>
      </details>
    );
  }

  return (
    <details className={cn("group rounded-lg border border-slate-300", className)}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 px-4 py-2 text-sm font-bold text-slate-600">
        {head}
      </summary>
      <div className="space-y-4 border-t border-slate-300 p-4">{children}</div>
    </details>
  );
}
