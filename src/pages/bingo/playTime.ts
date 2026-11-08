/**
 * 曲数を、遊ぶ時間の目安に直す。難易度は曲数で決めるが、画面では時間の方が分かりやすい。
 * チアフルカーニバルの 1 回（マッチング・曲・結果）を 4 分とみなし、10 分単位に丸める。
 */
export const MINUTES_PER_SONG = 4;

/** 例: 8 → 約30分、20 → 約1時間20分、75 → 約5時間。 */
export function playTimeText(songs: number): string {
  const minutes = Math.max(10, Math.round((songs * MINUTES_PER_SONG) / 10) * 10);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `約${m}分`;
  return m === 0 ? `約${h}時間` : `約${h}時間${m}分`;
}
