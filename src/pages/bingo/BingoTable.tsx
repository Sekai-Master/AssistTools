import { type Cell, cellPositionLabel } from "./bingoLogic";
import { UNIT_OPTIONS } from "./bingoConstants";
import { onJacketError } from "../../lib/img";

const unitLabel = (u: string) => UNIT_OPTIONS.find((o) => o.value === u)?.label ?? "その他";

interface Props {
  card: Cell[];
  jacketBase: string;
  onToggleCleared: (index: number) => void;
  onEditCell: (index: number) => void;
}

/** カードのマス一覧テーブル。曲名クリックで差し替え、状態クリックでクリア切替。 */
export function BingoTable({ card, jacketBase, onToggleCleared, onEditCell }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs">
            <th className="p-2 text-left">位置</th>
            <th className="p-2 text-left">ジャケット</th>
            <th className="p-2 text-left">曲名</th>
            <th className="p-2 text-left">ユニット</th>
            <th className="p-2 text-left">状態</th>
          </tr>
        </thead>
        <tbody>
          {card.map((cell, i) => {
            const cleared = cell !== "FREE" && cell.cleared;
            return (
              <tr
                key={i}
                className={cleared ? "bg-rose-50 font-bold" : "border-t border-slate-100"}
              >
                <td className="p-2 text-slate-500">{cellPositionLabel(i)}</td>
                <td className="p-2">
                  {cell === "FREE" ? (
                    <span className="text-slate-500 text-xs">FREE</span>
                  ) : (
                    <img
                      src={`${jacketBase}${cell.jacketLink}`}
                      alt=""
                      className={`h-10 w-10 rounded object-cover ${cleared ? "grayscale" : ""}`}
                      loading="lazy"
                      onError={onJacketError}
                    />
                  )}
                </td>
                <td className="p-2">
                  {cell === "FREE" ? (
                    <span className="text-slate-500">FREE（中央）</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEditCell(i)}
                      className="text-left text-slate-700 hover:underline"
                    >
                      {cell.title}
                    </button>
                  )}
                </td>
                <td className="p-2 text-slate-500">
                  {cell === "FREE" ? "-" : unitLabel(cell.Unit)}
                </td>
                <td className="p-2">
                  {cell === "FREE" ? (
                    <span className="text-slate-300">-</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleCleared(i)}
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        cleared
                          ? "bg-rose-500 text-white"
                          : "bg-neu shadow-neu-sm text-slate-500"
                      }`}
                    >
                      {cleared ? "CLEARED" : "未"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
