import { cn } from "../../lib/utils";
import type { BingoMusic } from "./bingoLogic";
import { shortTime } from "./multiExport";
import { type ListFill, type PlayedSlot, type RevertGroup, planListFill } from "./playedLogic";
import type { PlayedEntry } from "./playedStorage";
import { PRIMARY } from "./PlayedSongSheet";

export const SUB_BUTTON =
  "mt-3 min-h-11 w-full shrink-0 rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)] disabled:pointer-events-none disabled:opacity-50";

/** マスの名前（お題は札と文言、曲名はその曲）。 */
function cellLabel(slot: PlayedSlot, index: number): string {
  const cell = slot.kc.card[index];
  if (!cell || cell === "FREE") return "";
  return "odai" in cell ? `${cell.odai.caption} ${cell.odai.text}` : `曲 ${cell.title}`;
}

interface RemoveProps {
  entry: PlayedEntry;
  title: string;
  groups: readonly RevertGroup[];
  onRevert: () => void;
  onRemoveOnly: () => void;
  onCancel: () => void;
}

/**
 * 1 曲消すときの確かめ: その曲で埋めたマスを見せ、戻すかを選ばせる（持ち主の決定 2 の C）。
 * ほかの遊んだ曲でも当てはまるマスは戻さない（一覧と盤面が食い違わないように。playedLogic の planRevert）。
 */
export function RemoveView({ entry, title, groups, onRevert, onRemoveOnly, onCancel }: RemoveProps) {
  const cells = groups.reduce((n, g) => n + g.cells.length, 0);
  const kept = groups.reduce((n, g) => n + g.kept, 0);
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <p className="text-sm text-slate-700">
        「<span className="font-bold [overflow-wrap:anywhere]">{title}</span>」（<span className="font-num">{shortTime(entry.at)}</span>）を一覧から消します
      </p>
      {cells > 0 && (
        <>
          <p className="mt-2 text-sm text-slate-600">この曲で埋めたマスを戻しますか？</p>
          <ul className="mt-2 min-h-0 flex-1 divide-y divide-slate-300 overflow-y-auto rounded-lg border border-slate-300">
            {groups
              .filter((g) => g.cells.length > 0)
              .map((g) => (
                <li key={g.slot.ref} className="px-3 py-2">
                  <span className="block text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">{g.slot.name}</span>
                  {g.cells.map((i) => (
                    <span key={i} className="block text-xs text-slate-600 [overflow-wrap:anywhere]">
                      {cellLabel(g.slot, i)}
                    </span>
                  ))}
                </li>
              ))}
          </ul>
        </>
      )}
      {kept > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          一覧のほかの曲でも当てはまる <span className="font-num">{kept}</span> マスは、埋めたまま残します
        </p>
      )}
      {cells > 0 ? (
        <>
          <button type="button" onClick={onRevert} className={PRIMARY}>
            マスも戻して消す（<span className="font-num">{cells}</span>マス）
          </button>
          <button type="button" onClick={onRemoveOnly} className={SUB_BUTTON}>
            一覧からだけ消す
          </button>
        </>
      ) : (
        <button type="button" onClick={onRemoveOnly} className={PRIMARY}>
          一覧から消す
        </button>
      )}
      <button type="button" onClick={onCancel} className={SUB_BUTTON}>
        やめる
      </button>
    </div>
  );
}

/** 押す前に見せる 1 行（「11/12 15:03 より後の 12 曲で 5 マス埋まります」）。 */
function previewText(slot: PlayedSlot, plan: ListFill): string {
  const from = slot.addedAt > 0 ? `${shortTime(slot.addedAt)} より後の ${plan.usable} 曲` : `一覧の ${plan.usable} 曲`;
  return plan.cells.length > 0 ? `${from}で ${plan.cells.length} マス埋まります` : `${from}では、埋まるマスはありません`;
}

interface FillProps {
  targets: readonly PlayedSlot[];
  entries: readonly PlayedEntry[];
  musicById: ReadonlyMap<string, BingoMusic>;
  /** 相手のカードが無いときの断り。 */
  noTargetNote: string;
  onFill: (slot: PlayedSlot, plan: ListFill) => void;
  onBack: () => void;
}

/**
 * この一覧でカードを埋める: カードを 1 枚選び、そのカードを足した時刻より後で休止の区間の外の曲だけを使う（G-03）。
 * 休止中のカードは選べない（休止中のカードには遊んだ曲を反映しない。持ち主の決定 2）。下に薄く並べて、止まっていると分かるようにする。
 */
export function FillView({ targets, entries, musicById, noTargetNote, onFill, onBack }: FillProps) {
  const playing = targets.filter((t) => !t.pausedNow);
  const paused = targets.filter((t) => t.pausedNow);
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <p className="text-sm text-slate-600">
        {playing.length > 0 ? "カードを選んで埋めます。そのカードを足した時刻より後に遊んだ曲だけを使います" : noTargetNote}
      </p>
      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {playing.map((slot) => {
          const plan = planListFill(slot, entries, musicById);
          return (
            <section key={slot.ref} aria-label={slot.name} className="rounded-lg border border-slate-300 p-3">
              <p className="text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">{slot.name}</p>
              <p className="mt-1 text-sm text-slate-600">{previewText(slot, plan)}</p>
              {plan.pausedOut > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  休止中に遊んだ <span className="font-num">{plan.pausedOut}</span> 曲は使いません
                </p>
              )}
              {plan.cells.length > 0 && (
                <button type="button" onClick={() => onFill(slot, plan)} className={cn(PRIMARY, "mt-3")}>
                  埋める（<span className="font-num">{plan.cells.length}</span>マス）
                </button>
              )}
            </section>
          );
        })}
        {paused.length > 0 && (
          <div>
            <p className="px-1 text-xs font-bold text-slate-600">休止中（埋めません）</p>
            <ul className="mt-1 space-y-1 opacity-50">
              {paused.map((slot) => (
                <li key={slot.ref} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  {slot.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button type="button" onClick={onBack} className={SUB_BUTTON}>
        戻る
      </button>
    </div>
  );
}
