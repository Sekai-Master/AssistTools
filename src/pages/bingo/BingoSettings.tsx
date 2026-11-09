import { type ReactNode, useRef, useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import type { BingoMusic, CenterMode } from "./bingoLogic";
import type { CardKind } from "./bingoShare";
import { type OdaiTheme, MAX_ODAI_PINS, ODAI_THEMES, ODAI_THEME_KEYS } from "./odaiLogic";
import type { PickableOdai } from "./odaiPins";
import {
  ALL_CATEGORY_VALUES,
  ALL_TYPE_VALUES,
  ALL_UNIT_VALUES,
  CATEGORY_OPTIONS,
  TYPE_OPTIONS,
  UNIT_OPTIONS,
} from "./bingoConstants";
import { PinnedSongs } from "./PinnedSongs";
import { SingerSelect } from "./SingerSelect";

const THEME_OPTIONS = ODAI_THEME_KEYS.map((k) => ({ value: k, label: ODAI_THEMES[k].label }));

export interface SongFilters {
  units: Set<string>;
  categories: Set<string>;
  types: Set<boolean>;
  /** 歌う人で絞る（null ならすべて）。判定はお題の「ボーカル」と同じ楽曲データの singers。 */
  singer: number | null;
  centerMode: CenterMode;
  centerSong: BingoMusic | null;
}

/** 曲名ビンゴの入れたい曲と、条件に合う曲数（細かい設定に出す）。 */
export interface SongSettingsState {
  pins: readonly BingoMusic[];
  /** 絞り込みの条件の外にある入れたい曲の id。 */
  outside: ReadonlySet<string>;
  /** 絞り込み（歌う人を含む）に当てはまる曲の数。 */
  matched: number;
  /** 条件の曲から選ぶマスの数と、選べる曲の数（入れたい曲・中央の指定曲を除く）。 */
  need: number;
  available: number;
  onRemovePin: (id: string) => void;
  onClearPins: () => void;
  onPickPins: () => void;
}

/** 絞り込みを既定（全部選んだ・歌う人はすべて）から変えているか。 */
function narrowed(f: SongFilters): boolean {
  return (
    f.units.size < ALL_UNIT_VALUES.length ||
    f.categories.size < ALL_CATEGORY_VALUES.length ||
    f.types.size < ALL_TYPE_VALUES.length ||
    f.singer !== null
  );
}

/** 見出しの行に添える要約（閉じていても使っている設定が分かるように）。何も無ければ null。 */
function summaryText(kind: CardKind, odaiPins: number, filters: SongFilters, song: SongSettingsState): ReactNode {
  if (kind === "odai") {
    return odaiPins > 0 ? (
      <>
        （入れたいお題 <span className="font-num">{odaiPins}</span>つ）
      </>
    ) : null;
  }
  if (song.pins.length === 0 && !narrowed(filters)) return null;
  return (
    <>
      （
      {song.pins.length > 0 && (
        <>
          入れたい曲 <span className="font-num">{song.pins.length}</span>曲・
        </>
      )}
      条件に合う <span className="font-num">{song.matched}</span>曲）
    </>
  );
}

function toggled<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** トグルできるチップ群（複数選択）。 */
function ToggleChips<T extends string | boolean>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <NeuButton
            key={String(o.value)}
            active={selected.has(o.value)}
            onClick={() => onChange(toggled(selected, o.value))}
            className="min-h-11 !px-3"
          >
            {o.label}
          </NeuButton>
        ))}
      </div>
    </div>
  );
}

interface Props {
  kind: CardKind;
  filters: SongFilters;
  onFiltersChange: (f: SongFilters) => void;
  /** お題ビンゴのテーマ（作るときだけ使う。コードにも保存にも入れない）。 */
  theme: OdaiTheme;
  onThemeChange: (theme: OdaiTheme) => void;
  /** お題ビンゴの入れたいお題（作るカードに必ず入れる。この端末に残す）。 */
  pins: readonly PickableOdai[];
  onRemovePin: (key: string) => void;
  onPickPins: () => void;
  /** 曲名ビンゴの入れたい曲と、条件に合う曲数。 */
  song: SongSettingsState;
  onPickCenter: () => void;
  onOpenCode: (code: string) => void;
}

/** 入れたいお題の段: 選んだお題を札＋文言のチップで並べ（それぞれ外せる）、「お題を選ぶ」で選ぶ小窓を開く。 */
function PinnedOdais({ pins, onRemove, onPick }: { pins: readonly PickableOdai[]; onRemove: (key: string) => void; onPick: () => void }) {
  // 外した × は消えるので、フォーカスは「お題を選ぶ」へ移す（body に落とさない）
  const pickRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-slate-500">
        入れたいお題（<span className="font-num">{MAX_ODAI_PINS}</span>つまで）
      </p>
      <p className="mb-2 text-sm text-slate-600">
        {pins.length > 0 ? "新しいカードを作ると、選んだお題が必ず入ります" : "選んだお題を、新しいカードに必ず入れます"}
      </p>
      {pins.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {pins.map((o) => (
            <li key={o.key} className="flex min-h-11 max-w-full items-center rounded-lg border border-slate-300 pl-3">
              <span className="min-w-0 py-1">
                <span className="block text-xs text-slate-500">{o.caption}</span>
                <span className="block text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">{o.text}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onRemove(o.key);
                  pickRef.current?.focus();
                }}
                aria-label={`${o.caption} ${o.text}を外す`}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-slate-500 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <NeuButton ref={pickRef} className="min-h-11 !px-3" onClick={onPick}>
        お題を選ぶ
      </NeuButton>
    </div>
  );
}

/** 条件に合う曲数の行。作るのに足りなければ、足りない数も出す（ボタンは親が押せなくする）。 */
function SongCount({ song }: { song: SongSettingsState }) {
  const short = song.need - song.available;
  return (
    <p className="text-sm text-slate-600" aria-live="polite">
      条件に合う曲 <span className="font-num font-bold">{song.matched}曲</span>
      {short > 0 && (
        <span className="text-rose-600">
          {" "}・ あと <span className="font-num font-bold">{short}</span> 曲足りません
        </span>
      )}
    </p>
  );
}

/** 曲名ビンゴの段: 入れたい曲・ユニット・MV 種別・曲種・歌う人・条件に合う曲数・中央マス。 */
function SongSection({
  filters,
  set,
  song,
  onPickCenter,
}: {
  filters: SongFilters;
  set: (patch: Partial<SongFilters>) => void;
  song: SongSettingsState;
  onPickCenter: () => void;
}) {
  return (
    <>
      <PinnedSongs
        pins={song.pins}
        outside={song.outside}
        rest={song.need}
        onRemove={song.onRemovePin}
        onClear={song.onClearPins}
        onPick={song.onPickPins}
      />
      <ToggleChips label="ユニット" options={UNIT_OPTIONS} selected={filters.units} onChange={(units) => set({ units })} />
      <ToggleChips
        label="MV種別"
        options={CATEGORY_OPTIONS}
        selected={filters.categories}
        onChange={(categories) => set({ categories })}
      />
      <ToggleChips label="曲種" options={TYPE_OPTIONS} selected={filters.types} onChange={(types) => set({ types })} />
      <div>
        <p className="mb-2 text-xs font-bold text-slate-500">歌う人</p>
        <SingerSelect value={filters.singer} onChange={(singer) => set({ singer })} className="w-full max-w-md" />
      </div>
      <SongCount song={song} />
      <div>
        <p className="mb-2 text-xs font-bold text-slate-500">中央マス</p>
        <SegmentedControl
          options={[
            { value: "free", label: "FREE" },
            { value: "random", label: "ランダム" },
            { value: "specified", label: "指定" },
          ]}
          value={filters.centerMode}
          buttonClassName="min-h-11"
          onChange={(centerMode) => set({ centerMode })}
        />
        {filters.centerMode === "specified" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 truncate text-sm text-slate-600">
              {filters.centerSong ? filters.centerSong.title : "未選択"}
            </span>
            <NeuButton className="min-h-11 shrink-0 !px-3" onClick={onPickCenter}>
              曲を選ぶ
            </NeuButton>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 細かい設定（初めは閉じておく）。お題ビンゴのテーマ・入れたいお題、曲名ビンゴの絞り込み・中央マスと、コードから開く。
 * 初めての人には要らないものをここに寄せて、最初の画面を「選ぶ・作る」だけにする。
 * 入れたいお題・入れたい曲・絞り込みは閉じていても使われるので、使っていれば見出しに数を出す。
 */
export function BingoSettings({
  kind,
  filters,
  onFiltersChange,
  theme,
  onThemeChange,
  pins,
  onRemovePin,
  onPickPins,
  song,
  onPickCenter,
  onOpenCode,
}: Props) {
  const [code, setCode] = useState("");
  const set = (patch: Partial<SongFilters>) => onFiltersChange({ ...filters, ...patch });
  const summary = summaryText(kind, pins.length, filters, song);

  return (
    <details className="mt-4 rounded-lg border border-slate-300">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-bold text-slate-600">
        細かい設定
        {summary !== null && <span className="font-normal text-slate-500">{summary}</span>}
      </summary>
      <div className="space-y-4 border-t border-slate-300 p-4">
        {kind === "odai" && <PinnedOdais pins={pins} onRemove={onRemovePin} onPick={onPickPins} />}
        {kind === "odai" && (
          <div>
            <p className="mb-2 text-xs font-bold text-slate-500">テーマ</p>
            <SegmentedControl
              compact
              ariaLabel="テーマ"
              options={THEME_OPTIONS}
              value={theme}
              // ★ 320px では 1 つが約 54px で、「曲名・読み」（全角 5 字・60px）は 1 行に入らない。
              //   語の途中（曲名・読｜み）で折れないよう、折るのは「・」の後ろだけにする（曲名・｜読み）
              buttonClassName="min-h-11 min-w-0 px-0 leading-tight tracking-tight [word-break:keep-all]"
              onChange={onThemeChange}
            />
          </div>
        )}
        {kind === "song" && <SongSection filters={filters} set={set} song={song} onPickCenter={onPickCenter} />}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onOpenCode(code);
          }}
        >
          <p className="mb-2 text-xs font-bold text-slate-500">コードから開く</p>
          <div className="flex gap-2">
            <NeuInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="コードかリンクを貼り付け"
              aria-label="コードかリンク"
              className="min-w-0 flex-1 text-base"
            />
            <NeuButton type="submit" className="min-h-11 shrink-0">
              開く
            </NeuButton>
          </div>
        </form>
      </div>
    </details>
  );
}
