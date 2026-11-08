import { useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuInput } from "../../components/ui/NeuInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import type { BingoMusic, CenterMode } from "./bingoLogic";
import type { CardKind } from "./bingoShare";
import { type OdaiTheme, ODAI_THEMES, ODAI_THEME_KEYS } from "./odaiLogic";
import { CATEGORY_OPTIONS, TYPE_OPTIONS, UNIT_OPTIONS } from "./bingoConstants";

const THEME_OPTIONS = ODAI_THEME_KEYS.map((k) => ({ value: k, label: ODAI_THEMES[k].label }));

export interface SongFilters {
  units: Set<string>;
  categories: Set<string>;
  types: Set<boolean>;
  centerMode: CenterMode;
  centerSong: BingoMusic | null;
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
  onPickCenter: () => void;
  onOpenCode: (code: string) => void;
}

/**
 * 細かい設定（初めは閉じておく）。お題ビンゴのテーマ、曲名ビンゴの絞り込み・中央マスと、コードから開く。
 * 初めての人には要らないものをここに寄せて、最初の画面を「選ぶ・作る」だけにする。
 */
export function BingoSettings({ kind, filters, onFiltersChange, theme, onThemeChange, onPickCenter, onOpenCode }: Props) {
  const [code, setCode] = useState("");
  const set = (patch: Partial<SongFilters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <details className="mt-4 rounded-lg border border-slate-300">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-bold text-slate-600">
        細かい設定
      </summary>
      <div className="space-y-4 border-t border-slate-300 p-4">
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
        {kind === "song" && (
          <>
            <ToggleChips label="ユニット" options={UNIT_OPTIONS} selected={filters.units} onChange={(units) => set({ units })} />
            <ToggleChips
              label="MV種別"
              options={CATEGORY_OPTIONS}
              selected={filters.categories}
              onChange={(categories) => set({ categories })}
            />
            <ToggleChips label="曲種" options={TYPE_OPTIONS} selected={filters.types} onChange={(types) => set({ types })} />
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
        )}
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
