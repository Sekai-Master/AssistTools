import { describe, expect, it } from 'vitest'
import { upsertEvents } from '../src/db.ts'
import { ANALYSIS_WORKFLOW, SCHEDULE_WORKFLOW, analysisSlotStart, dispatchWorkflow, runAnalysisDispatch, runScheduleDispatch } from '../src/dispatch.ts'
import type { Env } from '../src/env.ts'
import type { EventMeta } from '../src/model.ts'
import { createD1 } from './d1shim.ts'

const M = 60_000
const H = 60 * M
/** 10/31 22:45（日本時間）＝ 13:45 UTC。解析ジョブの夜の起動の時刻 */
const NIGHT = Date.UTC(2026, 9, 31, 13, 45, 20)
/** 11/1 0:00（日本時間）＝ 10/31 15:00 UTC。毎時0〜4分の見回り */
const HOURLY = Date.UTC(2026, 9, 31, 15, 0, 20)

const event = (id: number, startAt: number, hours: number): EventMeta => ({
  id,
  name: `イベント${id}`,
  eventType: 'marathon',
  unit: 'none',
  startAt,
  aggregateAt: startAt + hours * H - 1000,
  asset: `event_test_${id}`,
})

function envOf(token: string | null = 'ghtok') {
  const env: Env = { DB: createD1(), SITE_ORIGIN: 'https://site.example', ADMIN_TOKEN: 'tok', GITHUB_DISPATCH_TOKEN: token ?? undefined }
  return env
}

function fetcherOf(status = 204, body = '') {
  const calls: { url: string; method: string | undefined; auth: string | null; accept: string | null; version: string | null; ua: string | null; body: unknown }[] = []
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    calls.push({
      url: String(url),
      method: init?.method,
      auth: h.get('Authorization'),
      accept: h.get('Accept'),
      version: h.get('X-GitHub-Api-Version'),
      ua: h.get('User-Agent'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })
    return new Response(status === 204 ? null : body, { status })
  }) as typeof fetch
  return { f, calls }
}

describe('解析ジョブの起動の時間帯（analysisSlotStart）', () => {
  it('22:45・10:45（日本時間）から15分のうちだけ、その時間帯の始まりを返す', () => {
    expect(analysisSlotStart(Date.UTC(2026, 9, 31, 13, 45))).toBe(Date.UTC(2026, 9, 31, 13, 45))
    expect(analysisSlotStart(Date.UTC(2026, 9, 31, 13, 59, 59))).toBe(Date.UTC(2026, 9, 31, 13, 45))
    expect(analysisSlotStart(Date.UTC(2026, 9, 31, 1, 50))).toBe(Date.UTC(2026, 9, 31, 1, 45))
    expect(analysisSlotStart(Date.UTC(2026, 9, 31, 13, 44, 59))).toBeNull()
    expect(analysisSlotStart(Date.UTC(2026, 9, 31, 14, 0))).toBeNull()
    expect(analysisSlotStart(HOURLY)).toBeNull()
  })
})

describe('workflow_dispatch を投げる（dispatchWorkflow）', () => {
  it('AssistTools の main を起動する。204 なら成功', async () => {
    const net = fetcherOf()
    expect(await dispatchWorkflow('ghtok', ANALYSIS_WORKFLOW, net.f)).toBeNull()
    expect(net.calls).toEqual([
      {
        url: 'https://api.github.com/repos/Sekai-Master/AssistTools/actions/workflows/border-analysis.yml/dispatches',
        method: 'POST',
        auth: 'Bearer ghtok',
        // GitHub の API は User-Agent が無いと 403 を返す
        accept: 'application/vnd.github+json',
        version: '2022-11-28',
        ua: 'sekaimaster-border/1.0 (+https://sekaimaster.pages.dev)',
        body: { ref: 'main' },
      },
    ])
  })

  it('失敗の応答・通信の失敗は理由を返す（投げない）', async () => {
    expect(await dispatchWorkflow('ghtok', ANALYSIS_WORKFLOW, fetcherOf(403, '{"message":"Resource not accessible"}').f)).toBe(
      'border-analysis.yml の起動が 403（{"message":"Resource not accessible"}）',
    )
    const down = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    expect(await dispatchWorkflow('ghtok', ANALYSIS_WORKFLOW, down)).toBe('border-analysis.yml を起動できなかった（network down）')
  })
})

describe('解析ジョブを起動する（runAnalysisDispatch）', () => {
  it('時間帯の最初の見回りで1回だけ起動し、同じ時間帯の次の見回りでは起動しない', async () => {
    const env = envOf()
    const net = fetcherOf()
    expect(await runAnalysisDispatch(env, NIGHT, net.f)).toEqual({ status: 'dispatched', workflow: ANALYSIS_WORKFLOW })
    expect(await runAnalysisDispatch(env, NIGHT + 5 * M, net.f)).toEqual({ status: 'idle' })
    expect(net.calls).toHaveLength(1)
    // 翌朝の時間帯ではまた起動する
    expect(await runAnalysisDispatch(env, NIGHT + 12 * H, net.f)).toEqual({ status: 'dispatched', workflow: ANALYSIS_WORKFLOW })
    expect(net.calls).toHaveLength(2)
  })

  it('起動に失敗したら残さず、同じ時間帯の次の見回りでもう一度起動する', async () => {
    const env = envOf()
    expect(await runAnalysisDispatch(env, NIGHT, fetcherOf(502, 'bad gateway').f)).toEqual({ status: 'skip', reason: 'border-analysis.yml の起動が 502（bad gateway）' })
    const net = fetcherOf()
    expect(await runAnalysisDispatch(env, NIGHT + 5 * M, net.f)).toEqual({ status: 'dispatched', workflow: ANALYSIS_WORKFLOW })
  })

  it('時間帯の外は何もしない（D1 も読まない）。鍵が無ければ起動しない', async () => {
    // D1 に触ったら落ちる env（ふだんの見回りで D1 を読まないことの確認。CPU 10ms の枠）
    const noDb = { ...envOf(), DB: new Proxy({} as D1Database, { get: () => { throw new Error('D1 を読んだ') } }) }
    const net = fetcherOf()
    expect(await runAnalysisDispatch(noDb, HOURLY, net.f)).toEqual({ status: 'idle' })
    expect(await runScheduleDispatch(noDb, HOURLY + 5 * M, net.f)).toEqual({ status: 'idle' })
    expect(await runAnalysisDispatch(envOf(null), NIGHT, net.f)).toEqual({ status: 'skip', reason: 'GITHUB_DISPATCH_TOKEN が無い' })
    expect(net.calls).toHaveLength(0)
  })
})

describe('日程の取り込みを起動する（runScheduleDispatch）', () => {
  it('これから始まる回が events に無く、開催もしていなければ、毎時0〜4分に起動する', async () => {
    const env = envOf()
    // 222 は 10/30 20:59（日本時間）に終わった。223 はまだ events に無い（10/31 の実際の状態）
    await upsertEvents(env.DB, [event(222, Date.UTC(2026, 9, 26, 6), 102)])
    const net = fetcherOf()
    expect(await runScheduleDispatch(env, HOURLY, net.f)).toEqual({ status: 'dispatched', workflow: SCHEDULE_WORKFLOW })
    expect(net.calls[0].url).toBe('https://api.github.com/repos/Sekai-Master/AssistTools/actions/workflows/border-schedule.yml/dispatches')
    // 毎時5分以降は起動しない
    expect(await runScheduleDispatch(env, HOURLY + 5 * M, net.f)).toEqual({ status: 'idle' })
    expect(net.calls).toHaveLength(1)
  })

  it('これから始まる回が events に入ったら止まる', async () => {
    const env = envOf()
    await upsertEvents(env.DB, [event(222, Date.UTC(2026, 9, 26, 6), 102), event(223, Date.UTC(2026, 9, 31, 6), 198)])
    const net = fetcherOf()
    expect(await runScheduleDispatch(env, Date.UTC(2026, 9, 31, 3, 0, 20), net.f)).toEqual({ status: 'idle' })
    expect(net.calls).toHaveLength(0)
  })

  it('開催中は終了まで24時間を切ってから起動する', async () => {
    const env = envOf()
    const start = Date.UTC(2026, 9, 31, 6)
    await upsertEvents(env.DB, [event(223, start, 198)])
    const end = start + 198 * H
    const net = fetcherOf()
    expect(await runScheduleDispatch(env, end - 30 * H + 20_000, net.f)).toEqual({ status: 'idle' })
    expect(await runScheduleDispatch(env, end - 23 * H + 20_000, net.f)).toEqual({ status: 'dispatched', workflow: SCHEDULE_WORKFLOW })
  })

  it('鍵が無ければ起動しない', async () => {
    const env = envOf(null)
    const net = fetcherOf()
    expect(await runScheduleDispatch(env, HOURLY, net.f)).toEqual({ status: 'skip', reason: 'GITHUB_DISPATCH_TOKEN が無い' })
    expect(net.calls).toHaveLength(0)
  })
})
