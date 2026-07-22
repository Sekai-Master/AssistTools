import type { CSSProperties, ReactNode } from "react";
import { UNIT_COLOR_VAR, type UnitKey } from "../../lib/units";

interface ToolPageProps {
  /** テーマにするユニット。ページ全体の --unit-color を決める。 */
  unit: UnitKey;
  /** 見出し（斜めカラーバナー付き）。 */
  title: string;
  /** 見出し脇の Material Icons 名（任意）。 */
  icon?: string;
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
export function ToolPage({ unit, title, icon, children }: ToolPageProps) {
  const style = { "--unit-color": UNIT_COLOR_VAR[unit] } as CSSProperties;
  return (
    <div style={style} className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="unit-title text-xl font-bold">
        {icon && (
          <span className="material-icons unit-title__label !ml-0" aria-hidden>
            {icon}
          </span>
        )}
        <span className="unit-title__label">{title}</span>
      </h1>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}
