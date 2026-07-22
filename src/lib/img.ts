import type { SyntheticEvent } from "react";

/**
 * ジャケット画像が 404 等で読めないときのフォールバック。
 * 無限ループを防ぐため onerror を一度で解除し、中立なプレースホルダ
 * （薄いグレーの正方形）に差し替える。壊れた画像アイコンを見せない。
 */
const JACKET_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e2e2e2"/></svg>'
  );

export function onJacketError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  if (img.src === JACKET_PLACEHOLDER) return;
  img.onerror = null;
  img.src = JACKET_PLACEHOLDER;
}
