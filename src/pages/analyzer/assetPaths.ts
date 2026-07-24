/**
 * 画像アセットの基底パス（R6 §6-4）。
 *
 * JACKET_BASE は PointAnalyzer.tsx と UnitLine.tsx に同じ定義がそれぞれ書かれていた
 * （重複定義）。LB_ICON_URL は統合画像出力（画像担当の adjustPlanCanvas.ts /
 * PlanExportPanel.tsx）が使う定数で、UI側が最初にここへ置いて import させる
 * （R6設計 §7 の分担どおり境界ファイルはUI担当が先に作る）。
 */
export const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;
export const LB_ICON_URL = `${import.meta.env.BASE_URL}images/LB.png`;
