/**
 * 計算に使う定数の一元管理。
 *
 * ここの値はゲーム側の仕様に対応しているので、変更するときは必ず一次情報
 * （Sekai-World/sekai-master-db-diff 等のマスタDB）で裏を取ること。
 * 大手攻略サイトの表は古い値を掲載し続けていることがあるため根拠にしない。
 */

/** スコア係数の刻み。スコアがこの値を超えるごとに係数が1上がる。 */
export const SCORE_STEP = 20000;

/**
 * スコア係数の探索上限（絶対上限）。spec.md 4.5 の「N を 0〜200 総当たり」に対応。
 * SCORE_STEP * 200 = 4,000,000 点までカバーする。
 *
 * 注意: R3 以降、実際の探索は「ユーザー設定のスコア上限」（既定 DEFAULT_MAX_SCORE）
 * から導いた maxScoreN までしか回さない。400万点はソロライブで人間に到達不能で、
 * ここまで探索すると「400万点を6回」のような実行不能プランを検証済みとして
 * 提示してしまう（docs/porting/03-analyzer.md:26 で既知だったリスクが
 * R2 の複数回モードで顕在化した）。この定数は歴史的な絶対上限として残す。
 */
export const MAX_SCORE_N = 200;

/**
 * ユーザー設定「スコア上限」の既定値。移植元 vanilla 版の既定と同じ。
 * ソロライブで現実的に狙えるスコアの上限として設定されている。
 */
export const DEFAULT_MAX_SCORE = 1_100_000;

/**
 * ユーザー設定「スコア上限」の内部クリップ。vanilla 版と同じ安全弁で、
 * 桁ミス入力（例: 30,000,000）で探索が無意味に膨らむのを防ぐ。
 */
export const MAX_SCORE_CLIP = 3_000_000;

/**
 * ユーザー入力のスコア上限を正規化する。
 * 不正値（非数・0以下）は既定値に、過大値はクリップに丸める。
 * SCORE_STEP 未満だとスコア帯が1つも探索できなくなるので下限も設ける。
 */
export function normalizeMaxScore(input: number | undefined): number {
  if (input === undefined || !Number.isFinite(input) || input <= 0) return DEFAULT_MAX_SCORE;
  return Math.min(Math.max(Math.floor(input), SCORE_STEP), MAX_SCORE_CLIP);
}

/**
 * スコア上限から探索するスコア係数の上限を導く。
 * N のスコア帯は [N*SCORE_STEP, (N+1)*SCORE_STEP-1] なので、帯の下端が
 * スコア上限以下である N まで（= floor(maxScore / SCORE_STEP)）を許す。
 */
export function maxScoreNOf(maxScore: number): number {
  return Math.min(Math.floor(maxScore / SCORE_STEP), MAX_SCORE_N);
}

/** 既定スコア上限に対応するスコア係数上限（= 55）。探索系関数の既定引数に使う。 */
export const DEFAULT_MAX_SCORE_N = maxScoreNOf(DEFAULT_MAX_SCORE);

/** 一度のライブで消費できるライブボーナスの上限。マスタDB boosts.json の costBoost 最大値。 */
export const MAX_LIVE_BONUS = 10;

/**
 * イベントボーナスの探索刻み（10倍整数表現）。5 = 0.5%。
 * ★4のマスターランク1が 12.5%、3が 17.5% のため、合計ボーナスは 0.5% 刻みを取りうる。
 * 浮動小数点の誤差を避けるため、探索は必ず10倍した整数で回すこと。
 */
export const BONUS_STEP_10X = 5;

/**
 * イベントボーナス探索の上限（10倍整数表現）。10000 = 1000%。
 *
 * 435% というハードコードを撤廃してユーザーの入力値を上限にしたが、
 * ボーナス欄に総合力の値（例 350000）を打ち間違えると探索が70万回になり
 * 数秒間UIが固まる。実効ボーナスはワールドリンクでも800%程度なので、
 * 到達しうる範囲を十分カバーしたうえで頭を抑える。
 */
export const MAX_SEARCH_BONUS_10X = 10000;

/** マイセカイ単価の総合力係数の除数。 */
export const TALENT_COEF_DIVISOR = 450000;

/** マイセカイ単価の倍率。ワールドパス所持で5倍になる。 */
export const MYSEKAI_MULTIPLIER = 100;
export const MYSEKAI_MULTIPLIER_WORLD_PASS = 500;

/** マイセカイ配分後にライブ端数調整用として残すポイント。 */
export const LIVE_ADJUST_RESERVE = 100;

/**
 * マイセカイ採取物のメモリ値（10倍整数表現）。
 * マスタDB mysekaiSiteHarvestFixtures.json の hp + lastAttackStamina を集計して確認済み。
 *   A(1.0) = 木 / 石 / 音色    B(0.5) = 地面 / 樽 / 漂着物    C(0.2) = 植物 / 工具箱 / 宝箱
 * なお誕生日の植物は 2.5 メモリでこの3分類に入らない（ツール未対応）。
 */
export const MEMORY_A_10X = 10;
export const MEMORY_B_10X = 5;
export const MEMORY_C_10X = 2;

/** 独りんぼエンヴィーの楽曲ID。基礎点100の基準曲。 */
export const ENVY_ID = "074";

/** 基礎点が取得できなかった場合のフォールバック。 */
export const DEFAULT_BASE_POINT = 100;

/**
 * 調整ライブ1本あたりの曲外オーバーヘッド秒数（曲選択 → ライブ開始 → リザルト → 戻り）。
 *
 * 2026-07-23 のイベント実戦（docs/point-adjust-step2-ux-brief.md）で実測した値。
 * マスタDBには存在しない実測定数なので、このファイル冒頭の「一次情報で裏を取る」
 * ルールの例外にあたる（裏取り先は実戦の実測ログ）。
 */
export const ADJUST_LIVE_OVERHEAD_SEC = 47;
