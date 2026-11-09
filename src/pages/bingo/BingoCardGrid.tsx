import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AliasEntry } from "../../lib/songSearch";
import { UNIT_COLOR_VAR } from "../../lib/units";
import { onJacketError } from "../../lib/img";
import { cn } from "../../lib/utils";
import { NeuButton } from "../../components/ui/NeuButton";
import type { BingoMusic, Cell } from "./bingoLogic";
import { type OdaiCell, replaceOdaiCell } from "./odaiLogic";
import { fitsCell } from "./odaiDefs";
import type { PickableOdai } from "./odaiPins";
import { BINGO_LINES, type Progress, progressOf, withCleared, withClearedAll } from "./bingoProgress";
import { matchingCells } from "./bingoPlayed";
import { OdaiSheet } from "./OdaiSheet";
import { OdaiPicker } from "./OdaiPicker";
import { PlayedSongSheet, type PlayedMatch } from "./PlayedSongSheet";
import { SongCellSheet } from "./SongCellSheet";
import { BingoSongPicker } from "./BingoSongPicker";
import { type FontStep, type TextPx, STEP_PX, cellGapOf, longTextPxOf, longTextTight } from "./boardLayout";

interface Common {
  musics: BingoMusic[];
  aliases: AliasEntry[];
  jacketBase: string;
  /**
   * まとめて遊ぶの盤面として描く（幅と文字の段は boardLayout.ts）。このときは「遊んだ曲を入れる」と
   * 進み具合の行を出さない（盤面の外の操作の列と、カードの見出しが受け持つ）。
   */
  board?: { width: number; step: FontStep };
}

/** 字の段の規約（20・16・14・12）の大きさから Tailwind のクラス。 */
const TEXT_CLASS: Record<TextPx, string> = { 20: "text-xl", 16: "text-base", 14: "text-sm", 12: "text-xs" };

/**
 * まとめて遊ぶの盤面の、札・文言・名前の長い作者の文言のクラス（大きさは boardLayout.ts の STEP_PX・longTextPxOf）。
 * ★ 行の高さは span ごとに leading-tight（1.25 倍）にそろえる。Tailwind v4 の text-* は自分の行の高さを持ち、
 *   マスの leading-tight を上書きするので、マスに付けただけでは効かない（検分 M1 高-1。560px の盤面で長い名前が切れた）。
 *   leading-tight は text-* の後ろに書く。前に書くと cn（tailwind-merge）が text-* と競合するとみなして落とす
 */
function boardText(board: { width: number; step: FontStep }) {
  const px = STEP_PX[board.step];
  // 12px まで下げても長い名前の 4 行が入らない盤面は、字の間を詰める
  const tight = longTextTight(board.width, board.step) ? " tracking-tighter" : "";
  return {
    caption: `${TEXT_CLASS[px.caption]} leading-tight`,
    text: `${TEXT_CLASS[px.text]} leading-tight`,
    long: `${TEXT_CLASS[longTextPxOf(board.width, board.step)]}${tight} leading-tight`,
  };
}

type Props = Common &
  (
    | {
        kind: "odai";
        card: OdaiCell[];
        onChange: (card: OdaiCell[]) => void;
        /** マスを替えるときに選べるお題（楽曲データで 1 曲以上当てはまるすべて）。 */
        pickable: readonly PickableOdai[];
      }
    | { kind: "song"; card: Cell[]; onChange: (card: Cell[]) => void }
  );

/** 選ぶ小窓の見出しの上の 1 行: どのマスを替えるか（「作者 DECO*27 のマス」）。 */
const replacingCaption = (cell: OdaiCell | undefined) =>
  cell && cell !== "FREE" ? `${cell.odai.caption} ${cell.odai.text} のマス` : "マス";

/** 曲名ビンゴの差し替えの見出しの上の 1 行（「ロウワー のマス」）。 */
const replacingSongCaption = (cell: Cell | undefined) => (cell && cell !== "FREE" ? `${cell.title} のマス` : "マス");

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

interface CellCenters {
  width: number;
  height: number;
  centers: (readonly [number, number])[];
}

/**
 * マスの中心を、線を重ねる枠（grid の親）からの px で測る。
 * ★ スマホのお題のマスは中身に合わせて縦に伸びる（長い作者名は 4〜5 行）。段の高さが揃っている前提の
 *   5 等分で引くと、伸びた段のある列で線が段の中心から 30px 以上ずれた（2026-11-09 実測）。
 * 測れないとき（最初の描画・jsdom・ResizeObserver の無いブラウザ）は null で、呼ぶ側は 5 等分で引く。
 */
function useCellCenters(gridRef: RefObject<HTMLDivElement | null>, active: boolean): CellCenters | null {
  const [measured, setMeasured] = useState<CellCenters | null>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const frame = grid?.parentElement;
    if (!active || !grid || !frame) return;
    const measure = () => {
      const base = frame.getBoundingClientRect();
      const cells = Array.from(grid.children);
      if (base.width === 0 || base.height === 0 || cells.length !== 25) {
        setMeasured(null);
        return;
      }
      const centers = cells.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left - base.left + r.width / 2, r.top - base.top + r.height / 2] as const;
      });
      setMeasured({ width: base.width, height: base.height, centers });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // マスの 1 つが伸び縮みしただけでも測り直す（差し替えで長い名前が入ったとき など）
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    for (const el of Array.from(grid.children)) ro.observe(el);
    return () => ro.disconnect();
  }, [gridRef, active]);
  return active ? measured : null;
}

/**
 * そろった列に線を引く（マスの中心どうしを結ぶ）。下の文字が読めるよう半透明にする。
 * 白い縁はジャケットの上でだけ付ける（お題の文字の上では白が字を消してしまう）。
 */
function BingoLines({
  lines,
  outline,
  gridRef,
}: {
  lines: number[];
  outline: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  const measured = useCellCenters(gridRef, lines.length > 0);
  if (lines.length === 0) return null;
  const center = (i: number) => measured?.centers[i] ?? ([(i % 5) + 0.5, Math.floor(i / 5) + 0.5] as const);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={measured ? `0 0 ${measured.width} ${measured.height}` : "0 0 5 5"}
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
  // ★ お題の小窓から「このお題を替える」で開くと、お題の小窓が閉じるときにマスへ戻したフォーカスを、
  //   選ぶ小窓が「開く前のフォーカス」として覚える。閉じればそのマスに戻る
  const closeReplace = useCallback(() => setReplacing(null), []);
  const closePlayed = useCallback(() => setPlayed(null), []);
  const playedButton = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
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

  // お題のマスの差し替え: そのマスだけ替える（埋めた印は外れる）。カードにあるお題は選ぶ小窓で選べない
  const replaceOdai = (odai: PickableOdai) => {
    if (props.kind !== "odai" || replacing === null) return;
    props.onChange(replaceOdaiCell(props.card, replacing, odai));
    setReplacing(null);
  };
  // カードにあるお題の鍵・曲の id。差し替えの選ぶ小窓で選べなくする（同じお題・曲が 2 マスに入らないように）
  const onCard = new Set(
    props.kind === "odai"
      ? props.card.flatMap((c) => (c === "FREE" ? [] : [c.odai.key]))
      : props.card.flatMap((c) => (c === "FREE" ? [] : [c.id]))
  );

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

  const { board } = props;
  // まとめて遊ぶの盤面: 正方形にするかと文字の大きさは、画面の幅でなく盤面の幅の段で決める（boardLayout.ts）
  const square =
    props.kind === "song"
      ? "aspect-square"
      : board
        ? board.step === "xs"
          ? "min-h-16"
          : "aspect-square"
        : "min-h-16 sm:aspect-square";
  const stepText = board ? boardText(board) : null;
  const open = openIndex !== null ? card[openIndex] : null;

  return (
    <>
      {!board && (
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
        </>
      )}
      <div
        className={board ? "relative mx-auto w-full" : "relative -mx-2 sm:mx-auto sm:max-w-lg"}
        style={board ? { maxWidth: board.width } : undefined}
      >
        <div ref={grid} className={cn("grid grid-cols-5", board ? (cellGapOf(board.width) === 8 ? "gap-2" : "gap-1") : "gap-1 sm:gap-2")}>
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
              // 入れたお題・差し替えで選んだ長い名前（1640mP（164×40mP）・Orangestar など）は、PC でも 12px にし、
              // 字の間を詰める。スマホは 12px が最小（docs/design-system.md 2 節）なので、長い英字は語の途中で折る。
              // ★ 区切りを inline-block にすると、中で折り返した区切りの後ろに次の区切りが続けられず 1 行増える
              //   （PC の正方形のマスで「Ado×Giga、TeddyLoid & DECO*｜27」が 4 行になり切れた）。長い名前は続けて流す
              const long = !fitsCell(odai);
              return (
                <button
                  key={i}
                  {...common}
                  className={cn(
                    CELL_BASE,
                    square,
                    // 盤面の段の文字の大きさは、上下の余白 4px ずつ・札と文言の間 2px・枠線で、3 行（長い名前は 4 行）が正方形に入るように決めてある（boardLayout.ts）
                    stepText ? "py-1" : "py-2",
                    "flex-col border border-slate-300 text-center leading-tight text-slate-700 hover:border-slate-400"
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
                  <span className={cn("relative text-slate-500", stepText?.caption ?? "text-xs")}>{odai.caption}</span>
                  <span
                    className={cn(
                      "relative w-full font-bold [line-break:strict] [overflow-wrap:anywhere]",
                      stepText
                        ? cn("mt-0.5", long ? stepText.long : stepText.text)
                        : cn("mt-1 text-xs", long ? "tracking-tighter" : "sm:text-sm")
                    )}
                  >
                    {odai.chunks.map((chunk, j) =>
                      long ? (
                        <span key={j}>
                          {chunk}
                          <wbr />
                        </span>
                      ) : (
                        <span key={j} className="inline-block max-w-full">
                          {chunk}
                        </span>
                      )
                    )}
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
        <BingoLines lines={progress.lines} outline={props.kind === "song"} gridRef={grid} />
      </div>

      {openIndex !== null && open && open !== "FREE" && "odai" in open && (
        <OdaiSheet
          odai={open.odai}
          cleared={open.cleared}
          musics={musics}
          jacketBase={jacketBase}
          onSetCleared={(v) => setCleared(openIndex, v)}
          onReplace={() => {
            setOpenIndex(null);
            setReplacing(openIndex);
          }}
          onClose={close}
        />
      )}
      {props.kind === "odai" && replacing !== null && (
        <OdaiPicker
          mode="single"
          caption={replacingCaption(props.card[replacing])}
          title="替えるお題を選ぶ"
          sub="カードにあるお題は選べません。埋めた印は外れます"
          items={props.pickable}
          unavailable={onCard}
          unavailableNote="カードにあります"
          onPick={replaceOdai}
          onClose={closeReplace}
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
        <BingoSongPicker
          mode="single"
          caption="遊んだ曲を入れる"
          title="遊んだ曲を選ぶ"
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          onPick={setPlayed}
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
      {props.kind === "song" && replacing !== null && (
        <BingoSongPicker
          mode="single"
          caption={replacingSongCaption(props.card[replacing])}
          title="差し替える曲を選ぶ"
          sub="カードにある曲は選べません"
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          unavailable={onCard}
          unavailableNote="カードにあります"
          onPick={replaceSong}
          onClose={closeReplace}
        />
      )}
    </>
  );
}
