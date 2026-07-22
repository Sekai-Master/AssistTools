/**
 * リフレッシュ定数の解決。
 *
 * 定数は music_time から一意に出ない（オフセットが曲ごとに6〜9でブレる）。
 * 唯一の厳密アンカーは基礎点で、`基礎点 = floor((定数+267)/3.5)` の逆から
 * 3〜4値のレンジが出る。既定はレンジ中央値、実測が取れた曲だけ上書きする。
 * 根拠は docs/refresh-gauge/measurements.md。
 */

/** 基礎点 → リフレッシュ定数のレンジ [lo, hi]（両端含む）。 */
export function constantRange(basePoint: number): [number, number] {
  const lo = Math.ceil(3.5 * basePoint - 267);
  const hi = Math.floor(3.5 * (basePoint + 1) - 267 - 1e-9);
  return [lo, hi];
}

/** レンジ中央値（既定推定。±1〜2定数の誤差を含む）。 */
export function constantFromBasePoint(basePoint: number): number {
  const [lo, hi] = constantRange(basePoint);
  return Math.round((lo + hi) / 2);
}

/**
 * 実機計測で確定したリフレッシュ定数（曲ID → 定数）。基礎点中央値より優先。
 * 追加時は measurements.md にも計測根拠を残すこと。
 */
export const MEASURED_CONSTANTS: Record<string, number> = {
  "074": 84, // 独りんぼエンヴィー（連続計測＋記事一致）
  "141": 108, // 群青讃歌（記事）
  "104": 127, // サンドリヨン 10th Anniversary（記事）
  "186": 191, // 初音天地開闢神話（記事）
};

/** 曲の定数を得る。実測があれば優先、無ければ基礎点中央値。 */
export function getRefreshConstant(basePoint: number, id?: string): number {
  if (id && MEASURED_CONSTANTS[id] !== undefined) return MEASURED_CONSTANTS[id];
  return constantFromBasePoint(basePoint);
}

/** 定数が実測由来か（UIで精度バッジを出すため）。 */
export function isMeasured(id?: string): boolean {
  return !!id && MEASURED_CONSTANTS[id] !== undefined;
}
