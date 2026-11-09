import { type ReactNode, useId, useMemo, useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { cn } from "../../lib/utils";
import { type PickSection, type PickableOdai, PICK_GROUPS, pickSections } from "./odaiPins";
import { CellSheetFrame } from "./CellSheetFrame";

/**
 * 検索していないとき、種類ごとに最初に出す数（作者は 300 人を超える）。残りは「もっと見る」で出す。
 * 検索したときは当てはまるものを全部出す（絞り込まれて数が減るので）。
 */
const SECTION_LIMIT = 30;

const LIST_BOX = "mt-1 min-h-0 flex-1 overflow-y-auto rounded-lg bg-neu p-1 shadow-neu-inset";
const SUB_BUTTON =
  "min-h-11 w-full shrink-0 rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

interface Props {
  /** multi: 入れたいお題（押すたびに付け外し、max まで）。single: 1 つ選ぶ（マスの差し替え。選んだら親が閉じる）。 */
  mode: "multi" | "single";
  caption: string;
  title: string;
  /** 見出しの下の 1 行（single のとき。multi は選んだ数を出す）。 */
  sub?: ReactNode;
  items: readonly PickableOdai[];
  /** multi で選んでいるお題の鍵。 */
  selected?: readonly string[];
  /** 選べないお題の鍵（カードにすでにあるお題）。行に unavailableNote を出す。 */
  unavailable?: ReadonlySet<string>;
  unavailableNote?: string;
  max?: number;
  onPick: (odai: PickableOdai) => void;
  onClose: () => void;
}

/** 1 行: 札・文言・当てはまる曲数。選んでいれば印、選べなければ理由。 */
function PickRow({
  odai,
  state,
  note,
  onPick,
}: {
  odai: PickableOdai;
  state: "selected" | "open" | "blocked";
  note?: string;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={state === "blocked"}
        aria-pressed={state === "selected" ? true : undefined}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded px-2 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
          state === "selected" && "bg-[color:color-mix(in_srgb,var(--unit-color)_22%,transparent)]",
          state === "blocked" ? "cursor-not-allowed opacity-50" : "hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)]"
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-500">{odai.caption}</span>
          <span className="block text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">{odai.text}</span>
        </span>
        <span className="shrink-0 text-right text-xs text-slate-500">
          {note ?? <span className="font-num">{odai.count}曲</span>}
        </span>
        {state === "selected" && (
          <span className="material-icons shrink-0 text-xl text-slate-600" aria-hidden data-icon="check" />
        )}
      </button>
    </li>
  );
}

function Section({
  section,
  expanded,
  onExpand,
  render,
}: {
  section: PickSection;
  expanded: boolean;
  onExpand: () => void;
  render: (o: PickableOdai) => ReactNode;
}) {
  const headingId = useId();
  const shown = expanded ? section.items : section.items.slice(0, SECTION_LIMIT);
  const rest = section.items.length - shown.length;
  return (
    <div role="group" aria-labelledby={headingId} className="pt-3 first:pt-1">
      <h3
        id={headingId}
        className="flex items-baseline justify-between gap-2 border-b border-slate-300 px-2 pb-1 text-xs font-bold text-slate-600"
      >
        <span>{section.label}</span>
        <span className="font-num font-normal text-slate-500">{section.items.length}</span>
      </h3>
      <ul className="mt-1">{shown.map(render)}</ul>
      {rest > 0 && (
        <button type="button" onClick={onExpand} className={cn(SUB_BUTTON, "mt-1")}>
          もっと見る（残り <span className="font-num">{rest}</span>）
        </button>
      )}
    </div>
  );
}

/**
 * お題を選ぶ小窓（入れたいお題・マスの差し替えで共通）。楽曲データで 1 曲以上当てはまるすべてのお題から、
 * 検索（札・文言・キャラ名）と種類で絞って選ぶ。枠と作法（フォーカスの戻し・Esc・背景のタップ・スクロールのロック）は CellSheetFrame。
 */
export function OdaiPicker({
  mode,
  caption,
  title,
  sub: singleSub,
  items,
  selected = [],
  unavailable,
  unavailableNote,
  max = Infinity,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const sections = useMemo(() => pickSections(items, query, group), [items, query, group]);
  const searching = query.trim() !== "";
  const full = mode === "multi" && selected.length >= max;

  const stateOf = (o: PickableOdai): "selected" | "open" | "blocked" => {
    if (mode === "multi" && selected.includes(o.key)) return "selected";
    if (unavailable?.has(o.key) || full) return "blocked";
    return "open";
  };
  const render = (o: PickableOdai) => {
    const state = stateOf(o);
    const note = state === "blocked" && unavailable?.has(o.key) ? unavailableNote : undefined;
    return <PickRow key={o.key} odai={o} state={state} note={note} onPick={() => onPick(o)} />;
  };

  const sub =
    mode === "multi" ? (
      <>
        選んだお題{" "}
        <span className="font-num font-bold">
          {selected.length}/{max}
        </span>
      </>
    ) : (
      singleSub
    );

  return (
    <CellSheetFrame caption={caption} title={title} sub={sub} onClose={onClose} className="h-[85dvh] max-h-[720px]">
      {full && (
        <p className="mt-2 shrink-0 text-sm font-bold text-slate-700" role="status">
          {max}つまで選べます。選んだお題を押して外すと、ほかを選べます
        </p>
      )}
      {/* 16px 未満だと iOS が入力時に画面を拡大する */}
      <NeuInput
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="作者・キャラ・お題で検索"
        aria-label="お題を検索"
        className="mt-4 shrink-0 text-base"
      />
      {/* 種類の絞り込み。10 個あるので折り返さずに横へ流す（影が切れないよう上下に余白） */}
      <div className="-mx-1 mt-2 flex shrink-0 gap-2 overflow-x-auto px-1 py-2" role="group" aria-label="種類で絞り込み">
        {[{ key: null, label: "すべて" }, ...PICK_GROUPS].map((g) => (
          <NeuButton
            key={g.key ?? "all"}
            active={group === g.key}
            onClick={() => setGroup(g.key)}
            className="min-h-11 shrink-0 !px-3 whitespace-nowrap"
          >
            {g.label}
          </NeuButton>
        ))}
      </div>
      {sections.length === 0 ? (
        <p className="mt-1 flex-1 rounded-lg bg-neu p-4 text-center text-sm text-slate-500 shadow-neu-inset">
          見つかりませんでした
        </p>
      ) : (
        <div className={LIST_BOX}>
          {sections.map((s) => (
            <Section
              key={s.key}
              section={s}
              expanded={searching || expanded.has(s.key)}
              onExpand={() => setExpanded((prev) => new Set([...prev, s.key]))}
              render={render}
            />
          ))}
        </div>
      )}
      {mode === "multi" && (
        <button type="button" onClick={onClose} className="neu-cta mt-4 min-h-12 w-full shrink-0 rounded-xl text-base font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]">
          {/* 選ぶたびに反映しているので、ここは閉じるだけ（右上の × と同じ名前にしない） */}
          選び終える
        </button>
      )}
    </CellSheetFrame>
  );
}
