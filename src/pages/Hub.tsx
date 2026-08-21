import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { UNIT_COLOR_VAR, UNIT_TITLE_INK } from "../lib/units";
import { toolsByCategory, type ToolDef } from "../tools";

/**
 * ランディング（ハブ）。
 *
 * ★ **12枚を平らに並べない。** 全部が同じ重さ・別々の色で光っていて、
 *   「いま何を開けばいいか」が読み取れなかった（Nori 指摘 2026-08-21）。
 *   仕分けの単位は**対象**で、色はカテゴリのもの。色を見れば領域が分かる ── プロセカらしさは残したまま、
 *   色に意味を持たせている。並びと色の正本は src/tools.ts。
 */
export function Hub() {
  const groups = toolsByCategory();
  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="py-10 text-center sm:py-12">
        <h1 className="text-2xl font-bold text-slate-700 sm:text-3xl">
          プロセカをより楽しむためのツール集
        </h1>
        <p className="mt-3 text-slate-500">
          イベランの周回・編成・ポイント調整を数字で詰めるための道具を置いています。
        </p>
      </section>

      <div className="space-y-10 pb-16">
        {groups.map(({ category, tools }) => {
          const accent = UNIT_COLOR_VAR[category.unit];
          return (
            <section
              key={category.id}
              style={
                {
                  "--unit-color": accent,
                  "--accent": accent,
                  "--unit-ink": UNIT_TITLE_INK[category.unit].ink,
                  "--unit-ink-shadow": UNIT_TITLE_INK[category.unit].shadow,
                } as CSSProperties
              }
            >
              {/**
               * 見出しはツールページと同じ色の帯だが、**文字幅まで**にする。
               * ★ ページ見出しと同じ全幅で出すと、4本の極太の色帯が並んで
               *   仕分ける前より騒がしくなる（実機で確認して詰めた）。
               */}
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2 className="unit-title inline-flex shrink-0 py-1 text-sm font-bold">
                  <span>{category.label}</span>
                </h2>
                <p className="text-sm text-slate-500">{category.note}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} accent={accent} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ToolCard({ tool, accent }: { tool: ToolDef; accent: string }) {
  const isReady = tool.status === "ready";
  const card = (
    <div
      // 行き先ページの見出しと同じキー。押すとこのカードが持ち上がり、
      // 他が溶けているあいだ浮いたまま、見出しの形へ飛んで着地する（motion/morph.ts）。
      data-morph={isReady ? `tool:${tool.id}` : undefined}
      className={`h-full neu-panel p-4 ${isReady ? "neu-tactile neu-lit" : "opacity-60"}`}
      style={
        {
          borderTop: `4px solid ${accent}`,
          "--accent": accent,
        } as CSSProperties
      }
    >
      <div className="flex items-center gap-2">
        <span
          className="material-icons text-2xl"
          style={{ color: accent }}
          aria-hidden
        >
          {tool.icon}
        </span>
        <h3 className="min-w-0 flex-1 font-bold text-slate-700">{tool.name}</h3>
        {/**
         * ★ 「使う →」の行を別に立てない。カード全体がリンクなので二重の案内になるし、
         *   1枚あたり1行ぶん高くなる。スマホは1列なので、その1行が12枚ぶん積み上がる。
         */}
        {isReady ? (
          /* ★ 矢印はカテゴリ色で塗らない。明るい色（MORE MORE JUMP! の緑）だと
             ライトテーマの地の上でほぼ見えなくなる。色を持つのは上辺の帯とアイコンだけ。 */
          <span
            className="shrink-0 text-lg font-bold text-slate-400"
            aria-hidden
          >
            →
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-neu px-2 py-0.5 text-[11px] font-bold text-slate-500 shadow-neu-inset">
            準備中
          </span>
        )}
      </div>
      {/**
       * ★ 説明はスマホ2行・PC3行で切る。全文を常に出していたせいでカードの高さが揃わず、
       *   一覧としての見通しが落ちていた。詳しくは開けば書いてある。
       */}
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500 sm:line-clamp-3">
        {tool.description}
      </p>
    </div>
  );
  return isReady ? (
    <Link to={tool.path} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}
