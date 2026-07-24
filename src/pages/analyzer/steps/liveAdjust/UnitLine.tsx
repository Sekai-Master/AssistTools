import { NeuButton } from "../../../../components/ui/NeuButton";
import { onJacketError } from "../../../../lib/img";
import { scoreBandBadge } from "../../lib/scoreBandBadge";
import type { MultiLiveUnit } from "../../lib/multiLiveAdjust";
import { JACKET_BASE } from "../../assetPaths";
import { FinishBadge, ScoreBandTag } from "./badges";
import type { SuggestMusic } from "./types";

/** 1ユニット（同一条件でまとめて叩くライブ群）の要約行。 */
export function UnitLine({ u }: { u: MultiLiveUnit }) {
  return (
    <span className="font-mono tabular-nums">
      基礎点{u.basePoint} ・ {u.liveBonus}炊き ・ スコア {u.minScore.toLocaleString()}〜
      {u.maxScore.toLocaleString()} × {u.count}回（1回 {u.pt.toLocaleString()} Pt）
    </span>
  );
}

/**
 * 主役カードの1ユニット行（ブリーフP0-3）。
 * 「基礎点130」で止めず「メルト（182秒）」まで曲名をインライン表示する。
 * 曲が引けない場合のみ従来どおり基礎点表記に落ちる。
 * R5: スマホ片手で縦密度を落とさない 32px（h-8 w-8）のジャケットサムネイルを行頭に追加。
 */
export function AdoptedUnitLine({
  u,
  candidates,
  chosen,
  isFinish = false,
  onPick,
}: {
  u: MultiLiveUnit;
  candidates: ReadonlyArray<SuggestMusic>;
  chosen: SuggestMusic | undefined;
  /**
   * スコア0クリア（叩かない）の締め1本かどうか。true のときは ScoreBandTag の
   * 代わりに FinishBadge を出し、区切り線で他ユニットと視覚的に区別する。
   */
  isFinish?: boolean;
  onPick: () => void;
}) {
  // 短い順の代替曲を副次表示する（同一基礎点、採択中の曲を除く先頭2件）。
  const alternatives = candidates.filter((m) => m.id !== chosen?.id).slice(0, 2);
  return (
    <li className={isFinish ? "border-t border-dashed border-slate-300 pt-3" : undefined}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
        {chosen ? (
          <img
            src={`${JACKET_BASE}${chosen.jacketLink}`}
            alt=""
            className="h-8 w-8 shrink-0 rounded object-cover shadow-neu-sm"
            onError={onJacketError}
          />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded bg-neu shadow-neu-inset" />
        )}
        {chosen ? (
          <span className="font-bold">
            {chosen.title}
            {chosen.musicTime > 0 && (
              <span className="ml-1 font-mono text-xs font-normal text-slate-500">
                （{Math.round(chosen.musicTime)}秒）
              </span>
            )}
          </span>
        ) : (
          <span className="font-bold text-amber-600">基礎点{u.basePoint}（曲未確定）</span>
        )}
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {u.liveBonus}炊き ・ スコア {u.minScore.toLocaleString()}〜{u.maxScore.toLocaleString()}
          {" "}× {u.count}回（1回 {u.pt.toLocaleString()} Pt）
        </span>
        {isFinish ? <FinishBadge /> : <ScoreBandTag band={scoreBandBadge(u)} />}
        <NeuButton className="!px-2.5 !py-1 !text-[11px]" onClick={onPick}>
          変更
        </NeuButton>
      </div>
      {!chosen && (
        <p className="mt-1 text-xs text-amber-600">
          基礎点 {u.basePoint} に一致する曲が見つかりません（配信停止曲は候補から除外しています）。
        </p>
      )}
      {alternatives.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-400">
          代替曲:{" "}
          {alternatives
            .map((m) => (m.musicTime > 0 ? `${m.title}（${Math.round(m.musicTime)}秒）` : m.title))
            .join(" / ")}
        </p>
      )}
    </li>
  );
}
