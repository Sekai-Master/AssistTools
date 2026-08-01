import { useState } from "react";
import { cn } from "../../lib/utils";
import { ATTR_COLOR, RARITY_LABEL } from "./lib/characters";
import type { CatalogCard } from "./lib/deckInputs";

/**
 * カードのサムネイル。
 *
 * 画像は `public/CardDatas/thumb/` に自前で持っている（scripts/refresh-card-data.mjs が
 * 派生データに残ったカードぶんだけ落として 128px の webp に縮めたもの）。
 * **外部 CDN は実行時に叩かない** — 未公開データの遮断・権利・オフラインのどれから見ても、
 * 閲覧者のブラウザから他所のサーバへ取りに行かせる理由が無い（ジャケット画像と同じ判断）。
 *
 * ★ 画像が無いカードがありうる（配信の遅れ、アセット名の例外）。そのときは
 *   特訓後↔通常を1回入れ替えて試し、それでも駄目なら属性色の枠に落とす。
 *   壊れた画像アイコンは出さない。
 */
const THUMB_BASE = `${import.meta.env.BASE_URL}CardDatas/thumb/`;

export function cardThumbUrl(card: CatalogCard, trained: boolean): string {
  return `${THUMB_BASE}${card.asset}_${trained ? "after_training" : "normal"}.webp`;
}

export function CardThumb({
  card,
  trained = false,
  size = 40,
  className,
}: {
  card: CatalogCard;
  /** 特訓後の絵を出すか。編成の育成状態に合わせる。 */
  trained?: boolean;
  size?: number;
  className?: string;
}) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const border = ATTR_COLOR[card.attr] ?? "#888";

  if (failed || !card.asset) {
    // 画像が無いときは属性色の枠にレアリティだけ。名前は隣に必ず出ているので情報は落ちない。
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white",
          className
        )}
        style={{ width: size, height: size, backgroundColor: border }}
        aria-hidden
      >
        {RARITY_LABEL[card.rarity] ?? card.rarity}
      </span>
    );
  }

  return (
    <img
      src={cardThumbUrl(card, fallback ? !trained : trained)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => (fallback ? setFailed(true) : setFallback(true))}
      className={cn("shrink-0 rounded-md object-cover", className)}
      style={{ width: size, height: size, outline: `2px solid ${border}`, outlineOffset: -2 }}
    />
  );
}
