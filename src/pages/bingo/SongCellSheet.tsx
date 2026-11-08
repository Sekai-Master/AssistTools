import { onJacketError } from "../../lib/img";
import type { BingoMusic } from "./bingoLogic";
import { CellSheetFrame, FillButton } from "./CellSheetFrame";

interface Props {
  music: BingoMusic;
  cleared: boolean;
  jacketBase: string;
  onSetCleared: (cleared: boolean) => void;
  onReplace: () => void;
  onClose: () => void;
}

/** 曲名ビンゴのマスの小窓。曲を確かめて埋める／戻す。曲の差し替えもここから。 */
export function SongCellSheet({ music, cleared, jacketBase, onSetCleared, onReplace, onClose }: Props) {
  return (
    <CellSheetFrame caption="曲" title={music.title} sub={music.artistName} onClose={onClose}>
      <img
        src={`${jacketBase}${music.jacketLink}`}
        alt=""
        className="mx-auto mt-4 h-32 w-32 rounded-lg object-cover"
        onError={onJacketError}
      />
      <FillButton cleared={cleared} onSetCleared={onSetCleared} />
      <button
        type="button"
        onClick={onReplace}
        className="mt-3 min-h-11 w-full rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]"
      >
        曲を差し替える
      </button>
    </CellSheetFrame>
  );
}
