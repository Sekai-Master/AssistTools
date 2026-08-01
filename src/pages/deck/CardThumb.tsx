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

/**
 * マスターランクのひし形。
 * ★ ゲームではカードの**左下**に、緑基調のグラデーション＋銀の縁取りで出る。
 *   同じ見え方にしておくと、ゲーム画面と見比べたときに迷わない（Nori 指示 2026-08-02）。
 *   0 のときは出さない（ゲームでも付かない）。
 */
function MasterRankBadge({ rank, size }: { rank: number; size: number }) {
  if (!rank) return null;
  const d = Math.max(16, Math.round(size * 0.46));
  return (
    <span
      aria-label={`マスターランク${rank}`}
      className="pointer-events-none absolute grid place-items-center"
      style={{ left: -2, bottom: -2, width: d, height: d }}
    >
      <span
        className="absolute inset-0 rotate-45 rounded-[2px]"
        // 中身は上が緑・下が暗い灰（Nori 指定 2026-08-02）。縁は銀。
        // ★ この span は45度回してあるので、回転前の 135deg が画面の上下方向になる。
        style={{
          background: "linear-gradient(135deg,#1D6633 0%,#515151 100%)",
          border: "1.5px solid #d7dbe2",
        }}
      />
      {/* ★ 数字はひし形いっぱいまで大きく。小さいと何の数字か分からない。 */}
      <span
        className="relative font-bold leading-none text-white"
        style={{ fontSize: Math.round(d * 0.78), textShadow: "0 1px 1px rgba(0,0,0,.45)" }}
      >
        {rank}
      </span>
    </span>
  );
}

export function CardThumb({
  card,
  trained = false,
  size = 40,
  masterRank = 0,
  className,
}: {
  card: CatalogCard;
  /** 特訓後の絵を出すか。編成の育成状態に合わせる。 */
  trained?: boolean;
  size?: number;
  /** マスターランク（0〜5）。ゲームと同じくひし形で左下に出す。 */
  masterRank?: number;
  className?: string;
}) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const border = ATTR_COLOR[card.attr] ?? "#888";

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {failed || !card.asset ? (
        // 画像が無いときは属性色の枠にレアリティだけ。名前は隣に必ず出ているので情報は落ちない。
        <span
          className="flex h-full w-full items-center justify-center rounded-md text-[9px] font-bold text-white"
          style={{ backgroundColor: border }}
          aria-hidden
        >
          {RARITY_LABEL[card.rarity] ?? card.rarity}
        </span>
      ) : (
        <img
          src={cardThumbUrl(card, fallback ? !trained : trained)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => (fallback ? setFailed(true) : setFallback(true))}
          className="rounded-md object-cover"
          style={{ width: size, height: size, outline: `2px solid ${border}`, outlineOffset: -2 }}
        />
      )}
      <MasterRankBadge rank={masterRank} size={size} />
    </span>
  );
}
