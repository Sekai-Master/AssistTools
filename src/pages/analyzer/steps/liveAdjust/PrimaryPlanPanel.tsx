import { NeuButton } from "../../../../components/ui/NeuButton";
import { maxEfficientLiveBonus } from "../../lib/calcLivePt";
import type { MultiLiveAdjustResult, MultiLivePlan } from "../../lib/multiLiveAdjust";
import type { SameBaseSearchResult } from "../../lib/sameBaseAdjust";
import type { ScoreZeroFinishResult } from "../../lib/scoreZeroFinish";
import { formatApproxMinutes, planDurationSec, type TimeForBase } from "../../lib/planDuration";
import { FormationUnchangedBadge, LbCostNote } from "./badges";
import { CompactPlanCard } from "./CompactPlanCard";
import { AdoptedUnitLine } from "./UnitLine";
import { candidatesForBase, resolveSong } from "./musicHelpers";
import { isSingleSong } from "./planSelection";
import { resolveDisplayPlan } from "./resolveDisplayPlan";
import type { Adopted, SuggestMusic } from "./types";

/**
 * ライブ調整の第1候補（複数回・現在の編成のまま曲を選ぶ）パネル。
 * 主役カード・同一曲縛り／スコア0イベ乙トグル・同回数の内訳違い・本数違いの
 * 前線をまとめて描画する。LiveAdjustStep.tsx が800行に迫っていたため分割した。
 */
export function PrimaryPlanPanel({
  multi,
  primaryPlan,
  primaryDurationSec,
  adopted,
  onAdopt,
  sameSongOnly,
  onToggleSameSongOnly,
  songLockResult,
  scoreZeroOn,
  onToggleScoreZero,
  scoreZeroResult,
  musics,
  songByBase,
  onPickSong,
  timeForBase,
  maxScore,
  finalRunPt,
  onCopyImage,
  onSaveImage,
  imageNotice,
}: {
  multi: MultiLiveAdjustResult;
  primaryPlan: MultiLivePlan;
  primaryDurationSec: number | undefined;
  adopted: Adopted;
  onAdopt: (a: Adopted) => void;
  sameSongOnly: boolean;
  onToggleSameSongOnly: () => void;
  songLockResult: SameBaseSearchResult | undefined;
  scoreZeroOn: boolean;
  onToggleScoreZero: () => void;
  scoreZeroResult: ScoreZeroFinishResult | undefined;
  musics: ReadonlyArray<SuggestMusic>;
  songByBase: Record<number, string>;
  onPickSong: (basePoint: number) => void;
  timeForBase: TimeForBase;
  maxScore: number;
  finalRunPt: number;
  onCopyImage: (plan: MultiLivePlan) => void;
  onSaveImage: (plan: MultiLivePlan) => void;
  imageNotice: string | null;
}) {
  const explicitAdopt = adopted.kind !== "primary";
  const { plan: chosen, cardLabel, notices, isScoreZeroFinish } = resolveDisplayPlan({
    multi,
    primaryPlan,
    adopted,
    sameSongOnly,
    songLockResult,
    scoreZeroOn,
    scoreZeroResult,
  });
  // 致命傷C対応: 「同じN回で組み替える」枠は常に primaryPlan.liveCount 基準の
  // 旧主役由来の内訳なので、トグルが主役を差し替えているとき（スコア0イベ乙・
  // 同一曲固定案のどちらかが実際に採用されているとき）に並べると「表示中プランと
  // 無関係な選択肢が同居し、選ぶと無言でロックが外れる」事故になる（弱点4）。
  // ユーザー自身が明示的に選んだ状態（▸ 採択中）ではこの枠自体が選択の主手段
  // なので隠さない。
  const showSameCountVariants = cardLabel !== "▸ スコア0イベ乙" && cardLabel !== "▸ 同一曲固定案";
  const durationSec = planDurationSec(chosen, timeForBase);
  // LBは5炊きまで1個あたりの効率が同じ（2024-09-28改定）。「5」を直書きせず表から導出する
  // ことで、表が将来また改定されても文言が追随する（弱点7と同型の再発防止・P2-8）。
  const efficientLiveBonus = maxEfficientLiveBonus();

  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
          複数回プラン（現在の編成のまま曲を選ぶ・第1候補）
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* P1-6: エビ詰めモードの主役復帰。ONで全ユニット同一基礎点の案を優先表示する。 */}
          <NeuButton
            className="!px-2.5 !py-1 !text-[11px]"
            active={sameSongOnly}
            disabled={explicitAdopt}
            onClick={onToggleSameSongOnly}
          >
            同じ曲だけで組む
          </NeuButton>
          {/* スコア0イベ乙（既定OFF）。最後の1本を叩かずに終える締め方（docs/point-adjust-score-zero-finish.md）。 */}
          <NeuButton
            className="!px-2.5 !py-1 !text-[11px]"
            active={scoreZeroOn}
            disabled={explicitAdopt}
            onClick={onToggleScoreZero}
          >
            スコア0イベ乙で締める
          </NeuButton>
        </div>
      </div>
      {/* 致命傷B対応: 他案を採択中はロック系トグルが無言で無効になっていた。
          disabled にした上で理由を明示し、「無効なのに押せる」という嘘の状態表示をやめる。 */}
      {explicitAdopt && (
        <p className="mb-2 text-[11px] text-slate-400">
          他の案を採択中はロック系トグルを使えません（下の「推奨案（主役）に戻す」を押すと使えます）。
        </p>
      )}
      {/* 致命傷C対応: 「ONだから出す」をやめ、実際に表示中のプランがイベ乙の
          締めを含んでいるか（isScoreZeroFinish）に連動させる。トグルONでも
          不適用（NG・同一曲縛り優先）に終わったときはこの文言を出さず、
          下の notices で「なぜ出ていないか」を案内する。 */}
      {isScoreZeroFinish && !explicitAdopt && (
        <p className="mb-2 text-[11px] text-slate-400">
          スコア0イベ乙: 最後の1本は叩かずに終えます。ミスによるズレが起きません。
        </p>
      )}
      {notices.map((notice) => (
        <p key={notice} className="mb-2 text-[11px] text-amber-600">
          {notice}
        </p>
      ))}

      {/* 主役カード（ブリーフP0-2）。常時展開・採択中プランを常にここに描画する。 */}
      <div className="rounded-xl bg-neu p-4 shadow-neu-inset">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-bold" style={{ color: "var(--unit-color)" }}>
            {cardLabel}
          </span>
          {/* cardLabel だけでは分からない「実は同一曲でも組めている」を見落とさせない。
              スコア0イベ乙＋同一曲縛りの組合せ（scoreZeroBasePoints が locked base に
              絞られたとき）もここで自動的に拾える（isSingleSong は基礎点の集合で
              判定する汎用チェックなので、どちらのトグル由来かを個別に追跡しなくて済む）。 */}
          {isSingleSong(chosen) && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">同一曲</span>
          )}
          <span className="text-xs tabular-nums text-slate-500">
            {chosen.liveCount}回 ・{" "}
            {durationSec !== undefined ? formatApproxMinutes(durationSec) : "所要時間不明"}
            {" "}・ LB合計{chosen.lbCost}
            <LbCostNote lbCost={chosen.lbCost} /> ・ 合計{" "}
            {chosen.totalPt.toLocaleString()} Pt
          </span>
          {/* 弱点4: multi の全プランは「現在の編成のまま」が前提なので、
              主役に限らず常に表示する（旧実装は isPrimary 限定でバッジが消えていた）。 */}
          <FormationUnchangedBadge />
          {/* 致命傷1: 非主役を採択中のとき、常に押せる位置に復帰導線を置く。
              スマホ誤タップからの復帰を「再計算」ではなくワンタップにする。 */}
          {explicitAdopt && (
            <NeuButton className="!px-2.5 !py-1 !text-[11px]" onClick={() => onAdopt({ kind: "primary" })}>
              推奨案（主役）に戻す
            </NeuButton>
          )}
        </div>
        {/* LB消費の現実コストを隠さない（R3-1）。所持上限10個・ラストラン側の
            消費（planFinalRun は LB 0〜10 を使う）まで含めた総量をここで開示する。 */}
        {chosen.lbCost > 10 && (
          <p className="mb-2 text-xs text-amber-600">
            所持上限10個を超えるため、自然回復待ちまたはクリスタルでの補充が必要です
          </p>
        )}
        {finalRunPt > 0 && (
          <p className="mb-2 text-xs text-slate-500">
            ラストラン分（選ぶプランにより 0〜10）を含めた総LB消費は {chosen.lbCost}〜
            {chosen.lbCost + 10}
          </p>
        )}
        <ol className="space-y-3">
          {chosen.units.map((u, j) => {
            const candidates = candidatesForBase(musics, u.basePoint);
            const picked = resolveSong(candidates, songByBase, u.basePoint);
            const isFinish = isScoreZeroFinish && j === chosen.units.length - 1;
            return (
              <AdoptedUnitLine
                key={j}
                u={u}
                candidates={candidates}
                chosen={picked}
                maxScore={maxScore}
                isFinish={isFinish}
                onPick={() => onPickSong(u.basePoint)}
              />
            );
          })}
        </ol>
        {/* 「n回すべてで狙い撃つ」重さと、外したときの実損を明示する（R3-4 MEDIUM）。 */}
        <p className="mt-3 text-[11px] text-slate-400">
          全{chosen.liveCount}
          回それぞれでスコア帯（2万点幅）を狙い撃つ必要があります。帯を外した回のLBは戻りません。
        </p>
        {/* P2-8: 「3焚きまで」は旧仕様時代の最適運用。2024-09-28改定後は5焚きまで効率が
            横ばいなので、ここで本数を稼ぐと時間だけ余計に払うことになる。旧実装は
            multi.plans.length > 1 のガード内にあり、全数照合経路（plans は常に1件＝
            エビ詰め域＝この注記の本来の読者）では絶対に表示されなかった（弱点1）。
            ここは主役カード直下＝各ユニットの「炊き数」が並ぶ場所のすぐ隣に置き、
            ガード無しで常に表示する。「5」は maxEfficientLiveBonus() からの導出値
            （ハードコード禁止・弱点7の再発防止）。 */}
        <p className="mt-2 text-[11px] text-slate-400">
          LBは{efficientLiveBonus}炊きまでは1個あたりの効率が同じです（2024-09-28改定）。
          それより少ない炊き数で止めると、本数が増えるぶん時間を余計に使います。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <NeuButton className="!py-1.5 !text-xs" onClick={() => onCopyImage(chosen)}>
            画像をコピー
          </NeuButton>
          <NeuButton className="!py-1.5 !text-xs" onClick={() => onSaveImage(chosen)}>
            画像で保存
          </NeuButton>
          <span className="text-[11px] text-slate-400">
            {imageNotice ?? (finalRunPt > 0 ? "ラストランも含めた1枚になります" : null)}
          </span>
        </div>
      </div>

      {/* 同じN回で組み替える（LB内訳違い）。既定で畳む。0件なら非表示（ブリーフP0-2）。
          弱点4: ロック系トグルが主役を差し替えている間は隠す（showSameCountVariants）。 */}
      {showSameCountVariants && multi.sameCountVariants.length > 0 && (
        <details className="mt-3 rounded-xl bg-neu p-3 shadow-neu-sm">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">
            同じ{primaryPlan.liveCount}回で組み替える（{multi.sameCountVariants.length}件）
          </summary>
          <div className="mt-2 space-y-2">
            {multi.sameCountVariants.map((v, i) => {
              const sec = planDurationSec(v, timeForBase);
              return (
                <CompactPlanCard
                  key={i}
                  plan={v}
                  timeLabel={sec !== undefined ? formatApproxMinutes(sec) : "所要時間不明"}
                  maxScore={maxScore}
                  adopted={adopted.kind === "variant" && adopted.index === i}
                  singleSong={isSingleSong(v)}
                  onAdopt={() => onAdopt({ kind: "variant", index: i })}
                />
              );
            })}
          </div>
        </details>
      )}

      {/* 本数を増やしてLBを節約（非推奨）。畳んだうえで追加時間を明示する（ブリーフP0-2・診断1）。 */}
      {multi.plans.length > 1 && (
        <details className="mt-1 rounded-xl bg-neu p-3 shadow-neu-sm">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">
            本数を増やしてLBを節約（非推奨
            {(() => {
              const lastSec = planDurationSec(multi.plans[multi.plans.length - 1], timeForBase);
              if (primaryDurationSec === undefined || lastSec === undefined) return "";
              const deltaMin = Math.ceil((lastSec - primaryDurationSec) / 60);
              return deltaMin > 0 ? `・+${deltaMin}分〜` : "";
            })()}
            ）
          </summary>
          <div className="mt-2 space-y-2">
            {multi.plans.slice(1).map((p, i) => {
              const sec = planDurationSec(p, timeForBase);
              let timeLabel = sec !== undefined ? formatApproxMinutes(sec) : "所要時間不明";
              // 弱点8: 時間が不明な側があるのに「時間増」と断定しない。
              // 双方が既知のときだけ比較結果を付け足す。
              if (sec !== undefined && primaryDurationSec !== undefined) {
                const deltaMin = Math.ceil((sec - primaryDurationSec) / 60);
                timeLabel += deltaMin > 0 ? `（主役比 +${deltaMin}分）` : "";
              }
              return (
                <CompactPlanCard
                  key={i}
                  plan={p}
                  timeLabel={timeLabel}
                  maxScore={maxScore}
                  adopted={adopted.kind === "frontier" && adopted.index === i + 1}
                  singleSong={isSingleSong(p)}
                  onAdopt={() => onAdopt({ kind: "frontier", index: i + 1 })}
                />
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
