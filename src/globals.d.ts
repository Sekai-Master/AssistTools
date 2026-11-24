/**
 * ビルド時に差し込まれる定数（vite.config.ts の define）。
 *
 * ここに置く値は「ビルドした瞬間の事実」に限る。実行時に変わるものを入れると
 * 更新が反映されないバグになる。
 */

/** package.json の version。表示専用（docs/versioning.md が運用の正本）。 */
declare const __APP_VERSION__: string;

/** カード・イベントデータの生成時刻（ISO 8601）。データが無ければ空文字。 */
declare const __CARD_DATA_GENERATED_AT__: string;

/**
 * イベントバッジの除数（public/CardDatas/badgeConfig.json）。**未検証の値**で、読めなければ null。
 * 直接使わず eventBadges.ts の EVENT_ITEM_REDUCTION を通すこと。
 */
declare const __EVENT_ITEM_REDUCTION__: unknown;
