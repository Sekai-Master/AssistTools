/** リフレッシュゲージ計算機の表示整形ヘルパ。 */

/** 分 → 「X時間Y分」/「Y分」。 */
export function fmtDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

/** 現在時刻付近の切りのいい時刻（最寄りの15分）を "HH:MM" で返す。 */
export function nearestRoundTime(): string {
  const d = new Date();
  const mins = Math.round((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
  const t = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** "HH:MM" → その日の分。不正なら null。 */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 開始時刻(その日の分, null可) + 相対分 → "HH:MM"（翌日以降は (+Nd) 付き）。
 * 開始時刻が無ければ「+X分」表記。
 */
export function fmtClock(startMinOfDay: number | null, relMinutes: number): string {
  if (startMinOfDay === null) return `+${Math.round(relMinutes)}分`;
  const total = startMinOfDay + Math.round(relMinutes);
  const dayOffset = Math.floor(total / 1440);
  const t = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(t / 60)).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  return dayOffset > 0 ? `${hh}:${mm} (+${dayOffset}d)` : `${hh}:${mm}`;
}
