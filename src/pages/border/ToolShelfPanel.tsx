import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../../components/ui/Panel";
import { cn } from "../../lib/utils";
import type { ToolDef } from "../../tools";
import { nameParts } from "../hub/hubView";
import type { ToolShelf } from "./toolShelf";

/**
 * 「いま使えるツール」の枠（中身の選び方は toolShelf.ts）。開催中のイベントの枠の後、推移の前に置く。
 *
 * ★ 行の字・アイコン・タップの領域は、トップの一覧の行（hub/ToolDirectory.tsx の ToolRow）と同じ:
 *   アイコン 20px・名前 13px（sm から 14px）・高さ 44px 以上。スマホは 2 列、sm から横に 3 列。
 * ★ 行は平らに置き、触ったときだけ浮かせて押すと沈ませる（docs/design-system.md の 6 節。枠の中は 1 段まで）。
 * ★ 先頭に大きく出す行（終盤のアナライザー）は線の囲みにして、名前を 16px・太字にし、説明（src/tools.ts の description）を添える。
 *   囲みを影にしないのは、枠の中で影を二重にしないため（同じ 6 節）。
 */
export function ToolShelfPanel({ shelf }: { shelf: ToolShelf }) {
  return (
    <Panel title="いま使えるツール">
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-3 sm:gap-x-4">
        {shelf.items.map(({ tool, lead }) => (
          <li key={tool.id} className={lead ? "col-span-2" : undefined}>
            <ShelfLink tool={tool} lead={lead} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** トップの一覧の行と同じ触り心地（hub/ToolDirectory.tsx の ROW_TOUCH）。トップを変えないので写して持つ */
const ROW_TOUCH = "hover:shadow-neu-sm active:shadow-neu-inset motion-safe:transition-shadow motion-safe:duration-150";

function ShelfLink({ tool, lead }: { tool: ToolDef; lead: boolean }) {
  return (
    <Link to={tool.path} className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">
      <span
        className={cn("flex h-full min-h-11 gap-2 rounded-lg", lead ? "items-start border border-slate-300 px-3 py-2" : "items-center px-1 py-1", ROW_TOUCH)}
      >
        {/* 大きく出す行は、アイコンを名前の行にそろえる（説明が 2 行になるスマホで、アイコンが説明の真ん中に浮いた） */}
        <span className={cn("material-icons shrink-0 text-xl text-slate-500", lead && "mt-0.5")} aria-hidden data-icon={tool.icon} />
        <span className="min-w-0">
          {/* ★ 名前は決まった語の前（<wbr>）でだけ折る。それでも入らない幅のときだけ、どこでも折る（トップの一覧と同じ） */}
          <span
            className={cn(
              "block min-w-0 text-slate-700 [overflow-wrap:anywhere] [word-break:keep-all]",
              lead ? "text-base font-bold" : "text-[0.8125rem] leading-snug max-[340px]:text-xs sm:text-sm",
            )}
          >
            {nameParts(tool.name).map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <wbr />}
                {part}
              </Fragment>
            ))}
          </span>
          {/* ★ 説明は文節で折る（auto-phrase）。スマホで「目標ちょ／うど」と語の途中で折れた。
                歴代ボーダーの表では列が広がるので外した指定だが、ここは 1 列の文なので幅は変わらない */}
          {lead && <span className="mt-1 block text-sm leading-6 text-slate-600 [word-break:auto-phrase]">{tool.description}</span>}
        </span>
      </span>
    </Link>
  );
}
