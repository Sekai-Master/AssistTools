import { useEffect, useMemo, useRef, useState } from "react";
import { StepSection } from "./StepSection";
import { SongSearchModal } from "../../../components/SongSearchModal";
import type { AliasEntry } from "../../bingo/useBingoMusics";
import { PlanSelectionUI } from "../plan/PlanSelectionUI";
import type { UniversalPlan } from "../plan/types";
import { byBonusDesc, recommendPlans } from "../lib/recommendPlans";
import type { CalculationResultV6 } from "../lib/calculator";
import { distinctBasePoints, type MultiLivePlan } from "../lib/multiLiveAdjust";
import type { FinalRunPlan } from "../lib/finalRun";
import { drawPlanCanvas } from "../../refresh/lib/planCanvas";
import { buildAdjustPlanCanvasData } from "../lib/adjustPlanCanvas";
import { planDurationSec, type TimeForBase } from "../lib/planDuration";
import { maxScoreNOf } from "../lib/constants";
import { findSameBasePlans } from "../lib/sameBaseAdjust";
import { planScoreZeroFinish } from "../lib/scoreZeroFinish";
import { candidatesForBase, resolveSong } from "./liveAdjust/musicHelpers";
import { PrimaryPlanPanel } from "./liveAdjust/PrimaryPlanPanel";
import { AdjustmentNgPanels } from "./liveAdjust/NgPanels";
import type { Adopted, SuggestMusic } from "./liveAdjust/types";

const ENVY_JACKET = `${import.meta.env.BASE_URL}MusicDatas/jacket/jacket_s_074.webp`;

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

/** Step2: ライブでの端数調整。マイセカイOFF時は複数回・楽曲自由のプランを第1候補として出す。 */
export function LiveAdjustStep({
  result,
  bonus,
  musics = [],
  aliases = [],
  finalSong,
  finalRunPlan,
}: {
  result: CalculationResultV6;
  /**
   * 現在のイベントボーナス(%)。計算結果(CalculationResultV6)自体は保持していないため
   * 親(PointAnalyzer)から渡してもらう。同一曲縛り・スコア0イベ乙の独立探索
   * （findSameBasePlans / planScoreZeroFinish）が bonus を必要とするため。
   */
  bonus: number;
  /** 曲サジェスト用の楽曲リスト。省略時はサジェストなしで動く。 */
  musics?: ReadonlyArray<SuggestMusic>;
  /** 曲検索モーダルの絞り込み用エイリアス。 */
  aliases?: AliasEntry[];
  /** ラストランの最終楽曲。画像にラストランを含めるために使う。 */
  finalSong?: SuggestMusic;
  /**
   * Step③で採択中のラストランプラン（未選択なら推奨順の先頭）。
   * 画像が「ユーザーが選んだ案」を描くために親から受け取る。
   */
  finalRunPlan?: FinalRunPlan;
}) {
  const [selectedPlan, setSelectedPlan] = useState<UniversalPlan | null>(null);
  // 採択中の複数回プラン。既定は主役（plans[0]）。plans/variants が再計算で
  // 減っても壊れないよう、参照は getAdoptedPlan 側でクランプする。
  const [adopted, setAdopted] = useState<Adopted>({ kind: "primary" });
  // 同一曲縛りトグル（P1-6）。ONのとき adopted.kind === "primary"（＝ユーザーが
  // 明示的に他案を採択していない）なら同一基礎点の独立探索結果を優先表示する。
  const [sameSongOnly, setSameSongOnly] = useState(false);
  // スコア0イベ乙トグル（既定OFF。+1本ぶんの時間コストがあるため。docs/point-adjust-score-zero-finish.md）。
  const [scoreZeroOn, setScoreZeroOn] = useState(false);
  // 基礎点ごとに「実際に叩く曲」の選択を覚える。基礎点をキーにすることで、
  // 同じ基礎点が複数ユニット・複数プランに出ても選択が引き継がれる。
  const [songByBase, setSongByBase] = useState<Record<number, string>>({});
  // 曲選択モーダルを開いている基礎点。null で閉じる。
  const [pickerBase, setPickerBase] = useState<number | null>(null);
  // 画像コピー/保存の結果表示（他ツールと同じ挙動）。
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  // PNG書き出し専用のオフスクリーンcanvas（refresh の PlanTimeline と同じパターン）。
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  // 致命傷2対応: result（＝新しい計算結果）が来るたびに採択状態を主役へ戻す。
  // result は親が再計算のたびに setResult で新しいオブジェクトを作るので、これは
  // 「再計算のたびに」に一致する（同一計算結果内での再レンダーでは発火しない）。
  // これをしないと、残額が変わった新しい結果に対して古い代替案の index が
  // 無言で横滑りする（=別の内容を「採択中」と表示し続ける）。
  // 弱点3対応: selectedPlan（第2候補側）も同じ問題を抱えていたので一緒にリセットする
  // （旧結果の UniversalPlan を保持したままだと、新結果がNGになってもNGパネルが
  // 「!selectedPlan」ガードで抑止されてしまう）。
  useEffect(() => {
    setAdopted({ kind: "primary" });
    setSelectedPlan(null);
  }, [result]);

  const live = result.liveAdjustment;
  const plans = live.adjustmentPlans ?? [];
  // 複数回プラン（曲側・第1候補）。calculator が OFF 時のみ設定するが、
  // 表示の出し分けはこのコンポーネントでも useMySekai を見て明示しておく。
  const multi = result.useMySekai === false ? live.multi : undefined;
  const reached =
    result.currentPt +
    result.mySekaiAllocation.totalPt +
    (live.status === "OK" ? live.requiredPt : 0);

  // 基礎点 → 採択曲の秒数（planDurationSec に渡す純関数）。曲が引けない/時間不明なら undefined。
  const timeForBase: TimeForBase = (basePoint) => {
    const chosen = resolveSong(candidatesForBase(musics, basePoint), songByBase, basePoint);
    return chosen && chosen.musicTime > 0 ? chosen.musicTime : undefined;
  };

  const primaryPlan = multi && multi.plans.length > 0 ? multi.plans[0] : undefined;
  const primaryDurationSec = primaryPlan ? planDurationSec(primaryPlan, timeForBase) : undefined;

  // 致命傷A根治（P1-6）: 曲データの異なり基礎点。同一曲縛り・スコア0イベ乙の
  // どちらも「基礎点ごとに独立探索する」lib API を使うため、ここで一度だけ作る。
  const distinctBases = useMemo(() => distinctBasePoints(musics), [musics]);
  const maxScoreN = maxScoreNOf(result.maxScore);

  // 同一曲縛りの独立探索（致命傷Aの根治）。表示リストのフィルタではなく、
  // 基礎点ごとに findSameBasePlans で直接解く。トグルOFFなら計算しない。
  // なおこの探索自体は28基礎点規模でも数ms程度と軽い。重いのは
  // planScoreZeroFinish 側（下記）なので、コストの注記はそちらに置いてある。
  const songLockResult = useMemo(() => {
    if (!sameSongOnly) return undefined;
    return findSameBasePlans(live.requiredPt, bonus, distinctBases, maxScoreN);
  }, [sameSongOnly, live.requiredPt, bonus, distinctBases, maxScoreN]);

  // 同一曲縛りが有効かつ解決済みなら、スコア0イベ乙の探索はまずその基礎点1つに
  // 絞って試す（「エビ詰め＋イベ乙締め」という実戦の主用途を1組み合わせで満たすため）。
  // 未解決・OFF時は undefined（＝最初から全基礎点を対象にする）。
  const lockedBasePoints = useMemo(() => {
    if (sameSongOnly && songLockResult && songLockResult.solved.length > 0) {
      return [songLockResult.solved[0].basePoint];
    }
    return undefined;
  }, [sameSongOnly, songLockResult]);

  // 致命傷C対応: 単一基礎点に絞った探索は「4本以上×3値以上」の死角
  // （sameBaseAdjust.ts の限界記述と同じ構造）に当たると偽NGになる
  // （実測: req=7,000/base108・req=13,337/base103 でロック走査NG・全基礎点OK）。
  // ロック走査がNGだったときだけ全基礎点で再試行し、無言の不適用を防ぐ。
  // ロックなし（同一曲縛りOFF）のときは最初から全基礎点で1回だけ探索する。
  const scoreZeroLockedResult = useMemo(() => {
    if (!scoreZeroOn || !lockedBasePoints) return undefined;
    return planScoreZeroFinish(live.requiredPt, bonus, lockedBasePoints, maxScoreN);
  }, [scoreZeroOn, live.requiredPt, bonus, lockedBasePoints, maxScoreN]);

  const needsFullScoreZeroScan =
    scoreZeroOn && (!lockedBasePoints || scoreZeroLockedResult?.status !== "OK");

  const scoreZeroFullResult = useMemo(() => {
    if (!needsFullScoreZeroScan) return undefined;
    return planScoreZeroFinish(live.requiredPt, bonus, distinctBases, maxScoreN);
  }, [needsFullScoreZeroScan, live.requiredPt, bonus, distinctBases, maxScoreN]);

  const scoreZeroResult =
    lockedBasePoints && scoreZeroLockedResult?.status === "OK" ? scoreZeroLockedResult : scoreZeroFullResult;

  /**
   * 採択中の複数回プランをPNGで保存する（R3-5.1）。
   * 曲・LB・スコア帯・回数・合計Pt・総回数・LB合計が画像単体で読めること。
   * canvas生成→toDataURL→ダウンロードの流れは refresh の PlanTimeline を踏襲。
   */
  const renderAdoptedPlanImage = async (chosen: MultiLivePlan) => {
    const canvas = exportCanvasRef.current;
    if (!canvas) return null;
    // 画面のユニットカラーを画像のアクセントにも使う（PlanTimeline と同じ取得方法。
    // display:none だと --unit-color が取れないブラウザがあるため canvas は画面外配置）。
    const accent =
      getComputedStyle(canvas).getPropertyValue("--unit-color").trim() || "#ff9900";
    await drawPlanCanvas(
      canvas,
      buildAdjustPlanCanvasData({
        plan: chosen,
        requiredPt: live.requiredPt,
        targetPt: result.targetPt,
        currentPt: result.currentPt,
        maxScore: result.maxScore,
        songForBase: (basePoint) => {
          // 画面の曲解決と同じ規則: 選択済みがあればそれ、なければ短い順の先頭候補。
          const picked = resolveSong(candidatesForBase(musics, basePoint), songByBase, basePoint);
          return picked
            ? { title: picked.title, jacketUrl: `${JACKET_BASE}${picked.jacketLink}` }
            : undefined;
        },
        // ラストランは別ステップだが、共有したいのは「この1枚で完結するプラン」なので同じ画像に載せる。
        finalRun:
          result.finalRunPt > 0
            ? {
                pt: result.finalRunPt,
                basePoint: result.finalBase,
                song: finalSong
                  ? { title: finalSong.title, jacketUrl: `${JACKET_BASE}${finalSong.jacketLink}` }
                  : undefined,
                plan: finalRunPlan,
                planCount: result.finalRunPlans.length,
              }
            : undefined,
        accent,
      })
    );
    return canvas;
  };

  const copyAdoptedPlanImage = async (chosen: MultiLivePlan) => {
    const canvas = await renderAdoptedPlanImage(chosen);
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setImageNotice("画像をコピーしました。");
      } catch {
        setImageNotice("コピーに失敗しました（保存をお使いください）。");
      }
    }, "image/png");
  };

  const saveAdoptedPlanImage = async (chosen: MultiLivePlan) => {
    const canvas = await renderAdoptedPlanImage(chosen);
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "adjust-plan.png";
    a.click();
  };

  // 第2候補（編成組み替え・ボーナス掃引）。ON時は従来どおりこれが唯一の表示なので
  // マークアップは一切変えず、OFF時のみ小見出しの下に降格させる（R2-5: 現編成のまま解ける案が上）。
  const secondCandidate = (
    <>
      {live.targetScoreRange && (
        <div className="mb-6 rounded-xl bg-neu p-5 text-center shadow-neu-inset">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            目標スコア範囲
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums text-slate-800 sm:text-3xl">
            {live.targetScoreRange.min.toLocaleString()}
            <span className="mx-2" style={{ color: "var(--unit-color)" }}>
              〜
            </span>
            {live.targetScoreRange.max.toLocaleString()}
          </div>
          {/* 許容するライブボーナス消費幅は計算モードで変わる（マイセカイOFF時は0〜10）ため動的に表示。 */}
          <div className="mt-1 text-xs text-slate-500">
            現在のボーナス・0〜{live.maxLiveBonus}炊きで達成可能です
          </div>
        </div>
      )}

      {plans.length > 0 && (
        <PlanSelectionUI
          plans={plans}
          recommendedPlans={recommendPlans(plans, byBonusDesc)}
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          modalTitle="ライブ調整プラン一覧"
          jacketSrc={ENVY_JACKET}
          songTitle="独りんぼエンヴィー"
        />
      )}
    </>
  );

  return (
    <StepSection
      unit="ln"
      title={multi ? "② ライブ調整" : "② ライブ調整（独りんぼエンヴィー）"}
      footerLabel="このステップ完了時"
      footerValue={reached}
    >
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-bold" style={{ color: "var(--unit-color)" }}>
          {live.requiredPt.toLocaleString()}
        </span>{" "}
        Pt を獲得します。
      </p>

      <AdjustmentNgPanels live={live} multi={multi} selectedPlan={selectedPlan} />

      {multi && multi.status === "OK" && multi.plans.length > 0 && primaryPlan && (
        <PrimaryPlanPanel
          multi={multi}
          primaryPlan={primaryPlan}
          primaryDurationSec={primaryDurationSec}
          adopted={adopted}
          onAdopt={setAdopted}
          sameSongOnly={sameSongOnly}
          onToggleSameSongOnly={() => setSameSongOnly((v) => !v)}
          songLockResult={songLockResult}
          scoreZeroOn={scoreZeroOn}
          onToggleScoreZero={() => setScoreZeroOn((v) => !v)}
          scoreZeroResult={scoreZeroResult}
          musics={musics}
          songByBase={songByBase}
          onPickSong={setPickerBase}
          timeForBase={timeForBase}
          maxScore={result.maxScore}
          finalRunPt={result.finalRunPt}
          onCopyImage={(p) => void copyAdoptedPlanImage(p)}
          onSaveImage={(p) => void saveAdoptedPlanImage(p)}
          imageNotice={imageNotice}
        />
      )}

      {multi ? (
        (live.targetScoreRange || plans.length > 0) && (
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              編成を組み替える場合（第2候補）
            </div>
            {secondCandidate}
          </div>
        )
      ) : (
        secondCandidate
      )}

      {/* 画像書き出し専用。display:none だと getComputedStyle が --unit-color を返さない
          ブラウザがあるため、レンダリングは保つ画面外配置にする（PlanTimeline と同じ）。 */}
      <canvas
        ref={exportCanvasRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px"
      />

      {pickerBase !== null && (
        <SongSearchModal
          musics={musics.filter((m) => m && m.basePoint === pickerBase)}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          title={`基礎点 ${pickerBase} の曲を選択`}
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            setSongByBase((prev) => ({ ...prev, [pickerBase]: m.id }));
            setPickerBase(null);
          }}
          onClose={() => setPickerBase(null)}
        />
      )}
    </StepSection>
  );
}
