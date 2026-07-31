/**
 * createRoot より前に呼ぶ初期化。
 *
 * SSR の無い SPA なので、React の初回ペイント前に html[data-motion] と
 * --stage-* を確定させないと「設定を読む前に一瞬だけ既定の演出が走る」
 * フラッシュが出る。ここで先に確定させておく。
 */
import { resolvePlan } from "./plan";
import { readMotionSetting } from "./settingsStore";
import { prefersReducedMotion } from "./useReducedMotion";

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

  const plan = resolvePlan(readMotionSetting(), prefersReducedMotion());
  const el = document.documentElement;
  el.dataset.motion = plan.level;
  el.dataset.stage = "idle";
  el.style.setProperty("--stage-sink", `${plan.sinkMs}ms`);
  el.style.setProperty("--stage-rise", `${plan.riseMs}ms`);
}
