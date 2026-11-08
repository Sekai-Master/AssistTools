import { useCallback, useEffect, useRef, useState } from "react";
import { SongSearchModal, type AliasEntry } from "../../components/SongSearchModal";
import { UNIT_COLOR_VAR } from "../../lib/units";
import { onJacketError } from "../../lib/img";
import { cn } from "../../lib/utils";
import { NeuButton } from "../../components/ui/NeuButton";
import type { BingoMusic, Cell } from "./bingoLogic";
import type { OdaiCell } from "./odaiLogic";
import { BINGO_LINES, type Progress, progressOf, withCleared, withClearedAll } from "./bingoProgress";
import { matchingCells } from "./bingoPlayed";
import { OdaiSheet } from "./OdaiSheet";
import { PlayedSongSheet, type PlayedMatch } from "./PlayedSongSheet";
import { SongCellSheet } from "./SongCellSheet";

interface Common {
  musics: BingoMusic[];
  aliases: AliasEntry[];
  jacketBase: string;
}

type Props = Common &
  (
    | { kind: "odai"; card: OdaiCell[]; onChange: (card: OdaiCell[]) => void }
    | { kind: "song"; card: Cell[]; onChange: (card: Cell[]) => void }
  );

const CELL_BASE =
  "relative flex items-center justify-center overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

/**
 * 埋めた印: ページの色で覆い、丸を付ける。
 * お題（文字のマス）は文字が読める薄さ。曲名（ジャケットの上）は絵が派手なので、
 * 覆いを濃くし、丸を太く不透明にして白い縁を付ける（どんな絵の上でも埋めたと分かるように）。
 */
function FilledMark({ onJacket }: { onJacket: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0",
        onJacket
          ? "bg-[color:color-mix(in_srgb,var(--unit-color)_52%,transparent)]"
          : "bg-[color:color-mix(in_srgb,var(--unit-color)_28%,transparent)]"
      )}
    >
      <span
        className={cn(
          "absolute left-1/2 top-1/2 aspect-square max-w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[color:var(--unit-color)]",
          onJacket
            ? "w-3/4 border-[6px] shadow-[0_0_0_2px_#fff,inset_0_0_0_2px_#fff]"
            : "w-4/5 border-4 opacity-60"
        )}
      />
    </span>
  );
}

function ProgressLine({ progress }: { progress: Progress }) {
  const { filled, total, reach, lines, bingo } = progress;
  return (
    <div className="mb-4 flex min-h-8 items-center justify-between gap-2" aria-live="polite">
      <p className="text-sm text-slate-600">
        埋めたマス{" "}
        <span className="font-num font-bold">
          {filled}/{total}
        </span>
        {reach > 0 && (
          <>
            {" "}・ リーチ <span className="font-num font-bold">{reach}</span>
          </>
        )}
      </p>
      {bingo && (
        <span className="rounded-lg bg-[color:var(--unit-color)] px-3 py-1 text-sm font-bold text-[color:var(--unit-ink)]">
          {lines.length > 1 ? `BINGO! ×${lines.length}` : "BINGO!"}
        </span>
      )}
    </div>
  );
}

/**
 * そろった列に線を引く（マスの中心どうしを結ぶ）。下の文字が読めるよう半透明にする。
 * 白い縁はジャケットの上でだけ付ける（お題の文字の上では白が字を消してしまう）。
 */
function BingoLines({ lines, outline }: { lines: number[]; outline: boolean }) {
  if (lines.length === 0) return null;
  const center = (i: number) => [(i % 5) + 0.5, Math.floor(i / 5) + 0.5] as const;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 5 5"
      preserveAspectRatio="none"
    >
      {lines.map((li) => {
        const line = BINGO_LINES[li];
        const [x1, y1] = center(line[0]);
        const [x2, y2] = center(line[4]);
        return (
          <g key={li} strokeLinecap="round" opacity={outline ? 0.95 : 0.65}>
            {outline && (
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={10} vectorEffect="non-scaling-stroke" />
            )}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--unit-color)"
              strokeWidth={6}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * カードの 5×5（お題・曲名で共通）。マスを押すと小窓が開き、そこで埋める／戻す。
 * 押しただけでは埋めない: 流れた曲が本当に当てはまるかを確かめてから埋めるため。
 * 上の「遊んだ曲を入れる」は逆引き: 曲を選ぶと当てはまるマスを並べ、まとめて埋める。
 * ★ 320px では 1 マスが約 50px しかない。お題の文言は区切り（chunks）ごとに inline-block で
 *   まとめ、語の途中で折れないようにする（line-break: strict で「ー」が行の頭に来ないように）。
 */
export function BingoCardGrid(props: Props) {
  const { card, musics, aliases, jacketBase } = props;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [replacing, setReplacing] = useState<number | null>(null);
  // 遊んだ曲: 検索を開いている間は "picking"、選んだ後はその曲
  const [played, setPlayed] = useState<BingoMusic | "picking" | null>(null);
  // useModalA11y は onClose が変わるたびに掛け直すので、同じ関数を渡す
  const close = useCallback(() => setOpenIndex(null), []);
  const closeReplace = useCallback(() => setReplacing(null), []);
  const closePlayed = useCallback(() => setPlayed(null), []);
  const playedButton = useRef<HTMLButtonElement>(null);
  const wasPlayedOpen = useRef(false);
  // 閉じたら「遊んだ曲を入れる」にフォーカスを戻す。検索欄の autoFocus のせいで、小窓が覚える
  // 「開く前のフォーカス」は消えた検索欄になり、そのままだとフォーカスが body に落ちる
  useEffect(() => {
    if (played === null && wasPlayedOpen.current) playedButton.current?.focus({ preventScroll: true });
    wasPlayedOpen.current = played !== null;
  }, [played]);
  const progress = progressOf(card);

  const setCleared = (index: number, cleared: boolean) => {
    if (props.kind === "odai") props.onChange(withCleared(props.card, index, cleared));
    else props.onChange(withCleared(props.card, index, cleared));
    close();
  };

  const replaceSong = (music: BingoMusic) => {
    if (props.kind !== "song" || replacing === null) return;
    const idx = replacing;
    props.onChange(props.card.map((c, j) => (j === idx ? { ...music, cleared: false } : c)));
    setReplacing(null);
  };

  const playedMatches: PlayedMatch[] =
    played && played !== "picking"
      ? matchingCells(card, played).map((index) => {
          const cell = card[index] as Exclude<(typeof card)[number], "FREE">;
          return "odai" in cell
            ? { index, caption: cell.odai.caption, text: cell.odai.text, cleared: cell.cleared }
            : { index, cleared: cell.cleared };
        })
      : [];

  const fillPlayed = () => {
    const indices = playedMatches.map((m) => m.index);
    if (props.kind === "odai") props.onChange(withClearedAll(props.card, indices));
    else props.onChange(withClearedAll(props.card, indices));
    setPlayed(null);
  };

  const square = props.kind === "song" ? "aspect-square" : "min-h-16 sm:aspect-square";
  const open = openIndex !== null ? card[openIndex] : null;

  return (
    <>
      <NeuButton
        ref={playedButton}
        onClick={() => setPlayed("picking")}
        className="mb-4 flex min-h-12 w-full items-center justify-center gap-2 text-base"
      >
        <span className="material-icons text-xl text-slate-500" aria-hidden data-icon="search" />
        遊んだ曲を入れる
      </NeuButton>
      <ProgressLine progress={progress} />
      <div className="relative -mx-2 sm:mx-auto sm:max-w-lg">
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {card.map((cell, i) => {
            if (cell === "FREE") {
              return (
                <div
                  key={i}
                  className={cn(
                    CELL_BASE,
                    square,
                    "bg-[color:color-mix(in_srgb,var(--unit-color)_28%,transparent)] text-sm font-bold text-slate-700"
                  )}
                >
                  FREE
                </div>
              );
            }
            const common = {
              type: "button" as const,
              "aria-pressed": cell.cleared,
              onClick: () => setOpenIndex(i),
            };
            if ("odai" in cell) {
              const { odai } = cell;
              return (
                <button
                  key={i}
                  {...common}
                  className={cn(
                    CELL_BASE,
                    square,
                    "flex-col border border-slate-300 py-2 text-center leading-tight text-slate-700 hover:border-slate-400"
                  )}
                >
                  {cell.cleared && <FilledMark onJacket={false} />}
                  {odai.unit && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1"
                      style={{ background: UNIT_COLOR_VAR[odai.unit] }}
                    />
                  )}
                  <span className="relative text-xs text-slate-500">{odai.caption}</span>
                  <span className="relative mt-1 w-full text-xs font-bold [line-break:strict] [overflow-wrap:anywhere] sm:text-sm">
                    {odai.chunks.map((chunk, j) => (
                      <span key={j} className="inline-block max-w-full">
                        {chunk}
                      </span>
                    ))}
                  </span>
                </button>
              );
            }
            return (
              <button key={i} {...common} aria-label={cell.title} className={cn(CELL_BASE, square, "bg-slate-300")}>
                <img
                  src={`${jacketBase}${cell.jacketLink}`}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={onJacketError}
                />
                {cell.cleared && <FilledMark onJacket />}
              </button>
            );
          })}
        </div>
        <BingoLines lines={progress.lines} outline={props.kind === "song"} />
      </div>

      {openIndex !== null && open && open !== "FREE" && "odai" in open && (
        <OdaiSheet
          odai={open.odai}
          cleared={open.cleared}
          musics={musics}
          jacketBase={jacketBase}
          onSetCleared={(v) => setCleared(openIndex, v)}
          onClose={close}
        />
      )}
      {openIndex !== null && open && open !== "FREE" && !("odai" in open) && (
        <SongCellSheet
          music={open}
          cleared={open.cleared}
          jacketBase={jacketBase}
          onSetCleared={(v) => setCleared(openIndex, v)}
          onReplace={() => {
            setOpenIndex(null);
            setReplacing(openIndex);
          }}
          onClose={close}
        />
      )}
      {played === "picking" && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          title="遊んだ曲を選ぶ"
          onSelect={setPlayed}
          onClose={closePlayed}
        />
      )}
      {played && played !== "picking" && (
        <PlayedSongSheet
          kind={props.kind}
          music={played}
          matches={playedMatches}
          onFill={fillPlayed}
          onPickAgain={() => setPlayed("picking")}
          onClose={closePlayed}
        />
      )}
      {replacing !== null && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          title="差し替える曲を選ぶ"
          onSelect={replaceSong}
          onClose={closeReplace}
        />
      )}
    </>
  );
}
