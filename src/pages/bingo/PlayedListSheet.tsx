import { useEffect, useRef, useState } from "react";
import { onJacketError } from "../../lib/img";
import type { BingoMusic } from "./bingoLogic";
import { downloadBlob } from "./bingoShare";
import { CellSheetFrame } from "./CellSheetFrame";
import { shortTime } from "./multiExport";
import { type ListFill, type PlayedSlot, type RevertGroup, planRevert } from "./playedLogic";
import { type PlayedRow, playedCsv, playedCsvFileName, playedRows, playedText } from "./playedExport";
import { type PlayedEntry, sameEntry } from "./playedStorage";
import { FillView, RemoveView, SUB_BUTTON } from "./PlayedListViews";

interface Props {
  entries: readonly PlayedEntry[];
  musicById: ReadonlyMap<string, BingoMusic>;
  jacketBase: string;
  /** 一覧から埋める相手（いまの画面のカード。休止中も渡し、薄く並べる）。 */
  targets: readonly PlayedSlot[];
  /** 相手のカードが無いときの断り（見るだけの間・カードが無い など）。 */
  noTargetNote: string;
  /** 1 曲消すときに戻すマスを探すカード（1 枚で遊ぶ・まとめて遊ぶの全部。記録はどちらで入れたものもある）。 */
  slots: readonly PlayedSlot[];
  /** 一覧に差し込むプレイ開始の行（いまの画面のカード）。 */
  starts: readonly { name: string; at: number }[];
  /** 1 曲消す。groups は戻すマス（空なら一覧からだけ消す）。 */
  onRemove: (entry: PlayedEntry, groups: readonly RevertGroup[]) => void;
  onClear: () => void;
  /** 一覧からカードを埋める。埋めなかった（ほかのタブで休止された）ときは false。 */
  onFill: (slot: PlayedSlot, plan: ListFill) => boolean;
  onClose: () => void;
}

type View = { name: "list" } | { name: "remove"; entry: PlayedEntry } | { name: "fill" };

type Item = { kind: "song"; at: number; row: PlayedRow } | { kind: "start"; at: number; name: string };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
};

/**
 * 新しい順に並べ、日付ごとに分ける。プレイ開始の行は、同じ時刻の曲より下（古い側）に置く
 * （最初に埋めた曲とプレイ開始は同じ時刻で、読む順は「プレイ開始 → その曲」になるように）。
 */
function groupByDay(rows: readonly PlayedRow[], starts: Props["starts"]): { day: string; items: Item[] }[] {
  const items: Item[] = [
    ...rows.map((row): Item => ({ kind: "song", at: row.at, row })),
    ...starts.map((s): Item => ({ kind: "start", at: s.at, name: s.name })),
  ].sort((a, b) => b.at - a.at || (a.kind === b.kind ? 0 : a.kind === "song" ? -1 : 1));
  const days: { day: string; items: Item[] }[] = [];
  for (const it of items) {
    const day = dayLabel(it.at);
    const last = days.at(-1);
    if (last && last.day === day) last.items.push(it);
    else days.push({ day, items: [it] });
  }
  return days;
}

const LIST_BOX = "mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg bg-neu p-1 shadow-neu-inset";
const HALF_BUTTON =
  "min-h-11 flex-1 rounded-lg bg-neu px-2 text-sm font-bold text-slate-600 shadow-neu-sm neu-tactile focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)] disabled:pointer-events-none disabled:opacity-50";

/**
 * 遊んだ曲の一覧（見る・1 曲消す・すべて消す・この一覧でカードを埋める・書き出す）。1 枚で遊ぶ・まとめて遊ぶで同じ一覧。
 * 消すときの確かめ・カードを選ぶ画面は、小窓を重ねずにこの小窓の中身を入れ替える（PlayedListViews）。
 * ★ onClose は呼ぶ側で変わらない関数にする（useModalA11y が onClose を見張り、変わるたびにフォーカスを小窓の先頭へ移す）。
 *   ほかのタブで一覧が変わって描き直されても、押そうとしているボタンからフォーカスが外れないように。
 */
export function PlayedListSheet(props: Props) {
  const { entries, musicById, jacketBase, slots, starts, onClose } = props;
  const [view, setView] = useState<View>({ name: "list" });
  const [message, setMessage] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  // 中身を入れ替えたら、押したボタンが消えてフォーカスが小窓の外へ落ちないよう、新しい中身の頭へ移す
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    body.current?.focus({ preventScroll: true });
  }, [view]);

  const rows = playedRows(entries, musicById);
  const removing = view.name === "remove" ? entries.find((e) => sameEntry(e, view.entry)) : undefined;
  const sub =
    rows.length === 0 ? (
      "まだありません"
    ) : (
      <>
        <span className="font-num">{rows.length}</span>曲 ・ <span className="font-num">{shortTime(rows[0].at)}</span> から
      </>
    );

  const askRemove = (entry: PlayedEntry) => {
    const groups = planRevert(entry, entries, slots, musicById);
    setMessage(null);
    if (groups.some((g) => g.cells.length > 0)) setView({ name: "remove", entry });
    else props.onRemove(entry, []);
  };

  const clear = () => {
    if (!window.confirm(`遊んだ曲 ${rows.length} 曲を、一覧からすべて消しますか？カードのマスはそのままです`)) return;
    props.onClear();
    setMessage("一覧を空にしました");
  };

  const copy = async () => {
    const text = playedText(rows);
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      setMessage(`コピーしました（${rows.length}曲）`);
    } catch {
      setFallback(text);
      setMessage("コピーできませんでした。下の文を選んでコピーしてください");
    }
  };

  const saveCsv = () => {
    downloadBlob(new Blob([playedCsv(rows)], { type: "text/csv;charset=utf-8" }), playedCsvFileName(new Date()));
    setMessage("CSV を保存しました");
  };

  return (
    <CellSheetFrame caption="この端末の記録" title="遊んだ曲の一覧" sub={sub} onClose={onClose} className="h-[calc(100dvh-2rem)] max-h-[720px]">
      <div ref={body} tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
        {removing ? (
          <RemoveView
            entry={removing}
            title={musicById.get(removing.id)?.title ?? ""}
            groups={planRevert(removing, entries, slots, musicById)}
            onRevert={() => {
              props.onRemove(removing, planRevert(removing, entries, slots, musicById));
              setView({ name: "list" });
            }}
            onRemoveOnly={() => {
              props.onRemove(removing, []);
              setView({ name: "list" });
            }}
            onCancel={() => setView({ name: "list" })}
          />
        ) : view.name === "fill" ? (
          <FillView
            targets={props.targets}
            entries={entries}
            musicById={musicById}
            noTargetNote={props.noTargetNote}
            onFill={(slot, plan) => {
              setMessage(
                props.onFill(slot, plan)
                  ? `${slot.name}の ${plan.cells.length} マスを埋めました`
                  : `${slot.name}は休止中になったので、埋めませんでした`
              );
              setView({ name: "list" });
            }}
            onBack={() => setView({ name: "list" })}
          />
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="mt-4 flex-1 rounded-lg bg-neu p-4 text-center text-sm text-slate-500 shadow-neu-inset">
                まだありません。遊んだ曲を入れて「埋める」か「遊んだ曲に入れる」を押すと、ここに並びます
              </p>
            ) : (
              <div className={LIST_BOX}>
                {groupByDay(rows, starts).map(({ day, items }) => (
                  <div key={day}>
                    <h3 className="border-b border-slate-300 px-2 pt-2 pb-1 text-xs font-bold text-slate-600">{day}</h3>
                    <ul>
                      {items.map((it) =>
                        it.kind === "start" ? (
                          <li key={`s-${it.name}-${it.at}`} className="flex min-h-9 items-center justify-between gap-2 px-2 text-xs font-bold text-slate-600">
                            <span className="min-w-0 [overflow-wrap:anywhere]">プレイ開始（{it.name}）</span>
                            <span className="shrink-0 font-num">{hm(it.at)}</span>
                          </li>
                        ) : (
                          <SongItem key={`${it.row.music.id}-${it.at}-${it.row.no}`} row={it.row} jacketBase={jacketBase} onRemove={askRemove} />
                        )
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setView({ name: "fill" });
              }}
              disabled={rows.length === 0}
              className={`${HALF_BUTTON} mt-3 w-full flex-none shrink-0`}
            >
              この一覧でカードを埋める
            </button>
            <div className="mt-3 flex shrink-0 gap-3">
              <button type="button" onClick={copy} disabled={rows.length === 0} className={HALF_BUTTON}>
                テキストをコピー
              </button>
              <button type="button" onClick={saveCsv} disabled={rows.length === 0} className={HALF_BUTTON}>
                CSVで保存
              </button>
            </div>
            <button type="button" onClick={clear} disabled={entries.length === 0} className={SUB_BUTTON}>
              すべて消す
            </button>
          </>
        )}
        {message && (
          <p className="mt-2 shrink-0 text-sm text-slate-600" role="status">
            {message}
          </p>
        )}
        {fallback !== null && view.name === "list" && (
          <textarea
            readOnly
            value={fallback}
            aria-label="遊んだ曲の一覧の文"
            rows={4}
            className="mt-2 w-full shrink-0 rounded-lg bg-neu p-2 text-base text-slate-700 shadow-neu-inset"
          />
        )}
      </div>
    </CellSheetFrame>
  );
}

/** 1 曲の行: 番号・ジャケット・曲名・時刻・消す（44px）。 */
function SongItem({ row, jacketBase, onRemove }: { row: PlayedRow; jacketBase: string; onRemove: (entry: PlayedEntry) => void }) {
  const time = hm(row.at);
  return (
    <li className="flex min-h-11 items-center gap-2 pl-2">
      <span className="w-7 shrink-0 text-right font-num text-xs text-slate-500">{row.no}</span>
      <img
        src={`${jacketBase}${row.music.jacketLink}`}
        alt=""
        loading="lazy"
        onError={onJacketError}
        className="h-9 w-9 shrink-0 rounded object-cover"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{row.music.title}</span>
      <span className="shrink-0 font-num text-xs text-slate-500">{time}</span>
      <button
        type="button"
        onClick={() => onRemove(row.entry)}
        aria-label={`${row.music.title}（${time}）を一覧から消す`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-slate-500 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
      >
        ×
      </button>
    </li>
  );
}
