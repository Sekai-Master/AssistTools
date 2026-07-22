import type { SyntheticEvent } from "react";

/**
 * ジャケット画像が 404 等で読めないときのフォールバック。
 * 中立なプレースホルダ（薄いグレーの正方形）に差し替え、壊れた画像アイコンを見せない。
 * プレースホルダ自体は必ずロードできる inline SVG なので再発火しないが、万一に備え
 * 既にプレースホルダなら早期 return して無限差し替えを防ぐ（React の合成 onError は
 * DOM の onerror プロパティを使わないため、その解除ではなくこの src 等価判定で守る）。
 */
const JACKET_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e2e2e2"/></svg>'
  );

export function onJacketError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  if (img.src === JACKET_PLACEHOLDER) return;
  img.src = JACKET_PLACEHOLDER;
}
