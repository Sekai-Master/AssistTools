import { useMemo } from "react";
import { Panel } from "../../components/ui/Panel";
import { Stat } from "../refresh/Stat";
import { characterName } from "./lib/characters";
import type { CatalogCard } from "./lib/deckInputs";
import type { DeckPowerResult } from "./lib/power";
import type { PlayerSettings } from "./lib/playerStore";

/**
 * 総合力のパネル。
 *
 * ★ イベントボーナスと違い、**プレイヤー固有の入力（エリア・CR・ゲート・家具・称号）が
 *   要る**。入っていない項目は 0 として計算されるので、そのことを画面に出す。
 *   黙って低い数字を出すと「そういうものか」と受け取られて、間違いに気付けない。
 *
 * ★ 実機の総合力を入れてもらうと、計算値との差を常設表示する。家具を増やした・
 *   エリアアイテムを上げたのに設定を直していない、が誤差の広がりで分かる。
 */
export function PowerPanel({
  cards,
  result,
  settings,
}: {
  cards: CatalogCard[];
  /** 計算はページ側で1回だけ行う（比較や編成プロフィールへの保存と同じ値を使うため）。 */
  result: DeckPowerResult;
  settings: PlayerSettings;
}) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const n = (v: number) => v.toLocaleString();

  // 未入力の項目。0 として計算したものを列挙して、暫定値であることを見せる。
  const unset: string[] = [];
  // ユニット・属性・キャラのどれか1つでも入っていれば「入力した」とみなす
  // （ユニットだけを見ると、属性やキャラだけ入れた人に誤った警告を出す）。
  const anyArea = [
    settings.areaEffects.units,
    settings.areaEffects.attrs,
    settings.areaEffects.chars,
  ].some((t) => Object.values(t ?? {}).some((v) => v > 0));
  if (!anyArea) unset.push("エリアアイテム効果");
  if (Object.keys(settings.characterRanks).length === 0) unset.push("キャラクターランク");
  if (Object.keys(settings.gateLevels).length === 0) unset.push("マイセカイのゲート");
  if (!settings.honorBonus) unset.push("称号ボーナス");

  const diff = settings.actualPower ? settings.actualPower - result.total : null;

  if (cards.length === 0) {
    return (
      <Panel title="総合力">
        <p className="text-sm text-slate-500">カードを入れると総合力を計算します。</p>
      </Panel>
    );
  }

  return (
    <Panel title="総合力">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="総合力"
          value={n(result.total)}
          sub={
            diff == null
              ? `${cards.length}枚`
              : diff === 0
                ? "実機と一致"
                : `実機と ${diff > 0 ? "+" : ""}${n(diff)}`
          }
        />
        <Stat label="パフォーマンス" value={n(result.performance)} sub="カードの素の値" />
        <Stat label="エリアアイテム" value={n(result.areaItem)} sub={sameLabel(result.sameUnit, result.sameAttr)} />
        <Stat label="キャラクターランク" value={n(result.characterRank)} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="ゲート" value={n(result.gate)} />
        <Stat label="家具" value={n(result.fixture)} />
        <Stat label="称号" value={n(result.honor)} />
      </div>

      <ul className="mt-4 space-y-1 text-sm">
        {result.perCard.map((c) => {
          const card = byId.get(c.cardId);
          return (
            // 内訳は幅を食うので、狭い画面では名前の下へ回す（横スクロールを作らない）。
            <li key={c.cardId} className="rounded-lg px-2 py-1.5 shadow-neu-inset">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {card ? `${characterName(card.ch)}「${card.name}」` : `カード${c.cardId}`}
                </span>
                <span className="w-20 shrink-0 text-right font-bold tabular-nums text-slate-700">
                  {n(c.total)}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                素 {n(c.performanceTotal)} ・ エリア {n(c.areaItem)} ・ CR {n(c.characterRank)}
                {c.gate > 0 && ` ・ ゲート ${c.gate}`}
                {c.fixture > 0 && ` ・ 家具 ${c.fixture}`}
              </div>
            </li>
          );
        })}
      </ul>

      {/* ★ 計算できなかったものは黙って0にしない（power.ts が missing で返してくる）。 */}
      {result.missing.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-rose-600" role="alert">
          {result.missing.map((m) => (
            <li key={m}>⚠ {m}</li>
          ))}
        </ul>
      )}
      {result.unsetMasterRank.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          ⚠ マスターランク未設定のカードが {result.unsetMasterRank.length} 枚あります（0として計算した暫定値）。
        </p>
      )}
      {unset.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          ⚠ 未入力の項目があります（0として計算しています）: {unset.join(" / ")}。
          下の「プレイヤー設定」で入れてください。
        </p>
      )}
    </Panel>
  );
}

/** 全一致（5枚が同じユニット枠／同じ属性）が付いているかを一言で。 */
function sameLabel(sameUnit: boolean, sameAttr: boolean): string {
  if (sameUnit && sameAttr) return "ユニット・属性とも全一致";
  if (sameUnit) return "ユニット全一致";
  if (sameAttr) return "属性全一致";
  return "全一致なし";
}
