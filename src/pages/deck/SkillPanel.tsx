import { useMemo } from "react";
import { Panel } from "../../components/ui/Panel";
import { Stat } from "../refresh/Stat";
import { characterName } from "./lib/characters";
import type { CatalogCard } from "./lib/deckInputs";
import type { DeckSkillResult } from "./lib/skill";

/**
 * スキル値。
 *
 * ★ 他のツール（ランキング・アナライザー・実効値計算機）は「150/710」を手で入れる
 *   前提だが、編成ビルダーは**カードが1意に決まっている**ので、スキルレベルさえ
 *   入れれば内部値も実効値も出せる。ここが自動で埋まると、編成を変えたときに
 *   スキルまで含めた比較ができる。
 *
 * ★ 出しているのは**そのスキルレベルでのスコアアップの上限%**。
 *   条件付き（ライフ依存・GOODを出すまで・PERFECTのみ）は上限側を採っている。
 *   ゲーム内のスキル表示も上限で書かれているので、そこと突き合わせられる。
 */
export function SkillPanel({ cards, result }: { cards: CatalogCard[]; result: DeckSkillResult }) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  if (cards.length === 0) return null;

  const round = (v: number) => Math.round(v * 10) / 10;

  return (
    <Panel title="スキル">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="先頭スキル" value={`${round(result.leader)}%`} sub="リーダーの値" />
        <Stat label="内部値" value={`${round(result.total)}%`} sub="5枚の合計" />
        <Stat label="実効値（協力）" value={`${round(result.effective)}%`} sub="先頭＋残り×0.2" />
      </div>

      <details className="mt-3 rounded-lg p-3 shadow-neu-inset">
        <summary className="cursor-pointer text-sm font-bold text-slate-600">内訳</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {result.perCard.map((c) => {
            const card = byId.get(c.cardId);
            return (
              <li key={c.cardId} className="rounded-lg bg-neu px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    {card ? `${characterName(card.ch)}「${card.name}」` : `カード${c.cardId}`}
                  </span>
                  <span className="w-16 shrink-0 text-right font-bold tabular-nums text-slate-700">
                    {round(c.value)}%
                  </span>
                </div>
                {/* ★ 編成で上乗せされたぶんは理由を書く。黙って増えていると信用できない。 */}
                {c.bonus > 0 && (
                  <div className="text-xs text-slate-400">
                    素 {c.base}% ＋ {round(c.bonus)}%（{c.note}）
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          条件付きのスキル（ライフ依存・GOODを出すまで・PERFECTのみ）は上限の値で出しています。
          ゲーム内のスキル説明に出ている「最大◯%」と同じ見方です。
        </p>
      </details>

      {result.missing.length > 0 && (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          ⚠ スキルの内容が分からないカードが {result.missing.length} 枚あります（0として計算しています）。
        </p>
      )}
    </Panel>
  );
}
