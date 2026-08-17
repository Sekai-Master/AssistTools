import type { Fixture } from "./types";

/**
 * 家具サムネイルの URL。
 *
 * ★ 画像は**自前配信**（public/MysekaiDatas/thumb/）。配信元は Referer 付きの要求を
 *   403 で弾く設定になっており、そこを迂回しない方針のため、取得スクリプトが
 *   ビルド時に落として webp へ揃えている（立ち絵・イベントロゴと同じ扱い）。
 *
 * ★ BASE_URL 起点にする（サブパス配信でも壊れない）。
 */
export function thumbUrl(fixture: Pick<Fixture, "image">): string | null {
  if (!fixture.image) return null;
  return `${import.meta.env.BASE_URL}MysekaiDatas/thumb/${fixture.image}.webp`;
}
