/**
 * 歌う人の選択肢（曲を選ぶ小窓と、曲名ビンゴの細かい設定の「歌う人」）。
 * 名前はお題の「ボーカル」と同じ givenName（一歌・瑞希・ミク など）。
 */
import type { UnitKey } from "../../lib/units";
import { CHARACTERS, UNIT_KEY } from "../deck/lib/characters";
import { UNIT_OPTIONS } from "./bingoConstants";

/** ユニットの並び（キャラの番号の順。VIRTUAL SINGER は最後）。 */
const UNIT_ORDER: readonly UnitKey[] = ["ln", "mmj", "vbs", "wxs", "n25", "vs"];

/** ユニットごとの見出しと、そのユニットのキャラ。 */
export const SINGER_GROUPS: readonly { label: string; singers: readonly { ch: number; name: string }[] }[] = UNIT_ORDER.map(
  (unit) => ({
    label: UNIT_OPTIONS.find((o) => o.unit === unit)?.label ?? unit,
    singers: CHARACTERS.filter((c) => UNIT_KEY[c.unit] === unit).map((c) => ({ ch: c.ch, name: c.givenName })),
  })
);

const NAME_BY_CH = new Map(SINGER_GROUPS.flatMap((g) => g.singers.map((s) => [s.ch, s.name] as const)));

/** キャラの番号から名前。知らない番号は空。 */
export const singerName = (ch: number): string => NAME_BY_CH.get(ch) ?? "";
