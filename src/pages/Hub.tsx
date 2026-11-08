import { EventHero } from "./hub/EventHero";
import { LatestChanges } from "./hub/LatestChanges";
import { ToolDirectory } from "./hub/ToolDirectory";

/**
 * ランディング（ハブ）。上から、開催中のイベント → ツールの一覧 → 更新履歴。
 *
 * ★ 2026-11-05 に作り直した（Nori 判断。試作は Design のキャンバスで A〜E の5案を並べ、上は案B・一覧は案C）。
 *   以前は分類ごとのカード14枚に説明文を全部載せていて、文字の多さで「うっ」となる人がいる、
 *   スマホでは機能にたどり着くまでかなりスクロールする、という指摘だった。
 *   - 最初の画面はイベントのロゴ・集計までの残り時間・6順位の予測（数字とバーで読ませる）
 *   - ツールはアイコンと名前だけ。説明は検索に回す
 * ★ それより前（2026-08-21）の判断は引き継ぐ: 12枚を平らに並べない、仕分けの単位は対象、色はカテゴリのもの。
 *   並びと色の正本は src/tools.ts。
 */
export function Hub() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-2 sm:pt-4">
      <EventHero />
      <ToolDirectory />
      <LatestChanges />
    </div>
  );
}
