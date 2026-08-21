import { resolveColor } from "../../../lib/canvasColor";
import { useRef, useState } from "react";
import { NeuButton } from "../../../components/ui/NeuButton";
import { drawPlanCanvas } from "../../refresh/lib/planCanvas";
import {
  buildAdjustPlanCanvasData,
  type AdjustCanvasFinalRun,
  type AdjustCanvasStep2,
} from "../lib/adjustPlanCanvas";
import type { CalculationResultV6 } from "../lib/calculator";
import type { FinalRunPlan } from "../lib/finalRun";
import type { LastPlayOutcome } from "../lib/lastPlay";
import { canvasStep2FromChoice, type ModeAChoice } from "../lib/modeAChoices";
import { candidatesForBase, resolveSong } from "./liveAdjust/musicHelpers";
import { getAdoptedPlan } from "./liveAdjust/planSelection";
import type { Adopted, Step2Mode, SuggestMusic } from "./liveAdjust/types";

/** 焚き数（ライブボーナス）アイコン。UI担当の assetPaths.ts 集約待ちの間の暫定定義（R6）。 */
const LB_ICON_URL = `${import.meta.env.BASE_URL}images/LB.png`;

/**
 * Step1〜3統合画像の出力（R5 §6・R6 でデザイン刷新＋Step2消失バグ修正）。
 *
 * 出力点をここ1箇所に一本化し、「Step2だけの画像」と「統合画像」の二重管理を
 * 作らない（旧 LiveAdjustStep のコピー/保存/canvas はここへ移設した）。
 * 未実施のステップは adjustPlanCanvas 側が行を出さず自動的に詰める。
 */
export function PlanExportPanel({
  result,
  lastPlay,
  step2Mode,
  musics,
  songByBase,
  adopted,
  step2Song,
  modeAChoice,
  finalSong,
  finalPlan,
  jacketBase,
}: {
  result: CalculationResultV6;
  lastPlay: LastPlayOutcome;
  step2Mode: Step2Mode;
  musics: ReadonlyArray<SuggestMusic>;
  songByBase: Record<number, string>;
  adopted: Adopted;
  step2Song?: SuggestMusic;
  /** モードA（songFixed）の採択候補（R6 モードA選択肢提示型 §4）。既定選択込みの effective 値を渡す。 */
  modeAChoice?: ModeAChoice | null;
  finalSong?: SuggestMusic;
  finalPlan?: FinalRunPlan | null;
  jacketBase: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const buildStep2 = (): AdjustCanvasStep2 | undefined => {
    const live = result.liveAdjustment;
    if (live.requiredPt <= 0 || live.status !== "OK") return undefined;
    if (step2Mode === "songFixed") {
      // 選択候補 → 画像の詰め替えは lib 側に一本化済み（R6 モードA選択肢提示型 §4）。
      // 旧3分岐（sweepPlan固定 / targetScoreRange / multiA.plans[0]固定）は
      // effective 候補（modeAChoice）が全ケースを包含するため、選択が反映されない穴が塞がる。
      const song = step2Song
        ? {
            title: step2Song.title,
            jacketUrl: `${jacketBase}${step2Song.jacketLink}`,
          }
        : undefined;
      return modeAChoice
        ? canvasStep2FromChoice(modeAChoice, live.requiredPt, song)
        : undefined;
    }
    const multi = live.multi;
    if (!multi || multi.status !== "OK") return undefined;
    const plan = getAdoptedPlan(multi, adopted);
    if (!plan) return undefined;
    return {
      kind: "multi",
      plan,
      songForBase: (basePoint) => {
        const picked = resolveSong(
          candidatesForBase(musics, basePoint),
          songByBase,
          basePoint,
        );
        return picked
          ? {
              title: picked.title,
              jacketUrl: `${jacketBase}${picked.jacketLink}`,
            }
          : undefined;
      },
    };
  };

  const buildFinalRun = (): AdjustCanvasFinalRun | undefined => {
    if (lastPlay.mode === "none") return undefined;
    if (lastPlay.mode === "earn") {
      if (result.finalRunPt <= 0) return undefined;
      return {
        kind: "earn",
        pt: result.finalRunPt,
        basePoint: result.finalBase,
        song: finalSong
          ? {
              title: finalSong.title,
              jacketUrl: `${jacketBase}${finalSong.jacketLink}`,
            }
          : undefined,
        plan: finalPlan ?? undefined,
        planCount: result.finalRunPlans.length,
      };
    }
    if (lastPlay.status !== "OK") return undefined;
    return {
      kind: "scoreZero",
      pt: lastPlay.pt,
      finishLb: lastPlay.finishLb,
      basePoint: lastPlay.finishBase,
      song: finalSong
        ? {
            title: finalSong.title,
            jacketUrl: `${jacketBase}${finalSong.jacketLink}`,
          }
        : undefined,
    };
  };

  const render = async (): Promise<HTMLCanvasElement | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // 画面のユニットカラーを画像のアクセントにも使う（display:none だと取得できないので
    // canvas は画面外配置のまま描画は保つ）。
    // ★ ユニット色は light-dark() で書かれていて canvas が読めない。**必ず解決して渡す**
    //   （渡さないと例外も出ないまま本文の黒で描かれる。src/lib/canvasColor.ts）。
    const accent = resolveColor(canvas, "var(--unit-color)", "#ff9900");
    await drawPlanCanvas(
      canvas,
      buildAdjustPlanCanvasData({
        requiredPt: result.liveAdjustment.requiredPt,
        targetPt: result.targetPt,
        currentPt: result.currentPt,
        maxScore: result.maxScore,
        mySekai: result.useMySekai
          ? {
              countA: result.mySekaiAllocation.countA,
              countB: result.mySekaiAllocation.countB,
              countC: result.mySekaiAllocation.countC,
              totalPt: result.mySekaiAllocation.totalPt,
            }
          : undefined,
        step2: buildStep2(),
        finalRun: buildFinalRun(),
        accent,
        lbIconUrl: LB_ICON_URL,
      }),
    );
    return canvas;
  };

  const copyImage = async () => {
    const canvas = await render();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setNotice("画像をコピーしました。");
      } catch {
        setNotice("コピーに失敗しました（保存をお使いください）。");
      }
    }, "image/png");
  };

  const saveImage = async () => {
    const canvas = await render();
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "adjust-plan.png";
    a.click();
  };

  // NG（未着地）では画像を出さない（R6・破壊者弱点4対応）。目標と合計が合わない
  // 画像が無警告で共有されるのを防ぐため、canvas・コピー/保存ボタンごと出さない
  // （ボタンが無ければ render/copyImage/saveImage は呼びようがない）。
  if (!result.isVerified) {
    return (
      <div className="neu-panel p-5 sm:p-6">
        <h2 className="mb-3 text-sm font-bold text-slate-600">
          Step1〜3 統合プランの画像
        </h2>
        <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
          目標に届いていないため画像は出力できません。
        </div>
      </div>
    );
  }

  return (
    <div className="neu-panel p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-bold text-slate-600">
        Step1〜3 統合プランの画像
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <NeuButton className="!py-2 !text-sm" onClick={() => void copyImage()}>
          画像をコピー
        </NeuButton>
        <NeuButton className="!py-2 !text-sm" onClick={() => void saveImage()}>
          画像で保存
        </NeuButton>
        {notice && <span className="text-xs text-slate-500">{notice}</span>}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px"
      />
    </div>
  );
}
