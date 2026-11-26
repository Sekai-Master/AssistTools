import { describe, expect, it } from 'vitest'
import { HOLIDAYS_LAST_DAY, JP_HOLIDAYS, beyondHolidayList, isOffAt, offFraction } from '../src/holidays.ts'

/** JST の日時（YYYY-MM-DDTHH:MM）を epoch ミリ秒に */
const jst = (s: string) => Date.parse(`${s}:00+09:00`)

describe('holidays.ts', () => {
  it('祝日の一覧は内閣府の CSV の 2020〜2027 年（年ごとの日数も CSV と同じ）。昇順・重複なし・実在する日付', () => {
    const perYear: Record<string, number> = {}
    for (const d of JP_HOLIDAYS) perYear[d.slice(0, 4)] = (perYear[d.slice(0, 4)] ?? 0) + 1
    expect(perYear).toEqual({ 2020: 18, 2021: 17, 2022: 16, 2023: 17, 2024: 21, 2025: 19, 2026: 18, 2027: 17 })
    expect([...JP_HOLIDAYS].sort()).toEqual(JP_HOLIDAYS)
    expect(new Set(JP_HOLIDAYS).size).toBe(JP_HOLIDAYS.length)
    for (const d of JP_HOLIDAYS) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10)).toBe(d)
    }
    // 学習に使う最初のマラソン（2020-10 開始）より前から
    expect(JP_HOLIDAYS[0] <= '2020-10-01').toBe(true)
    expect(HOLIDAYS_LAST_DAY).toBe('2027-12-31')
  })

  it('土日は休み、祝日でない平日は休みでない', () => {
    expect(isOffAt(jst('2026-06-06T12:00'))).toBe(true) // 土
    expect(isOffAt(jst('2026-06-07T12:00'))).toBe(true) // 日
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']) expect(isOffAt(jst(`${d}T12:00`))).toBe(false)
  })

  it('国民の祝日・振替休日・国民の休日は休み。年末年始の祝日でない平日は休みに入れない', () => {
    expect(isOffAt(jst('2026-01-01T12:00'))).toBe(true) // 元日（木）
    expect(isOffAt(jst('2026-05-06T12:00'))).toBe(true) // 振替休日（水）
    expect(isOffAt(jst('2026-09-22T12:00'))).toBe(true) // 国民の休日（火）
    expect(isOffAt(jst('2027-03-22T12:00'))).toBe(true) // 振替休日（月）
    expect(isOffAt(jst('2026-01-02T12:00'))).toBe(false) // 金・祝日でない
    expect(isOffAt(jst('2025-12-29T12:00'))).toBe(false) // 月・祝日でない
  })

  it('日の区切りは JST の 0 時（UTC の 15 時）', () => {
    expect(isOffAt(Date.parse('2026-01-01T14:59:59Z'))).toBe(true) // JST 1/1 23:59:59（元日）
    expect(isOffAt(Date.parse('2026-01-01T15:00:00Z'))).toBe(false) // JST 1/2 0:00（金）
    expect(isOffAt(Date.parse('2026-06-05T14:59:59Z'))).toBe(false) // JST 6/5 23:59:59（金）
    expect(isOffAt(Date.parse('2026-06-05T15:00:00Z'))).toBe(true) // JST 6/6 0:00（土）
  })

  it('offFraction は区間のうち休みの日の時間の割合。JST の 0 時で切って数える', () => {
    // 金 12:00 → 土 12:00: 半分が土曜
    expect(offFraction(jst('2026-06-05T12:00'), jst('2026-06-06T12:00'))).toBeCloseTo(0.5, 12)
    // 金 18:00 → 土 06:00: 12 時間のうち 6 時間
    expect(offFraction(jst('2026-06-05T18:00'), jst('2026-06-06T06:00'))).toBeCloseTo(0.5, 12)
    // 土 0:00 → 月 0:00 は全部休み、月 0:00 → 金 0:00 は休みなし
    expect(offFraction(jst('2026-06-06T00:00'), jst('2026-06-08T00:00'))).toBe(1)
    expect(offFraction(jst('2026-06-08T00:00'), jst('2026-06-12T00:00'))).toBe(0)
    // 3 日（木 12:00 → 日 12:00）のうち、土 0:00〜日 12:00 の 36 時間
    expect(offFraction(jst('2026-06-04T12:00'), jst('2026-06-07T12:00'))).toBeCloseTo(36 / 72, 12)
    // 長さ 0 の区間は、その時刻が休みなら 1
    expect(offFraction(jst('2026-06-06T12:00'), jst('2026-06-06T12:00'))).toBe(1)
    expect(offFraction(jst('2026-06-05T12:00'), jst('2026-06-05T12:00'))).toBe(0)
    // 祝日をまたぐ（2026-11-23 月・勤労感謝の日）: 日 12:00 → 火 12:00 のうち、日の 12 時間 ＋ 月の 24 時間
    expect(offFraction(jst('2026-11-22T12:00'), jst('2026-11-24T12:00'))).toBeCloseTo(36 / 48, 12)
  })

  it('一覧の最後の日（2027-12-31）を越えたかは JST の暦日で判定する', () => {
    expect(beyondHolidayList(jst('2027-12-31T23:59'))).toBe(false)
    expect(beyondHolidayList(jst('2028-01-01T00:00'))).toBe(true)
    expect(beyondHolidayList(jst('2024-06-30T12:00'))).toBe(false)
  })

  it('一覧の後の年でも土日は休み（祝日だけが分からない）', () => {
    expect(isOffAt(jst('2028-01-01T12:00'))).toBe(true) // 土
    expect(isOffAt(jst('2028-01-04T12:00'))).toBe(false) // 火
  })
})
