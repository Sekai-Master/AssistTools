import { type ReactNode, useMemo, useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { onJacketError } from "../../lib/img";
import { cn } from "../../lib/utils";
import { type AliasEntry, searchSongs } from "../../lib/songSearch";
import { type BingoMusic, sungBy } from "./bingoLogic";
import { singerName } from "./bingoSingers";
import { CellSheetFrame } from "./CellSheetFrame";
import { SingerSelect } from "./SingerSelect";

/** 絞っていないとき最初に出す曲数（全 700 曲を超える）。残りは「もっと見る」で出す。 */
const LIST_LIMIT = 80;

const LIST_BOX = "mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg bg-neu p-1 shadow-neu-inset";
const SUB_BUTTON =
  "mt-1 min-h-11 w-full shrink-0 rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

interface Props {
  /** single: 1 曲選ぶ（遊んだ曲・差し替え・中央マス。選んだら親が閉じる）。multi: 押すたびに付け外し（入れたい曲、max まで）。 */
  mode: "single" | "multi";
  caption: string;
  title: string;
  /** 見出しの下の行に、曲数の後ろへ添える 1 文（single のとき）。 */
  sub?: ReactNode;
  musics: readonly BingoMusic[];
  aliases: readonly AliasEntry[];
  jacketBase: string;
  /** multi で選んでいる曲の id。 */
  selected?: readonly string[];
  max?: number;
  /** 選べない曲の id（差し替えでカードにある曲）。行に unavailableNote を出す。 */
  unavailable?: ReadonlySet<string>;
  unavailableNote?: string;
  onPick: (music: BingoMusic) => void;
  onClose: () => void;
}

type RowState = "selected" | "open" | "blocked";

/** 1 行: ジャケット・曲名・作者。選んでいれば印、選べなければ理由。曲名を先に置く（行の文字は曲名から始まる）。 */
function SongRow({
  music,
  jacketBase,
  state,
  note,
  multi,
  onPick,
}: {
  music: BingoMusic;
  jacketBase: string;
  state: RowState;
  note?: string;
  multi: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={state === "blocked"}
        aria-pressed={multi ? state === "selected" : undefined}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded px-2 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]",
          state === "selected" && "bg-[color:color-mix(in_srgb,var(--unit-color)_22%,transparent)]",
          state === "blocked" ? "cursor-not-allowed opacity-50" : "hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)]"
        )}
      >
        <img
          src={`${jacketBase}${music.jacketLink}`}
          alt=""
          className="h-9 w-9 shrink-0 rounded object-cover"
          loading="lazy"
          onError={onJacketError}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-700">{music.title}</span>
          {music.artistName && <span className="block truncate text-xs text-slate-500">{music.artistName}</span>}
        </span>
        {note && <span className="shrink-0 text-xs text-slate-500">{note}</span>}
        {state === "selected" && (
          <span className="material-icons shrink-0 text-xl text-slate-600" aria-hidden data-icon="check" />
        )}
      </button>
    </li>
  );
}

/** 見出しの下の行の曲数（「全 732曲」「瑞希が歌う 74曲」「瑞希のバナー曲 7曲」「当てはまる 2曲」）。 */
function countText(count: number, singer: number | null, banner: boolean, searching: boolean): string {
  if (searching) return `当てはまる ${count}曲`;
  if (singer !== null && banner) return `${singerName(singer)}のバナー曲 ${count}曲`;
  if (singer !== null) return `${singerName(singer)}が歌う ${count}曲`;
  return `全 ${count}曲`;
}

/**
 * 歌う人で絞った曲。banner なら、その人がバナーの回のイベント曲（楽曲データの bannerCharacterId）だけ。
 * バナー曲はそのキャラのユニットの書き下ろしで、2026-11-10 のマスタで数えた 134 曲すべてでバナーのキャラが歌う。
 */
function narrowBySinger(musics: readonly BingoMusic[], singer: number | null, banner: boolean): readonly BingoMusic[] {
  if (singer === null) return musics;
  return musics.filter((m) => (banner ? m.bannerCharacterId === singer : sungBy(m, singer)));
}

/**
 * ビンゴの曲を選ぶ小窓（遊んだ曲・マスの差し替え・中央マス・入れたい曲で共通）。
 * 検索は共通の searchSongs（SongSearchModal と同じ決まり）、そこへ歌う人の絞り込みを重ねる。
 * 枠と作法（フォーカスの戻し・Esc・背景のタップ・スクロールのロック）は CellSheetFrame。
 * ★ スマホの横向き（高さ 390px 前後）でも一覧が見えるよう、曲数は見出しの下の行に出し、
 *   検索と歌う人は幅があれば 1 行に並べる。小窓の高さは画面の高さから決める（85dvh だと横向きで一覧が潰れた）
 */
export function BingoSongPicker({
  mode,
  caption,
  title,
  sub,
  musics,
  aliases,
  jacketBase,
  selected = [],
  max = Infinity,
  unavailable,
  unavailableNote,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [singer, setSinger] = useState<number | null>(null);
  const [bannerOnly, setBannerOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // ★ 切り替えは、選んだ人のバナー曲が楽曲データにあるときだけ出す（VIRTUAL SINGER・データが届く前は出さない）。
  //   押したまま別の人に替えても、その人にバナー曲が無ければ絞らない
  const hasBanner = useMemo(
    () => singer !== null && musics.some((m) => m.bannerCharacterId === singer),
    [musics, singer]
  );
  const banner = bannerOnly && hasBanner;
  const results = useMemo(
    () => searchSongs(narrowBySinger(musics, singer, banner), aliases, query),
    [musics, aliases, query, singer, banner]
  );
  const multi = mode === "multi";
  const full = multi && selected.length >= max;
  const shown = expanded ? results : results.slice(0, LIST_LIMIT);
  const rest = results.length - shown.length;

  const stateOf = (m: BingoMusic): RowState => {
    if (multi && selected.includes(m.id)) return "selected";
    if (unavailable?.has(m.id) || full) return "blocked";
    return "open";
  };
  const count = countText(results.length, singer, banner, query.trim() !== "");
  // ★ 390px で 2 行に折れるとき、文の途中（「選べま｜せん」）で割れないよう、まとまりごとに inline-block にする
  const head = multi ? (
    <>
      <span className="inline-block">
        選んだ曲{" "}
        <span className="font-num font-bold">
          {selected.length}/{max}
        </span>
      </span>{" "}
      ・ <span className="inline-block">{count}</span>
    </>
  ) : (
    <>
      <span className="inline-block">{count}</span>
      {sub && (
        <>
          {" "}・ <span className="inline-block">{sub}</span>
        </>
      )}
    </>
  );

  return (
    <CellSheetFrame caption={caption} title={title} sub={head} onClose={onClose} className="h-[calc(100dvh-2rem)] max-h-[720px]">
      {/* 読み上げに届くよう、知らせる枠は先に置いておき、中の文だけを入れ替える（multi のときだけ） */}
      {multi && (
        <p className={full ? "mt-2 shrink-0 text-sm font-bold text-slate-700" : "sr-only"} role="status">
          {full ? `${max}曲まで選べます。選んだ曲を押して外すと、ほかを選べます` : ""}
        </p>
      )}
      <div className="mt-3 flex shrink-0 flex-col gap-2 sm:flex-row">
        {/* single はすぐ打てるよう入力欄にフォーカス（今までの検索と同じ）。multi は歌う人で絞って選ぶことが多いので入れない */}
        <NeuInput
          autoFocus={!multi}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setExpanded(false);
          }}
          placeholder="曲名・読み・作者で検索"
          aria-label="曲を検索"
          className="min-w-0 flex-1 text-base"
        />
        {/* 歌う人とバナー曲の切り替え。★ 切り替えは同じ行に置き、行を増やさない
            （横向きのスマホ 844×390 は、入れたい曲を選ぶとき一覧の高さが 114px＝約 2 行しかない）。
            幅があるときは、検索欄が狭くなりすぎないよう歌う人の欄を 160px から 128px に詰める
            （844×390 で検索欄は 296px → 212px。「曲名・読み・作者で検索」は収まる） */}
        <div className={cn("flex gap-2", hasBanner ? "sm:w-auto" : "sm:w-40")}>
          <SingerSelect
            value={singer}
            onChange={(v) => {
              setSinger(v);
              setExpanded(false);
            }}
            className={cn("min-w-0 flex-1", hasBanner && "sm:w-32 sm:flex-none")}
          />
          {hasBanner && (
            <NeuButton
              active={banner}
              onClick={() => {
                setBannerOnly(!banner);
                setExpanded(false);
              }}
              className="min-h-11 shrink-0 whitespace-nowrap !px-3"
            >
              バナー曲だけ
            </NeuButton>
          )}
        </div>
      </div>
      {results.length === 0 ? (
        <p className="mt-2 flex-1 rounded-lg bg-neu p-4 text-center text-sm text-slate-500 shadow-neu-inset">
          見つかりませんでした
        </p>
      ) : (
        <div className={LIST_BOX}>
          <ul>
            {shown.map((m) => {
              const state = stateOf(m);
              const note = state === "blocked" && unavailable?.has(m.id) ? unavailableNote : undefined;
              return (
                <SongRow key={m.id} music={m} jacketBase={jacketBase} state={state} note={note} multi={multi} onPick={() => onPick(m)} />
              );
            })}
          </ul>
          {rest > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className={SUB_BUTTON}>
              もっと見る（残り <span className="font-num">{rest}</span>）
            </button>
          )}
        </div>
      )}
      {multi && (
        <button
          type="button"
          onClick={onClose}
          className="neu-cta mt-3 min-h-12 w-full shrink-0 rounded-xl text-base font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
        >
          {/* 選ぶたびに反映しているので、ここは閉じるだけ（右上の × と同じ名前にしない） */}
          選び終える
        </button>
      )}
    </CellSheetFrame>
  );
}
