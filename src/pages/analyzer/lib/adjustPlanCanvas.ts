/**
 * 採択した Step1〜3 の調整プランを共有用PNGに落とすためのデータ整形（R5 で全ステップ対応）。
 *
 * 描画本体は refresh の drawPlanCanvas を再利用する。あちらは「行の文字列は
 * UI側で整形して渡す」契約なので、ここでは各ステップを PlanCanvasRow に写像する
 * だけに徹する。画像単体で実行に必要な情報が全部読めることが要件。
 *
 * ## スキップして詰める
 *
 * 実施しないステップは行を push しない（マイセカイ totalPt===0 / Step2 なし /
 * Step3「指定しない」）。旧 finalRun の「undefined なら push しない」様式を
 * 全ステップに一般化しただけ。行数・行順・スキップは adjustPlanCanvas.test.ts で固定する。
 *
 * ## R6: 実行時に確認すべき情報を主役にする
 *
 * 依頼者フィードバック「画像作るときは目標スコア域と焚き数がめちゃくちゃ重要な情報」を受け、
 * 各行に scoreBand・lb・bonusLabel（drawPlanCanvas の強調フィールド）を積む。
 * 曲名・ジャケット・獲得Ptは補助情報として残すが、主役はスコア帯と焚き数、
 * 編成組み替え（モードA）のときはそこに目標ボーナスが加わる。
 */
import { CRYSTALS_PER_LIVE_BONUS, MAX_LIVE_BONUS } from "./constants";
import type { PlanCanvasData, PlanCanvasRow } from "../../refresh/lib/planCanvas";
import type { MultiLivePlan } from "./multiLiveAdjust";
import { ADJUST_LIVE_BONUSES, type AdjustmentPlan } from "./liveAdjust";
import type { FinalRunPlan } from "./finalRun";
import { calcLivePt } from "./calcLivePt";

/** マイセカイ不使用モードで調整ライブに許すLB（0〜10）。calculator.ts の同名ローカルの鏡。 */
const NO_MYSEKAI_LIVE_BONUSES: readonly number[] = Array.from(
  { length: MAX_LIVE_BONUS + 1 },
  (_, i) => i
);

/**
 * 「現在ボーナスのまま単発で着地」（liveAdjust.ts 5.1）の締めLBを逆引きする。
 *
 * LiveAdjustResult は targetScoreRange しか持たず、どのLBで着地したかを型に
 * 持たせていない（凍結テスト liveAdjust.test.ts 保護のため型を増やさない迂回）。
 * 表示側だけがここで calcLivePt を使って再計算する。liveBonuses の並び順
 * （ON:[0,1] / OFF:[0..10]）で5.1と同じ優先順位を再現する。
 */
export function deriveCurrentLb(
  base: number,
  bonus: number,
  requiredPt: number,
  scoreMin: number,
  useMySekai: boolean
): number | undefined {
  const liveBonuses = useMySekai ? ADJUST_LIVE_BONUSES : NO_MYSEKAI_LIVE_BONUSES;
  for (const lb of liveBonuses) {
    if (calcLivePt(base, bonus, scoreMin, lb) === requiredPt) return lb;
  }
  return undefined;
}

/** 行に描く「実際に叩く曲」。未選択（該当曲なし）のユニットは undefined を渡す。 */
export interface AdjustCanvasSong {
  title: string;
  /** ジャケット画像のフルURL。読み込み失敗は drawPlanCanvas 側が無視する。 */
  jacketUrl: string;
}

/** Step1（マイセカイ採取）。totalPt===0 なら行を出さない（スキップ＝詰め）。 */
export interface AdjustCanvasMySekai {
  countA: number;
  countB: number;
  countC: number;
  totalPt: number;
}

/**
 * Step2（ライブ調整）。2モードのどちらか。undefined なら liveRequired===0 で行なし。
 *   multi = B（曲可変・複数回）: 各ユニットを1行ずつ写す。モードA複数回化（multiA）の
 *           採択プランもこの形で流し込む（units の bonus? が付けば目標ボーナス表示になる）。
 *   sweep = A（曲固定・ボーナス掃引）: 1行「調整ライブ ×n炊き / 目標ボーナスX%・スコア帯」。
 */
export type AdjustCanvasStep2 =
  | {
      kind: "multi";
      plan: MultiLivePlan;
      /** 基礎点 → 選択中の曲。songByBase 解決結果をそのまま渡す。 */
      songForBase: (basePoint: number) => AdjustCanvasSong | undefined;
    }
  | {
      kind: "sweep";
      /**
       * 掃引（編成組み替え）で選んだプラン。undefined は「編成そのままのボーナスで
       * 単発着地できる」ケース（R6 バグ修正: 従来はここで sweepPlan=null として
       * 行ごと消していた）。そのときは current を見る。
       */
      plan?: AdjustmentPlan;
      /** このモードAが1本で埋める必要Pt（= liveRequired）。 */
      requiredPt: number;
      song?: AdjustCanvasSong;
      /** plan が undefined のときの表示用（現在ボーナスのまま着地）。 */
      current?: { scoreRange: { min: number; max: number }; lb?: number };
    };

/**
 * Step3（ラストプレイ）。undefined なら「指定しない」で行なし。
 *   earn      = 希望Ptを稼ぐ（従来のラストラン）。
 *   scoreZero = スコア0で締める（叩かない）。
 */
export type AdjustCanvasFinalRun =
  | {
      kind: "earn";
      /** 獲得Pt（result.finalRunPt）。 */
      pt: number;
      /** 最終楽曲の基礎点（result.finalBase）。 */
      basePoint: number;
      song?: AdjustCanvasSong;
      /** 提示中の代表プラン（先頭）。無ければ帯を出さない。 */
      plan?: FinalRunPlan;
      /** 候補プランの総数。「他N件」を添えるために使う。 */
      planCount: number;
    }
  | {
      kind: "scoreZero";
      /** 締めの獲得Pt（自動算出）。 */
      pt: number;
      /** 締めに使ったライブボーナス（叩かないので純コスト表示用）。 */
      finishLb: number;
      /** 締め曲の基礎点。 */
      basePoint: number;
      song?: AdjustCanvasSong;
    };

/** Step1 行（マイセカイ採取）。ジャケットなし。採取はライブではないので回数に数えない。 */
function mySekaiRow(m: AdjustCanvasMySekai): PlanCanvasRow | undefined {
  if (m.totalPt <= 0) return undefined; // スキップ＝詰め
  const count = m.countA + m.countB + m.countC;
  return {
    time: `採取 ${count.toLocaleString()}個`,
    label: "マイセカイ採取",
    sub: `木石 ${m.countA}・キラキラ ${m.countB}・草花 ${m.countC}`,
    percent: `+${m.totalPt.toLocaleString()} Pt`,
    warn: false,
  };
}

/**
 * B（multi）: 各ユニットを1行ずつ。モードA複数回化（multiA）の採択プランも同じ形で通す。
 * u.bonus が付く（モードA経路）ときは目標ボーナスを bonusLabel に昇格させる。
 */
function multiRows(
  plan: MultiLivePlan,
  songForBase: (basePoint: number) => AdjustCanvasSong | undefined
): PlanCanvasRow[] {
  return plan.units.map((u) => {
    const song = songForBase(u.basePoint);
    return {
      time: `${u.count}回 × ${u.liveBonus}炊き`,
      label: song ? `${song.title}（基礎点${u.basePoint}）` : `基礎点${u.basePoint}の曲（候補なし）`,
      sub: `1回 ${u.pt.toLocaleString()} Pt`,
      percent: `+${(u.pt * u.count).toLocaleString()} Pt`,
      warn: false,
      jacket: song?.jacketUrl,
      scoreBand: { min: u.minScore, max: u.maxScore },
      lb: u.liveBonus,
      ...(u.bonus !== undefined ? { bonusLabel: `目標ボーナス ${u.bonus}%` } : {}),
    };
  });
}

/**
 * A（sweep）: 目標スコア帯・焚き数・目標ボーナスを主役に1行で描く。
 * plan があれば「編成組み替え」案、無ければ current の「編成そのまま」案
 * （R6 バグ修正: 従来はこのケースで行自体が消えていた）。
 */
function sweepRow(step2: Extract<AdjustCanvasStep2, { kind: "sweep" }>): PlanCanvasRow {
  const { plan, requiredPt, song, current } = step2;
  if (plan) {
    return {
      time: `調整ライブ × ${plan.liveBonus}炊き`,
      label: song ? `${song.title}（調整）` : "調整ライブ",
      sub: `目標ボーナス ${plan.bonus}%`,
      percent: `+${requiredPt.toLocaleString()} Pt`,
      warn: false,
      jacket: song?.jacketUrl,
      scoreBand: { min: plan.minScore, max: plan.maxScore },
      lb: plan.liveBonus,
      bonusLabel: `目標ボーナス ${plan.bonus}%`,
    };
  }
  return {
    time: current?.lb !== undefined ? `調整ライブ × ${current.lb}炊き` : "調整ライブ",
    label: song ? `${song.title}（編成そのまま）` : "調整ライブ（編成そのまま）",
    percent: `+${requiredPt.toLocaleString()} Pt`,
    warn: false,
    jacket: song?.jacketUrl,
    scoreBand: current?.scoreRange,
    lb: current?.lb,
  };
}

function step2Rows(step2: AdjustCanvasStep2 | undefined): PlanCanvasRow[] {
  if (!step2) return [];
  return step2.kind === "multi" ? multiRows(step2.plan, step2.songForBase) : [sweepRow(step2)];
}

/**
 * Step3 行。scoreZero は「叩かない」ことが本質なのでスコア帯は出さず、焚き数（純コスト）だけ載せる。
 * earn は目標スコア帯・焚き数・ボーナスを主役にする（他の Step2 行と統一）。
 */
function finalRunRow(fr: AdjustCanvasFinalRun): PlanCanvasRow {
  if (fr.kind === "scoreZero") {
    return {
      time: `ラストプレイ × ${fr.finishLb}炊き`,
      label: "叩かずにクリア（スコア0）",
      sub: fr.song ? `${fr.song.title}（基礎点${fr.basePoint}）` : `基礎点${fr.basePoint}の曲`,
      percent: `+${fr.pt.toLocaleString()} Pt`,
      warn: false,
      jacket: fr.song?.jacketUrl,
      lb: fr.finishLb,
    };
  }
  const p = fr.plan;
  const rest = fr.planCount - 1;
  return {
    time: p ? `ラストプレイ × ${p.liveBonus}炊き` : "ラストプレイ",
    label: fr.song ? `${fr.song.title}（基礎点${fr.basePoint}）` : `基礎点${fr.basePoint}の曲`,
    sub: p ? (rest > 0 ? `（他${rest}案）` : undefined) : "条件を満たすプランが見つかりませんでした",
    percent: `+${fr.pt.toLocaleString()} Pt`,
    warn: !p,
    jacket: fr.song?.jacketUrl,
    scoreBand: p ? { min: p.minScore, max: p.maxScore } : undefined,
    lb: p?.liveBonus,
    ...(p ? { bonusLabel: `ボーナス${p.bonus}%` } : {}),
  };
}

/** 各ステップの (Pt, ライブ回数, LB) 寄与。スキップしたステップは 0。 */
function contributions(
  mySekai: AdjustCanvasMySekai | undefined,
  step2: AdjustCanvasStep2 | undefined,
  finalRun: AdjustCanvasFinalRun | undefined
): { totalPt: number; totalLives: number; totalLb: number } {
  const mySekaiPt = mySekai && mySekai.totalPt > 0 ? mySekai.totalPt : 0;
  const step2Pt = step2 ? (step2.kind === "multi" ? step2.plan.totalPt : step2.requiredPt) : 0;
  const step2Lives = step2 ? (step2.kind === "multi" ? step2.plan.liveCount : 1) : 0;
  // sweep は plan（編成組み替え）か current（編成そのまま）のどちらかにLBがある。
  const step2Lb = step2
    ? step2.kind === "multi"
      ? step2.plan.lbCost
      : (step2.plan?.liveBonus ?? step2.current?.lb ?? 0)
    : 0;
  const finalPt = finalRun?.pt ?? 0;
  const finalLb = finalRun
    ? finalRun.kind === "earn"
      ? finalRun.plan?.liveBonus ?? 0
      : finalRun.finishLb
    : 0;
  return {
    totalPt: mySekaiPt + step2Pt + finalPt,
    // マイセカイ採取はライブではないので回数に数えない。
    totalLives: step2Lives + (finalRun ? 1 : 0),
    totalLb: step2Lb + finalLb,
  };
}

export function buildAdjustPlanCanvasData(args: {
  /** ライブ調整で埋める必要ポイント（liveAdjustment.requiredPt）。 */
  requiredPt: number;
  /** 着地させる目標ポイント（result.targetPt）。画像の主役。 */
  targetPt: number;
  /** 起点の現在ポイント（result.currentPt）。 */
  currentPt: number;
  /** 正規化済みのスコア上限（result.maxScore）。 */
  maxScore: number;
  /** Step1（マイセカイ）。省略・totalPt0 なら行なし。 */
  mySekai?: AdjustCanvasMySekai;
  /** Step2（ライブ調整）。省略なら行なし。 */
  step2?: AdjustCanvasStep2;
  /** Step3（ラストプレイ）。省略なら行なし。 */
  finalRun?: AdjustCanvasFinalRun;
  accent: string;
  /** 焚き数アイコン（LB.png）のURL。省略時はアイコンなしで「×n」の数字だけ描く。 */
  lbIconUrl?: string;
}): PlanCanvasData {
  const { requiredPt, targetPt, currentPt, maxScore, mySekai, step2, finalRun, accent, lbIconUrl } = args;

  // スキップして詰める: 実施したステップの行だけを順に積む。
  const rows: PlanCanvasRow[] = [];
  const s1 = mySekai ? mySekaiRow(mySekai) : undefined;
  if (s1) rows.push(s1);
  rows.push(...step2Rows(step2));
  if (finalRun) rows.push(finalRunRow(finalRun));

  const { totalPt, totalLives, totalLb } = contributions(mySekai, step2, finalRun);

  return {
    heading: "ポイント調整プラン",
    songTitle: `目標 ${targetPt.toLocaleString()} Pt`,
    // meta は2行までしか入らない（HEADER_H の都合）。詰め込みすぎない。
    meta: [
      `現在 ${currentPt.toLocaleString()} → 差分 ${(targetPt - currentPt).toLocaleString()} Pt`,
      finalRun
        ? `調整 ${requiredPt.toLocaleString()} ＋ ラストプレイ ${(finalRun.pt).toLocaleString()} ・ スコア上限 ${maxScore.toLocaleString()}`
        : `調整 ${requiredPt.toLocaleString()} Pt ・ スコア上限 ${maxScore.toLocaleString()}`,
    ],
    rows,
    summary: [
      { label: "合計獲得", value: `${totalPt.toLocaleString()} Pt` },
      { label: "総ライブ回数", value: `${totalLives}回` },
      // 回復時間（約Nh）は削除（判断材料にならない）。クリスタル換算だけ残す。
      { label: "LB合計", value: `${totalLb}（クリスタル約${totalLb * CRYSTALS_PER_LIVE_BONUS}個）` },
    ],
    accent,
    footer: "Sekai-Master / ポイント調整アナライザー",
    // 「+470,000 Pt」級の累積Ptを右カラムに出すため既定72pxでは足りない。
    rightColW: 110,
    lbIconUrl,
  };
}
