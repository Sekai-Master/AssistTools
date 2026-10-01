import { Link } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { useRankingMusics } from "../ranking/useRankingMusics";
import { QuickCompare } from "./QuickCompare";

/**
 * 編成かんたん比較（/compare）。2026-10-01 に作り、同じ日にハブの「編成」に載せた（Nori「トップページには[編成かんたん比較]で」）。
 * 色はカテゴリー（編成）から決まる（tools.ts の unitOf が唯一の出どころ）。
 */
export default function QuickComparePage() {
  const music = useRankingMusics();
  return (
    <ToolPage morphKey="tool:compare" title="編成かんたん比較" icon="compare_arrows">
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
