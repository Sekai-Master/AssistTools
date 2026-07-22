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
 * スコア係数の探索上限。spec.md 4.5 の「N を 0〜200 総当たり」に対応。
 * SCORE_STEP * 200 = 4,000,000 点までカバーする。
 */
export const MAX_SCORE_N = 200;

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
