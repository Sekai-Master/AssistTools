/**
 * 効率曲ランキングの「絞り込み」（閉じた段）の見出しに出す要約と、既定から変えた数（2026-11-19）。
 *
 * ★ 難易度・譜面レベル・並べ方（1曲1行か難易度ごとか）は閉じた段に畳む。畳んでも表に効くので、
 *   閉じたままでも今の条件が分かるよう要約を出し、既定から変えた数を数える
 *   （数え方は周回プラン・ついぼ・マイセカイと同じ countChanged。表示は MoreSettings）。
 * ★ 要約は短く保つ（見出しの 1 行に入る長さなら、折り返しても要約ごと次の行へ送られ、語の途中で割れない）。
 *   半分より多く選んでいるときは「EXPERT以外」のように外した方を書く。
 */
import { countChanged } from "../../../lib/countChanged";

export interface FilterState {
  /** 難易度の表示名（画面の並び）。 */
  all: readonly string[];
  /** 選んでいる難易度の表示名（画面の並び）。 */
  selected: readonly string[];
  /** 譜面レベルを絞っているか（データの両端より内側か）。 */
  levelFiltered: boolean;
  /** 絞っているときの下限・上限。 */
  lo: number;
  hi: number;
  /** 難易度ごとに全部並べるか（既定は1曲1行）。 */
  allDiffs: boolean;
}

function diffText(all: readonly string[], selected: readonly string[]): string {
  if (selected.length === all.length) return "すべての難易度";
  if (selected.length === 0) return "難易度なし";
  if (selected.length > all.length / 2) {
    return `${all.filter((d) => !selected.includes(d)).join("・")}以外`;
  }
  return selected.join("・");
}

export function filterSummary(s: FilterState): { text: string; changed: number } {
  const level = s.levelFiltered ? `レベル${s.lo}〜${s.hi}` : "全レベル";
  const rows = s.allDiffs ? "難易度ごと" : "1曲1行";
  return {
    text: [diffText(s.all, s.selected), level, rows].join("・"),
    changed: countChanged([
      [s.selected.length === s.all.length, true],
      [s.levelFiltered, false],
      [s.allDiffs, false],
    ]),
  };
}
