/**
 * createRoot より前に呼ぶ初期化。
 *
 * SSR の無い SPA なので、React の初回ペイント前に html[data-motion] と
 * --stage-* を確定させないと「設定を読む前に一瞬だけ既定の演出が走る」
 * フラッシュが出る。ここで先に確定させておく。
 */
import { resolvePlan, stageVars } from "./plan";
import { readMotionSetting } from "./settingsStore";
import { readEnvironment } from "./environment";

export function bootstrapMotion(): void {
  // ブラウザ既定のスクロール復元と、遷移ステージ側の自前復元が二重にかかると
  // 位置が飛ぶので、こちらに一本化する。
  try {
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  } catch {
    // 非対応環境では諦める（ブラウザ既定のままでも致命的ではない）。
  }

  const plan = resolvePlan(readMotionSetting(), readEnvironment());
  const el = document.documentElement;
  el.dataset.motion = plan.level;
  el.dataset.stage = "idle";
  // ★ 変数の作り方は useRouteStage と同じ関数から取る。ここで手書きすると
  //   プランの形を変えたときに片方だけ古い意味のまま残る（実際に一度やった）。
  for (const [name, value] of Object.entries(stageVars(plan))) {
    el.style.setProperty(name, value);
  }
}
