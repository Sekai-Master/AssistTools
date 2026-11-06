import { Fragment, useId, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { UNIT_COLOR_VAR } from "../../lib/units";
import { TOOL_CATEGORIES, toolsByCategory, type ToolDef } from "../../tools";
import { nameParts, searchTools } from "./hubView";

/**
 * トップのツールの一覧。分類ごとの枠に、アイコンと名前だけを並べる。
 *
 * ★ 説明文は一覧に出さない（2026-11-05、Nori「画面に文字が多すぎると『うっ』ってなる」）。
 *   以前のカードは14枚ぶんの説明（約900字）と分類の説明（約140字）を常に出していた。
 *   説明は検索の照合に使い、検索しているあいだだけ1行添える（名前に無い語「ライボ」「家具」でも辿り着ける）。
 * ★ 色は分類の印（見出しの下線）だけ。アイコンは文字と同じ灰色。
 * ★ スマホは分類を全幅にして、中を2列にする（分類ごとの縦積みで長くならないように）。
 * ★ 枠に入れるのは分類まで（2026-11-06、Nori が4通りの撮影から選んだ）。行は平らにして、触ったときだけ浮き、押すと沈む。
 *   行ごとに影を付けると14個並んで騒がしい。
 *
 * data-morph は以前のカードと同じキーを行に付ける。押した行がツールの見出しへ飛ぶ（motion/morph.ts）。
 */
export function ToolDirectory() {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const hits = useMemo(() => searchTools(query), [query]);

  return (
    <section aria-labelledby={`${inputId}-head`} className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id={`${inputId}-head`} className="text-lg font-bold text-slate-700">
          プロセカをより楽しむためのツール集
        </h1>
        {/* ★ 入力欄は outline-none なので、包む側でフォーカスを見せる（キーボードで来た人にキャレットしか見えなかった。#194 のレビュー M6） */}
        <label
          htmlFor={inputId}
          className="flex h-11 w-full items-center gap-2 rounded-full px-3.5 shadow-neu-inset focus-within:ring-2 focus-within:ring-slate-400 sm:w-80"
        >
          <span className="material-icons text-xl text-slate-500" aria-hidden data-icon="search" />
          <span className="sr-only">ツールを探す</span>
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ツールを探す（例: ボーダー）"
            className="min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      {/* ★ 件数の読み上げ: 検索を始めた瞬間に要素ごと差し込むと、最初の件数を読まない読み上げソフトがある。常に置いておく */}
      <p className={hits ? "mt-4 text-xs text-slate-500" : "sr-only"} role="status">
        {hits ? (hits.length > 0 ? `${hits.length}件` : "見つかりませんでした") : ""}
      </p>
      {hits ? (
        hits.length > 0 && (
          <ul className="neu-panel mt-2 grid gap-x-4 p-3 sm:grid-cols-2">
            {hits.map((t) => (
              <li key={t.id}>
                <ToolRow tool={t} detail />
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          {toolsByCategory().map(({ category, tools }) => (
            <section key={category.id} aria-labelledby={`${inputId}-${category.id}`} className="neu-panel p-3">
              <h2
                id={`${inputId}-${category.id}`}
                className="border-b-[3px] pb-1.5 text-sm font-bold text-slate-700"
                style={{ borderColor: UNIT_COLOR_VAR[category.unit] }}
              >
                {category.label}
              </h2>
              <ul className="mt-1.5 grid grid-cols-2 gap-x-2 lg:grid-cols-1">
                {tools.map((t) => (
                  <li key={t.id}>
                    <ToolRow tool={t} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function ToolRow({ tool, detail = false }: { tool: ToolDef; detail?: boolean }) {
  const ready = tool.status === "ready";
  const color = UNIT_COLOR_VAR[categoryUnit(tool)];
  const body = (
    <span data-morph={ready ? `tool:${tool.id}` : undefined} className={`flex h-full min-h-11 items-center gap-2 rounded-lg px-1 py-1 ${ready ? ROW_TOUCH : ""}`}>
      <span className="material-icons shrink-0 text-xl text-slate-500" aria-hidden data-icon={tool.icon} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[0.8125rem] leading-snug text-slate-700 max-[340px]:text-xs sm:text-sm">
          {detail && (
            <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: color } as CSSProperties} />
          )}
          {/* ★ 名前は決まった語の前（<wbr>）でだけ折る（nameParts）。語の途中で折れていた（2026-11-05 の撮影）。
                それでも入らない幅のときだけ、どこでも折る（隣の列へはみ出さない） */}
          <span className="min-w-0 [overflow-wrap:anywhere] [word-break:keep-all]">
            {nameParts(tool.name).map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <wbr />}
                {part}
              </Fragment>
            ))}
          </span>
          {!ready && <span className="shrink-0 text-xs text-slate-500">準備中</span>}
        </span>
        {/* ★ line-clamp に block を足すと display が上書きされて切り詰めが効かない（#194 のレビュー M2） */}
        {detail && <span className="mt-0.5 line-clamp-1 text-xs text-slate-500">{tool.description}</span>}
      </span>
    </span>
  );
  return ready ? (
    <Link to={tool.path} className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">
      {body}
    </Link>
  ) : (
    <div className="opacity-60">{body}</div>
  );
}

const ROW_TOUCH = "hover:shadow-neu-sm active:shadow-neu-inset motion-safe:transition-shadow motion-safe:duration-150";

function categoryUnit(tool: ToolDef) {
  return TOOL_CATEGORIES.find((c) => c.id === tool.category)?.unit ?? "vs";
}
