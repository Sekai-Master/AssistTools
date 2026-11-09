import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { Panel } from "../../components/ui/Panel";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import type { AliasEntry } from "../../lib/songSearch";
import { cn } from "../../lib/utils";
import type { BingoMusic } from "./bingoLogic";
import { matchingCells } from "./bingoPlayed";
import { progressOf, withClearedAll } from "./bingoProgress";
import type { KindedCard } from "./bingoShare";
import type { PickableOdai } from "./odaiPins";
import { BOARD_GAP, fontStepOf, pickBoardLayout } from "./boardLayout";
import { BingoSongPicker } from "./BingoSongPicker";
import { MultiBoard } from "./MultiBoard";
import { MultiCardSheet } from "./MultiCardSheet";
import { MultiPlayedSheet, type PlayedGroup } from "./MultiPlayedSheet";
import { MultiSaveFile } from "./MultiSaveFile";
import { isPaused } from "./multiStorage";
import { type MultiEntry, type MultiSet, entryName } from "./useMultiSet";

interface Props {
  set: MultiSet;
  musics: BingoMusic[];
  aliases: AliasEntry[];
  jacketBase: string;
  pickable: readonly PickableOdai[];
  /** カードを開くリンク（埋めた状態ごと）。 */
  linkOf: (kc: KindedCard) => string;
}

/** 盤面の区画の内側の幅と、ブラウザの内側の高さ。測れない（jsdom・ResizeObserver の無いブラウザ）ときは幅 0（切り替え式）。 */
function useAreaSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [ref]);
  return size;
}

/** 遊んだ曲で、カードごとに当てはまるマス。 */
function playedGroups(entries: readonly MultiEntry[], music: BingoMusic): PlayedGroup[] {
  return entries.flatMap((e, i) => {
    if (!e.card) return [];
    const card = e.card.card;
    const matches = matchingCells(card, music).map((index) => {
      const cell = card[index];
      if (cell === "FREE") return { index, cleared: true };
      return "odai" in cell
        ? { index, caption: cell.odai.caption, text: cell.odai.text, cleared: cell.cleared }
        : { index, cleared: cell.cleared };
    });
    return [{ id: e.id, name: entryName(e, i), kind: e.card.kind, matches, paused: isPaused(e) }];
  });
}

/** 遊んだ曲で埋めたあとのカード。当てはまるマスが無ければ null（変えない）。 */
function filledByPlayed(kc: KindedCard, music: BingoMusic): KindedCard | null {
  const indices = matchingCells(kc.card, music);
  if (indices.length === 0) return null;
  return kc.kind === "odai"
    ? { kind: "odai", card: withClearedAll(kc.card, indices) }
    : { kind: "song", card: withClearedAll(kc.card, indices) };
}

/**
 * スマホの切り替え: 番号と BINGO の印だけ（名前は下の見出しに全部出す。320px でも 5 つが 44px 以上で入る）。
 * 休止中のカードは番号を薄くする（盤面と同じ見せ方）。
 */
function MultiTabs({ entries, active, onSelect }: { entries: readonly MultiEntry[]; active: number; onSelect: (i: number) => void }) {
  return (
    <div role="group" aria-label="カードを選ぶ" className="mb-3 flex gap-2">
      {entries.map((e, i) => {
        const bingo = e.card ? progressOf(e.card.card).bingo : false;
        const paused = isPaused(e);
        return (
          <button
            key={e.id}
            type="button"
            aria-pressed={i === active}
            aria-label={`${entryName(e, i)}${bingo ? "（BINGO）" : ""}${paused ? "（休止中）" : ""}`}
            onClick={() => onSelect(i)}
            className={cn(
              "relative flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-lg font-num text-base font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
              i === active ? "bg-[color:var(--unit-color)] text-[color:var(--unit-ink)]" : "bg-neu text-slate-600 shadow-neu-sm",
              paused && "opacity-50"
            )}
          >
            {i + 1}
            {bingo && <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * まとめて遊ぶの盤面の区画（PC は画面いっぱいの幅に並べ、スマホは切り替え）。
 * 上に操作の列（遊んだ曲を入れる・列の切り替え）、下にカードごとの見出しと盤面。並べ方は boardLayout.ts。
 */
export function MultiBingo({ set, musics, aliases, jacketBase, pickable, linkOf }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const { width, height } = useAreaSize(area);
  const { entries } = set;
  const layout = pickBoardLayout({ count: entries.length, width, height, cols: set.cols });
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [played, setPlayed] = useState<BingoMusic | "picking" | null>(null);
  const playedButton = useRef<HTMLButtonElement>(null);
  const wasPlayedOpen = useRef(false);
  const closeSettings = useCallback(() => setSettingsId(null), []);
  // ★ React Compiler が setPlayed を依存に数えるので書いておく（setState は変わらないので掛け直しは起きない）
  const closePlayed = useCallback(() => setPlayed(null), [setPlayed]);
  // 閉じたら「遊んだ曲を入れる」にフォーカスを戻す（検索欄の autoFocus で、小窓が覚える「開く前」が消えた検索欄になるため）
  useEffect(() => {
    if (played === null && wasPlayedOpen.current) playedButton.current?.focus({ preventScroll: true });
    wasPlayedOpen.current = played !== null;
  }, [played]);

  // 遊んだ曲を入れられるカード（読めて、休止していない）。無ければ「遊んだ曲を入れる」を押せない
  const readable = entries.some((e) => e.card);
  const playable = entries.some((e) => e.card && !isPaused(e));
  const settingsEntry = entries.find((e) => e.id === settingsId) ?? null;
  const active = Math.min(set.active, Math.max(0, entries.length - 1));
  const renderBoard = (e: MultiEntry, i: number, board: { width: number; step: ReturnType<typeof fontStepOf> }) => (
    <MultiBoard
      key={e.id}
      entry={e}
      name={entryName(e, i)}
      musics={musics}
      aliases={aliases}
      jacketBase={jacketBase}
      pickable={pickable}
      board={board}
      paused={isPaused(e)}
      onChange={(kc) => set.updateCards(new Map([[e.id, kc]]))}
      onSettings={() => setSettingsId(e.id)}
      onResume={() => set.setPaused(e.id, false)}
    />
  );

  return (
    <Panel>
      {/* 見出しの段を飛ばさない（ページの見出し h1 → この区画 → カードごとの h3） */}
      <h2 className="sr-only">並べたカード</h2>
      {/* relative: 書き出し・読み込みの知らせを、この列の下に重ねて出す（MultiSaveFile） */}
      <div className="relative mb-4 flex flex-wrap items-center gap-3">
        <NeuButton
          ref={playedButton}
          onClick={() => setPlayed("picking")}
          disabled={!playable}
          className="flex min-h-12 items-center justify-center gap-2 !px-4 text-base"
        >
          <span className="material-icons text-xl text-slate-500" aria-hidden data-icon="search" />
          遊んだ曲を入れる
        </NeuButton>
        {readable && !playable && <span className="text-sm text-slate-600">全部のカードが休止中です</span>}
        {layout.mode === "grid" && entries.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600">列</span>
            <SegmentedControl
              compact
              ariaLabel="列の数"
              options={[{ value: "0", label: "自動" }, ...entries.map((_, i) => ({ value: String(i + 1), label: String(i + 1) }))]}
              value={String(Math.min(set.cols, entries.length))}
              buttonClassName="min-h-11 min-w-11 px-2"
              onChange={(v) => set.setCols(Number(v))}
            />
          </div>
        )}
        <MultiSaveFile set={set} />
      </div>
      <div ref={area}>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-600">まだカードがありません。上の「カードを足す」で作れます</p>
        ) : layout.mode === "tabs" ? (
          <>
            <MultiTabs entries={entries} active={active} onSelect={set.setActive} />
            {renderBoard(entries[active], active, { width: Math.max(width, 1), step: fontStepOf(width) })}
          </>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: BOARD_GAP }}>
            {entries.map((e, i) => (
              <div key={e.id} className="mx-auto w-full" style={{ maxWidth: layout.board }}>
                {renderBoard(e, i, { width: layout.board, step: layout.step })}
              </div>
            ))}
          </div>
        )}
      </div>

      {settingsEntry && (
        <MultiCardSheet
          // 名前の下書きはカードごと（別のカードの設定を開いたときに前の下書きを持ち越さない）
          key={settingsEntry.id}
          entry={settingsEntry}
          name={entryName(settingsEntry, entries.indexOf(settingsEntry))}
          link={settingsEntry.card ? linkOf(settingsEntry.card) : ""}
          paused={isPaused(settingsEntry)}
          onRename={(name) => set.renameCard(settingsEntry.id, name)}
          onPause={(paused) => {
            set.setPaused(settingsEntry.id, paused);
            setSettingsId(null);
          }}
          onRemove={() => {
            set.removeCard(settingsEntry.id);
            setSettingsId(null);
          }}
          onClose={closeSettings}
        />
      )}
      {played === "picking" && (
        <BingoSongPicker
          mode="single"
          caption="遊んだ曲を入れる（全部のカード）"
          title="遊んだ曲を選ぶ"
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          onPick={setPlayed}
          onClose={closePlayed}
        />
      )}
      {played && played !== "picking" && (
        <MultiPlayedSheet
          music={played}
          groups={playedGroups(entries, played)}
          onFill={() => {
            set.applyToCards((kc) => filledByPlayed(kc, played));
            setPlayed(null);
          }}
          onPickAgain={() => setPlayed("picking")}
          onClose={closePlayed}
        />
      )}
    </Panel>
  );
}
