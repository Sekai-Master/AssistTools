import type { AliasEntry } from "../../lib/songSearch";
import type { BingoMusic } from "./bingoLogic";
import { progressOf } from "./bingoProgress";
import type { KindedCard } from "./bingoShare";
import { ODAI_LEVELS, odaiLevelOf } from "./odaiLogic";
import type { PickableOdai } from "./odaiPins";
import type { FontStep } from "./boardLayout";
import { BingoCardGrid } from "./BingoCardGrid";
import type { MultiEntry } from "./useMultiSet";

interface Props {
  entry: MultiEntry;
  name: string;
  musics: BingoMusic[];
  aliases: AliasEntry[];
  jacketBase: string;
  pickable: readonly PickableOdai[];
  board: { width: number; step: FontStep };
  onChange: (card: KindedCard) => void;
  onSettings: () => void;
}

/** 種類と段（「お題 NORMAL」「曲名」）。 */
const kindLabel = (kc: KindedCard) => (kc.kind === "odai" ? `お題 ${ODAI_LEVELS[odaiLevelOf(kc.card)].label}` : "曲名");

const SETTINGS_BUTTON =
  "flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

/** カードの見出し: 名前（16px 太字）・種類と段・埋めたマス・リーチ・BINGO の札、右端に [設定]。 */
function BoardHeader({ name, kc, onSettings }: { name: string; kc: KindedCard | null; onSettings: () => void }) {
  const p = kc ? progressOf(kc.card) : null;
  return (
    <div className="mb-2 flex min-h-11 items-center gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-bold text-slate-700">{name}</h3>
        {kc && p && (
          <p className="truncate text-xs text-slate-500">
            {kindLabel(kc)} ・ 埋めた{" "}
            <span className="font-num font-bold text-slate-600">
              {p.filled}/{p.total}
            </span>
            {p.reach > 0 && (
              <>
                {" "}・ リーチ <span className="font-num font-bold text-slate-600">{p.reach}</span>
              </>
            )}
          </p>
        )}
      </div>
      {p?.bingo && (
        <span className="shrink-0 rounded-lg bg-[color:var(--unit-color)] px-2 py-1 text-sm font-bold text-[color:var(--unit-ink)]">
          {p.lines.length > 1 ? `BINGO! ×${p.lines.length}` : "BINGO!"}
        </span>
      )}
      <button type="button" onClick={onSettings} aria-label={`${name}の設定`} className={SETTINGS_BUTTON}>
        設定
      </button>
    </div>
  );
}

/**
 * まとめて遊ぶの 1 枚。見出しと盤面（BingoCardGrid を盤面として描く）。
 * 読めないカード（楽曲データの側が変わった など）は盤面の代わりに 1 行で出し、消すのは設定から（黙って落とさない）。
 */
export function MultiBoard({ entry, name, musics, aliases, jacketBase, pickable, board, onChange, onSettings }: Props) {
  const kc = entry.card;
  return (
    <section aria-label={name} className="min-w-0">
      <BoardHeader name={name} kc={kc} onSettings={onSettings} />
      {!kc ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600" role="note">
          このカードは読めません（配信が止まった曲などが入っています）。「設定」からコードをコピーするか、外せます
        </p>
      ) : kc.kind === "odai" ? (
        <BingoCardGrid
          kind="odai"
          card={kc.card}
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          pickable={pickable}
          board={board}
          onChange={(card) => onChange({ kind: "odai", card })}
        />
      ) : (
        <BingoCardGrid
          kind="song"
          card={kc.card}
          musics={musics}
          aliases={aliases}
          jacketBase={jacketBase}
          board={board}
          onChange={(card) => onChange({ kind: "song", card })}
        />
      )}
    </section>
  );
}
