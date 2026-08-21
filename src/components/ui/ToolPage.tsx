import type { CSSProperties, ReactNode } from "react";
import { UNIT_COLOR_VAR, UNIT_TITLE_INK, type UnitKey } from "../../lib/units";
import { unitOf } from "../../tools";
import { cn } from "../../lib/utils";

interface ToolPageProps {
  /**
   * テーマにするユニット。ページ全体の --unit-color を決める。
   *
   * ★ **ツールでは指定しない。** morphKey（`tool:<id>`）から仕分けの色を引く。
   *   色はカテゴリのもので、ツール側に書くと登録簿と二重管理になる。
   *   ツールではないページ（規約・ポリシー・更新履歴）だけがここで指定する。
   */
  unit?: UnitKey;
  /**
   * 共有要素のキー（ツール id）。ハブのカードと同じ値を入れると、
   * 「カード → この見出し」が1つの動きとして繋がる（motion/morph.ts）。
   * 省略しても見た目は変わらない ── ふつうの遷移になるだけ。
   */
  morphKey?: string;
  /** 見出し（斜めカラーバナー付き）。 */
  title: string;
  /** 見出し脇の Material Icons 名（任意）。 */
  icon?: string;
  /** 2カラム等で広い横幅が要るツール向け。既定は従来どおり max-w-3xl。 */
  wide?: boolean;
  children: ReactNode;
}

/**
 * 各ツールページの共通シェル。
 * - ページのテーマ色（--unit-color）を1箇所で設定
 * - ユニットカラーの斜めバナー見出し
 * - 一貫した最大幅・左右余白・縦リズム（余白システムの中核）
 *
 * 各ツールはこの中に <Panel> を積むだけで余白が揃う。
 */
export function ToolPage({
  unit,
  title,
  icon,
  wide = false,
  morphKey,
  children,
}: ToolPageProps) {
  const resolved = unit ?? unitOf(morphKey?.replace(/^tool:/, "") ?? "");
  const style = {
    "--unit-color": UNIT_COLOR_VAR[resolved],
    "--unit-ink": UNIT_TITLE_INK[resolved].ink,
    "--unit-ink-shadow": UNIT_TITLE_INK[resolved].shadow,
  } as CSSProperties;
  return (
    <div
      style={style}
      className={cn(
        "mx-auto w-full px-4 py-6 sm:py-8",
        wide ? "max-w-6xl" : "max-w-3xl",
      )}
    >
      <h1 className="unit-title text-xl font-bold" data-morph={morphKey}>
        {icon && (
          <span className="material-icons" aria-hidden>
            {icon}
          </span>
        )}
        <span>{title}</span>
      </h1>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}
