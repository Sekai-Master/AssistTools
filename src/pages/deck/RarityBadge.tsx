import { ATTR_COLOR, ATTR_LABEL, RARITY_LABEL } from "./lib/characters";
import { cn } from "../../lib/utils";

/**
 * レアリティのバッジ（下地は属性色）。
 *
 * ★ **幅を固定する。** ラベルは「★4」が 28.4px、「Birthday」が 54.5px で
 *   26px も違う。カードを縦に並べる場所（編成の5枠・カード検索の一覧）では、
 *   この差がそのまま**カード名の開始位置のズレ**になり、行ごとにガタつく。
 *   min-w は実測した最長ラベル（Birthday）に合わせてある。
 *
 * ★ ラベルを増やすとき（新しいレアリティ区分が来たとき）は、**幅が足りるか
 *   測り直すこと**。溢れると今度は逆に長い行だけずれる。
 *
 * ★ 2箇所で同じ見た目を作っていたので部品にした。次に同じものが要るときは
 *   コピーせずこれを使う。
 */
export function RarityBadge({
  attr,
  rarity,
  className,
}: {
  attr: string;
  rarity: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "min-w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold text-white",
        className
      )}
      style={{ backgroundColor: ATTR_COLOR[attr] ?? "#888" }}
      title={ATTR_LABEL[attr] ?? attr}
    >
      {RARITY_LABEL[rarity] ?? rarity}
    </span>
  );
}
