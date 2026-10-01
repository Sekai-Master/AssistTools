import { Link } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { unitOf } from "../../tools";
import { useRankingMusics } from "../ranking/useRankingMusics";
import { QuickCompare } from "./QuickCompare";

/**
 * 編成かんたん比較（/compare）。**まだハブに載せていない**（2026-10-01 に作成。Nori が使ってみてから決める）。
 * 載せるときは src/motion/routes.ts の PAGE_LOADERS から ROUTE_LOADERS へ移して TOOLS に登録する。
 * 色は編成ビルダーと同じ「編成」の色（unitOf が唯一の出どころ）。
 */
export default function QuickComparePage() {
  const music = useRankingMusics();
  return (
    <ToolPage unit={unitOf("deck")} title="編成かんたん比較" icon="compare_arrows">
      <p className="text-sm leading-7 text-slate-600">
        総合力・イベントボーナス・スキル（リーダーと内部値）を入れるだけで、編成ごとの1回のイベントポイントを比べます。
        カードから組んで比べるなら
        <Link to="/deck" className="font-bold underline">
          編成ビルダー
        </Link>
        へ。
      </p>
      <QuickCompare entries={music.entries} loading={music.loading} error={music.error} />
    </ToolPage>
  );
}
