import type { CompareRow } from "./lib/compare";

/**
 * 「ボーナスが低い方が勝っている」の指摘。編成ビルダーの比較と、編成かんたん比較で共通。
 *
 * ★ 逆転はこの比較の存在意義そのもの。数字を並べるだけだと見落とされるので、文で言う。
 * ★ 勝ち負けは総合力だけでなくスキルでも付く（かんたん比較はスキルを編成ごとに打ち込む）。
 */
export function UpsetNote({ upset }: { upset: { winner: CompareRow; loser: CompareRow } }) {
  return (
    <p className="mt-3 rounded-lg p-3 text-sm shadow-neu-inset text-slate-700">
      <span className="font-bold" style={{ color: "var(--unit-color)" }}>
        ボーナスが低い方が勝っています。
      </span>{" "}
      「{upset.winner.name}」はボーナス {upset.winner.bonus}%（{upset.loser.name} より
      {(upset.loser.bonus - upset.winner.bonus).toFixed(1)}% 低い）ですが、総合力・スキルの差で
      最終ポイントは {Math.round((upset.winner.eventPt ?? 0) - (upset.loser.eventPt ?? 0)).toLocaleString()}
      pt 上回ります。ゲーム内のおまかせ編成では出てこない編成です。
    </p>
  );
}
