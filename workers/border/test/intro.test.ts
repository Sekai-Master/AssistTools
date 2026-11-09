import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGES } from '../../../src/seo.ts'
import { unsentPosts, upsertEvents } from '../src/db.ts'
import type { Env } from '../src/env.ts'
import {
  INTRO_ALT_MAX,
  INTRO_GAP_DAYS,
  INTRO_TEXT_MAX_WEIGHT,
  introIdPrefix,
  introPhaseOf,
  introSlotOf,
  parseIntros,
  pickIntro,
  pickIntroFor,
  runIntro,
} from '../src/intro.ts'
import type { EventMeta } from '../src/model.ts'
import { createD1 } from './d1shim.ts'

const H = 3_600_000
const M = 60_000
const DAY = 24 * H
const SITE = 'https://sekaimaster.pages.dev'
/** 日本時間の y/mo/d h:mi（UTC の ms） */
const jst = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * H

/** 本物の 223（いつかの君へ、旋律を）: 開始 10/31 15:00、集計 11/8 20:59:59 */
const EV223: EventMeta = {
  id: 223,
  name: 'いつかの君へ、旋律を',
  eventType: 'marathon',
  unit: 'none',
  startAt: jst(2026, 10, 31, 15),
  aggregateAt: jst(2026, 11, 8, 20, 59) + 59_000,
  asset: 'event_someday_2026',
}
/** 本物の 222（MORE MORE JUMP！ Memories）: 開始 10/26 15:00、集計 10/30 20:59:59 */
const EV222: EventMeta = {
  id: 222,
  name: 'MORE MORE JUMP！ Memories',
  eventType: 'marathon',
  unit: 'mmj',
  startAt: jst(2026, 10, 26, 15),
  aggregateAt: jst(2026, 10, 30, 20, 59) + 59_000,
  asset: 'event_memories_mmj_2026',
}
const GACHA_223 = jst(2026, 10, 31, 12)
const RUNNING_223 = jst(2026, 11, 1, 12)

const entry = (slug: string, phase?: unknown, files = ['p1.png', 'p2.png']) => ({
  slug,
  ...(phase === undefined ? {} : { phase }),
  text: `【機能紹介】${slug}\n\nhttps://sekaimaster.pages.dev/${slug}\n#プロセカ`,
  images: files.map((file) => ({ file, alt: `${slug} ${file}` })),
})
const CATALOG = {
  intros: [entry('analyzer', 'running', ['p1.png', 'p2.png', 'p3.png', 'p4.png']), entry('deck', 'gacha'), entry('tweet', 'running'), entry('compare', 'gacha')],
}

function setup(catalog: unknown = CATALOG, status = 200) {
  const env: Env = { DB: createD1(), SITE_ORIGIN: SITE, ADMIN_TOKEN: 'tok' }
  const calls: string[] = []
  const fetcher = (async (url: string) => {
    calls.push(String(url))
    return new Response(JSON.stringify(catalog), { status })
  }) as unknown as typeof fetch
  return { env, calls, fetcher }
}

/** 前に出した紹介（X にも出し終えた行）を入れておく。2026-11-09 までの水曜の行と同じく event_id は 0 が既定 */
async function seedIntro(env: Env, id: string, eventId = 0) {
  await env.DB.prepare('INSERT INTO posts (id, event_id, kind, text, created_at, sent_x_at, sent_discord_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)')
    .bind(id, eventId, 'intro', 'x', 0)
    .run()
}

/** D1 に流した SELECT を数える（★ CPU 10ms の枠: 見回り1回で引く回数） */
function countSelects(env: Env): string[] {
  const sqls: string[] = []
  const db = env.DB
  env.DB = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare')
        return (sql: string) => {
          if (/^\s*SELECT/i.test(sql)) sqls.push(sql)
          return target.prepare(sql)
        }
      const v = Reflect.get(target, prop, receiver) as unknown
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
    },
  })
  return sqls
}

/** from から until まで5分ごとに見回り、積んだ id を返す */
async function patrol(env: Env, fetcher: typeof fetch, from: number, until: number): Promise<string[]> {
  const ids: string[] = []
  for (let t = from; t < until; t += 5 * M) {
    const r = await runIntro(env, t, fetcher)
    if (r.status === 'queued') ids.push(r.id)
  }
  return ids
}

describe('積む時間帯（introSlotOf）', () => {
  it('曜日によらず毎日 11:00〜11:59 は、その日の 12:00 を返す', () => {
    for (let d = 0; d < 7; d++) {
      const noon = GACHA_223 + d * DAY
      expect(introSlotOf(noon - H)).toBe(noon)
      expect(introSlotOf(noon - 5 * M)).toBe(noon)
    }
  })
  it('11:00 より前・12:00 ちょうど以降は null', () => {
    expect(introSlotOf(GACHA_223 - H - 1)).toBeNull()
    expect(introSlotOf(GACHA_223)).toBeNull()
    expect(introSlotOf(GACHA_223 + 30 * M)).toBeNull()
    expect(introSlotOf(GACHA_223 - 12 * H)).toBeNull()
  })
  it('id の頭は日本時間の日付', () => {
    expect(introIdPrefix(GACHA_223)).toBe('intro:2026-10-31:')
  })
})

describe('イベントの段（introPhaseOf）', () => {
  it('マラソン（15:00 開始）: 開始日の 12:00 が gacha、翌日の 12:00 が running、ほかの日は無い', () => {
    expect(introPhaseOf(EV223, GACHA_223)).toBe('gacha')
    expect(introPhaseOf(EV223, RUNNING_223)).toBe('running')
    expect(introPhaseOf(EV223, GACHA_223 - DAY)).toBeNull()
    expect(introPhaseOf(EV223, GACHA_223 + 2 * DAY)).toBeNull()
    // 集計日の前日（lastday）は使わない（日報が受け持つ）
    expect(introPhaseOf(EV223, jst(2026, 11, 7, 12))).toBeNull()
  })
  it('ワールドリンク（20:00 開始）もガチャは開始日の 12:00', () => {
    const wl = { startAt: jst(2026, 8, 17, 20), aggregateAt: jst(2026, 8, 27, 19, 59) + 59_000 }
    expect(introPhaseOf(wl, jst(2026, 8, 17, 12))).toBe('gacha')
    expect(introPhaseOf(wl, jst(2026, 8, 18, 12))).toBe('running')
  })
  it('日跨ぎ: 開始が日本時間の朝（UTC では前日）でも、日本時間の日付で数える', () => {
    // 日本時間 11/12 5:00 開始 = UTC 11/11 20:00。UTC の日付で数えると 11/11 が gacha になってしまう
    const early = { startAt: jst(2026, 11, 12, 5), aggregateAt: jst(2026, 11, 15, 20, 59) + 59_000 }
    expect(introPhaseOf(early, jst(2026, 11, 12, 12))).toBe('gacha')
    expect(introPhaseOf(early, jst(2026, 11, 13, 12))).toBe('running')
    expect(introPhaseOf(early, jst(2026, 11, 11, 12))).toBeNull()
  })
  it('短い回: 翌日の 12:00 より前に終わる回に running は無い', () => {
    const short = { startAt: jst(2026, 11, 12, 15), aggregateAt: jst(2026, 11, 13, 11, 59) + 59_000 }
    expect(introPhaseOf(short, jst(2026, 11, 12, 12))).toBe('gacha')
    expect(introPhaseOf(short, jst(2026, 11, 13, 12))).toBeNull()
  })
})

describe('intros.json の読み取り（parseIntros）', () => {
  it('画像の URL はサイトの /intro/<slug>/ の下', () => {
    const [a] = parseIntros(CATALOG, SITE)
    expect(a.images.map((i) => i.url)).toEqual([1, 2, 3, 4].map((n) => `${SITE}/intro/analyzer/p${n}.png`))
  })
  it('段（phase）を読む。無い・不正な紹介は落とさず running として扱う', () => {
    const out = parseIntros({ intros: [entry('a', 'gacha'), entry('b', 'running'), entry('c'), entry('d', 'gacah'), entry('e', 1), entry('f', null)] }, SITE)
    expect(out.map((e) => [e.slug, e.phase])).toEqual([
      ['a', 'gacha'],
      ['b', 'running'],
      ['c', 'running'],
      ['d', 'running'],
      ['e', 'running'],
      ['f', 'running'],
    ])
  })
  it('形の崩れた紹介だけ落とす', () => {
    const long = { ...entry('long'), text: 'あ'.repeat(INTRO_TEXT_MAX_WEIGHT / 2 + 1) }
    const out = parseIntros(
      {
        intros: [
          entry('Bad Slug'),
          entry('../x'),
          entry('pathy', undefined, ['../p1.png']),
          entry('five', undefined, ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']),
          entry('none', undefined, []),
          { ...entry('alt'), images: [{ file: 'p1.png' }] },
          // 代替テキストは Bot の parseIntroPayload と同じ制約（ずれると Bot が payload ごと捨て、画像なしで出る。レビュー HIGH-1）
          { ...entry('alt-empty'), images: [{ file: 'p1.png', alt: '' }] },
          { ...entry('alt-blank'), images: [{ file: 'p1.png', alt: '  ' }] },
          { ...entry('alt-long'), images: [{ file: 'p1.png', alt: 'あ'.repeat(INTRO_ALT_MAX + 1) }] },
          long,
          null,
          entry('deck'),
          entry('deck'),
        ],
      },
      SITE,
    )
    expect(out.map((e) => e.slug)).toEqual(['deck'])
  })
  it('代替テキストはちょうど上限の字数まで通す', () => {
    expect(parseIntros({ intros: [{ ...entry('a'), images: [{ file: 'p1.png', alt: 'あ'.repeat(INTRO_ALT_MAX) }] }] }, SITE)).toHaveLength(1)
  })
  it('一覧が無い・形が違えば空', () => {
    expect(parseIntros(null, SITE)).toEqual([])
    expect(parseIntros({ intros: 'x' }, SITE)).toEqual([])
  })
})

describe('次に出す紹介（pickIntro）', () => {
  const entries = parseIntros(CATALOG, SITE)
  it('一覧の順で、まだ出していないもの', () => {
    expect(pickIntro(entries, [])?.slug).toBe('analyzer')
    expect(pickIntro(entries, ['intro:2026-11-04:analyzer'])?.slug).toBe('deck')
  })
  it('全部出していれば、最後に出したのがいちばん古いもの', () => {
    const recent = ['intro:2026-11-25:deck', 'intro:2026-11-18:analyzer', 'intro:2026-11-11:tweet', 'intro:2026-11-04:compare', 'intro:2026-10-28:deck']
    expect(pickIntro(entries, recent)?.slug).toBe('compare')
  })
  it('一覧が空なら null', () => {
    expect(pickIntro([], [])).toBeNull()
  })
})

describe('段ごとに次に出す紹介（pickIntroFor）', () => {
  const entries = parseIntros(CATALOG, SITE)
  it('その段の紹介だけから選ぶ', () => {
    expect(pickIntroFor(entries, 'gacha', [], '2026-10-31')?.slug).toBe('deck')
    expect(pickIntroFor(entries, 'running', [], '2026-10-31')?.slug).toBe('analyzer')
  })
  it(`直近 ${INTRO_GAP_DAYS} 日に出した紹介は出さない（日本時間の日付どうしで比べる。28 日たてば出せる）`, () => {
    expect(INTRO_GAP_DAYS).toBe(28)
    // deck は 27 日前に出した → compare
    expect(pickIntroFor(entries, 'gacha', ['intro:2026-10-04:deck'], '2026-10-31')?.slug).toBe('compare')
    // 28 日前なら出せる。両方出したことがあれば、最後に出したのがいちばん古いもの
    expect(pickIntroFor(entries, 'gacha', ['intro:2026-10-10:compare', 'intro:2026-10-03:deck'], '2026-10-31')?.slug).toBe('deck')
  })
  it('段の候補が全部 28 日以内に出ていれば null', () => {
    expect(pickIntroFor(entries, 'gacha', ['intro:2026-10-21:compare', 'intro:2026-10-12:deck'], '2026-10-31')).toBeNull()
  })
  it('phase の無い紹介は running の候補になる', () => {
    const plain = parseIntros({ intros: [entry('plain')] }, SITE)
    expect(pickIntroFor(plain, 'running', [], '2026-10-31')?.slug).toBe('plain')
    expect(pickIntroFor(plain, 'gacha', [], '2026-10-31')).toBeNull()
  })
})

describe('積む（runIntro）', () => {
  it('11 時台の外では D1 もサイトも読まない', async () => {
    const { env, calls, fetcher } = setup()
    env.DB = null as unknown as D1Database
    expect(await runIntro(env, GACHA_223 - 2 * H, fetcher)).toEqual({ status: 'idle' })
    expect(await runIntro(env, GACHA_223, fetcher)).toEqual({ status: 'idle' })
    expect(await runIntro(env, GACHA_223 + 30 * M, fetcher)).toEqual({ status: 'idle' })
    expect(calls).toEqual([])
  })
  it('ガチャの日の 11 時台に gacha の紹介を1本積み、X にだけ出す（Discord は送信済み）', async () => {
    const { env, calls, fetcher } = setup()
    await upsertEvents(env.DB, [EV223])
    expect(await runIntro(env, GACHA_223 - 55 * M, fetcher)).toEqual({ status: 'queued', id: 'intro:2026-10-31:deck' })
    expect(calls).toEqual([`${SITE}/intro/intros.json`])
    const [post] = await unsentPosts(env.DB, 'x')
    expect(post.id).toBe('intro:2026-10-31:deck')
    expect(post.kind).toBe('intro')
    // その回に出したかは event_id で見る
    expect(post.event_id).toBe(223)
    expect(post.text).toBe(CATALOG.intros[1].text)
    expect(JSON.parse(post.payload as string)).toEqual({
      kind: 'intro',
      postAt: GACHA_223,
      slug: 'deck',
      images: [1, 2].map((n) => ({ url: `${SITE}/intro/deck/p${n}.png`, alt: `deck p${n}.png` })),
    })
    expect(await unsentPosts(env.DB, 'discord')).toEqual([])
  })
  it('同じ日の2回目以降は積まず、サイトも読まない（主キーの範囲の1回で終わる）', async () => {
    const { env, calls, fetcher } = setup()
    await upsertEvents(env.DB, [EV223])
    await runIntro(env, GACHA_223 - 55 * M, fetcher)
    const sqls = countSelects(env)
    expect(await runIntro(env, GACHA_223 - 50 * M, fetcher)).toEqual({ status: 'exists', id: 'intro:2026-10-31:deck' })
    expect(calls).toHaveLength(1)
    expect(sqls).toHaveLength(1)
  })
  it('1回に1本: gacha の日に出した回は、翌日の running では出さない', async () => {
    const { env, calls, fetcher } = setup()
    await upsertEvents(env.DB, [EV223])
    expect((await runIntro(env, GACHA_223 - 30 * M, fetcher)).status).toBe('queued')
    expect(await runIntro(env, RUNNING_223 - 30 * M, fetcher)).toEqual({ status: 'idle' })
    expect(calls).toHaveLength(1)
    expect((await unsentPosts(env.DB, 'x')).map((p) => p.id)).toEqual(['intro:2026-10-31:deck'])
  })
  it('gacha の候補が無い（28 日以内に出した）ときだけ、翌日に running の紹介を出す', async () => {
    const { env, fetcher } = setup()
    await upsertEvents(env.DB, [EV223])
    await seedIntro(env, 'intro:2026-10-12:deck')
    await seedIntro(env, 'intro:2026-10-21:compare')
    const r = await runIntro(env, GACHA_223 - 30 * M, fetcher)
    expect(r.status).toBe('skip')
    expect(await runIntro(env, RUNNING_223 - 30 * M, fetcher)).toEqual({ status: 'queued', id: 'intro:2026-11-01:analyzer' })
    const [post] = await unsentPosts(env.DB, 'x')
    expect(JSON.parse(post.payload as string).postAt).toBe(RUNNING_223)
  })
  it('gacha の日に出せる gacha の紹介があっても、running の紹介を同じ日に足さない（1日1本）', async () => {
    const { env, fetcher } = setup()
    await upsertEvents(env.DB, [EV223])
    const ids = await patrol(env, fetcher, GACHA_223 - H, GACHA_223)
    expect(ids).toEqual(['intro:2026-10-31:deck'])
  })
  it('段の無い日は events を1回引いて終わる（直近の紹介もサイトも読まない）', async () => {
    const { env, calls, fetcher } = setup()
    await upsertEvents(env.DB, [EV223])
    const sqls = countSelects(env)
    expect(await runIntro(env, jst(2026, 11, 3, 11, 30), fetcher)).toEqual({ status: 'idle' })
    expect(sqls).toHaveLength(2)
    expect(sqls[1]).toMatch(/FROM events/)
    expect(sqls[1]).toMatch(/LIMIT/)
    expect(calls).toEqual([])
  })
  it('積む見回りで引くのは posts 2回と events 1回まで', async () => {
    const { env, fetcher } = setup()
    await upsertEvents(env.DB, [EV223])
    const sqls = countSelects(env)
    expect((await runIntro(env, GACHA_223 - 30 * M, fetcher)).status).toBe('queued')
    expect(sqls.filter((s) => /FROM posts/.test(s))).toHaveLength(2)
    expect(sqls.filter((s) => /FROM events/.test(s))).toHaveLength(1)
    expect(sqls).toHaveLength(3)
  })
  it('次の回が events に無ければ出さない', async () => {
    const { env, calls, fetcher } = setup()
    expect(await runIntro(env, GACHA_223 - 30 * M, fetcher)).toEqual({ status: 'idle' })
    expect(calls).toEqual([])
  })
  it('テストの回は無視する（本番の回と同じ日でも、本番の回の段で出す）', async () => {
    const { env, fetcher } = setup()
    // テストの回だけの日は出さない
    const test1: EventMeta = { ...EV223, id: 900, name: 'チアフルテストイベント', eventType: 'cheerful_carnival', asset: 'event_cheerfutest_2026' }
    await upsertEvents(env.DB, [test1])
    expect(await runIntro(env, GACHA_223 - 30 * M, fetcher)).toEqual({ status: 'idle' })
    // 本番の回より先に始まったテストの回があっても、本番の回を取りこぼさない（テストの回は SQL でなく JS で除く）
    const test2: EventMeta = { ...test1, id: 901, startAt: EV223.startAt - 3 * H, asset: 'event_test2_2026' }
    await upsertEvents(env.DB, [test2, EV223])
    expect(await runIntro(env, GACHA_223 - 25 * M, fetcher)).toEqual({ status: 'queued', id: 'intro:2026-10-31:deck' })
    expect((await unsentPosts(env.DB, 'x'))[0].event_id).toBe(223)
  })
  it('対象外の種別（ワールドリンク・マラソン・チアフル以外）の回では出さない', async () => {
    const { env, fetcher } = setup()
    await upsertEvents(env.DB, [{ ...EV223, eventType: 'other' }])
    expect(await runIntro(env, GACHA_223 - 30 * M, fetcher)).toEqual({ status: 'idle' })
  })
  it('前の回の running の日と次の回の gacha の日が重なったら、開始の早い回の段で出す', async () => {
    const { env, fetcher } = setup()
    // 作り物: 10/30 開始の短い回 A と、10/31 開始の 223
    const a: EventMeta = { ...EV223, id: 300, name: 'A', startAt: jst(2026, 10, 30, 15), aggregateAt: jst(2026, 10, 31, 20, 59) + 59_000, asset: 'event_a_2026' }
    await upsertEvents(env.DB, [a, EV223])
    await seedIntro(env, 'intro:2026-10-12:deck')
    await seedIntro(env, 'intro:2026-10-21:compare')
    // 10/30 は A の gacha だが候補なし → 10/31 は A の running（開始の早い回）
    expect((await runIntro(env, jst(2026, 10, 30, 11, 30), fetcher)).status).toBe('skip')
    expect(await runIntro(env, GACHA_223 - 30 * M, fetcher)).toEqual({ status: 'queued', id: 'intro:2026-10-31:analyzer' })
    expect((await unsentPosts(env.DB, 'x'))[0].event_id).toBe(300)
    // 223 は gacha の日に出せなかったので、翌日に running で出す
    expect(await runIntro(env, RUNNING_223 - 30 * M, fetcher)).toEqual({ status: 'queued', id: 'intro:2026-11-01:tweet' })
  })
  it('開始の早い回がもう出していれば、同じ日に段のある次の回で出す', async () => {
    const { env, fetcher } = setup()
    const a: EventMeta = { ...EV223, id: 300, name: 'A', startAt: jst(2026, 10, 30, 15), aggregateAt: jst(2026, 11, 2, 20, 59) + 59_000, asset: 'event_a_2026' }
    await upsertEvents(env.DB, [a, EV223])
    // 10/30 は A の gacha で deck を出す → 10/31 は A の running だが A は出し済みなので、223 の gacha（deck は前日に出したので compare）
    expect(await runIntro(env, jst(2026, 10, 30, 11, 30), fetcher)).toEqual({ status: 'queued', id: 'intro:2026-10-30:deck' })
    expect(await runIntro(env, GACHA_223 - 30 * M, fetcher)).toEqual({ status: 'queued', id: 'intro:2026-10-31:compare' })
    const posts = await env.DB.prepare('SELECT id, event_id FROM posts ORDER BY id').all<{ id: string; event_id: number }>()
    expect(posts.results).toEqual([
      { id: 'intro:2026-10-30:deck', event_id: 300 },
      { id: 'intro:2026-10-31:compare', event_id: 223 },
    ])
  })
  it('28 日の境目は id の日付どうしで数える（28 日前に出した紹介は出せる、27 日前なら出さない）', async () => {
    const ok = setup()
    await upsertEvents(ok.env.DB, [EV223])
    await seedIntro(ok.env, 'intro:2026-10-03:deck')
    await seedIntro(ok.env, 'intro:2026-10-21:compare')
    expect(await runIntro(ok.env, GACHA_223 - 55 * M, ok.fetcher)).toEqual({ status: 'queued', id: 'intro:2026-10-31:deck' })
    const ng = setup()
    await upsertEvents(ng.env.DB, [EV223])
    await seedIntro(ng.env, 'intro:2026-10-04:deck')
    await seedIntro(ng.env, 'intro:2026-10-21:compare')
    expect((await runIntro(ng.env, GACHA_223 - 55 * M, ng.fetcher)).status).toBe('skip')
  })
  it('intros.json が読めなければ積まない（次の見回りでまた読む）', async () => {
    const { env, fetcher } = setup(CATALOG, 404)
    await upsertEvents(env.DB, [EV223])
    expect(await runIntro(env, GACHA_223 - 30 * M, fetcher)).toEqual({ status: 'skip', reason: 'intros.json が読めない（404）' })
    expect(await unsentPosts(env.DB, 'x')).toEqual([])
    const thrower = (async () => {
      throw new Error('timeout')
    }) as unknown as typeof fetch
    expect((await runIntro(env, GACHA_223 - 25 * M, thrower)).status).toBe('skip')
  })
  it('出せる紹介が無ければ積まない', async () => {
    const { env, fetcher } = setup({ intros: [] })
    await upsertEvents(env.DB, [EV223])
    expect(await runIntro(env, GACHA_223 - 30 * M, fetcher)).toEqual({ status: 'skip', reason: '出せる紹介が無い' })
  })
  it('running の候補も 28 日以内に出し切っていれば出さない（skip）', async () => {
    const { env, fetcher } = setup({ intros: [entry('deck', 'gacha'), entry('analyzer', 'running')] })
    await upsertEvents(env.DB, [EV223])
    await seedIntro(env, 'intro:2026-10-12:deck')
    await seedIntro(env, 'intro:2026-10-20:analyzer')
    expect((await runIntro(env, GACHA_223 - 30 * M, fetcher)).status).toBe('skip')
    expect((await runIntro(env, RUNNING_223 - 30 * M, fetcher)).status).toBe('skip')
    expect(await unsentPosts(env.DB, 'x')).toEqual([])
  })
})

describe('過去の実データでなぞる（222・223 と本物の intros.json）', () => {
  const real = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'public', 'intro', 'intros.json'), 'utf8')) as unknown
  const from = jst(2026, 10, 26)
  const until = jst(2026, 11, 10)

  it('前に出した紹介が無ければ、222 の gacha（10/26）と 223 の gacha（10/31）に1本ずつ', async () => {
    const { env, fetcher } = setup(real)
    await upsertEvents(env.DB, [EV222, EV223])
    expect(await patrol(env, fetcher, from, until)).toEqual(['intro:2026-10-26:deck', 'intro:2026-10-31:compare'])
  })
  it('gacha の紹介を 28 日以内に出していれば、翌日（222 は 10/27、223 は 11/1）に running の紹介', async () => {
    const { env, fetcher } = setup(real)
    await upsertEvents(env.DB, [EV222, EV223])
    await seedIntro(env, 'intro:2026-10-12:deck')
    await seedIntro(env, 'intro:2026-10-21:compare')
    expect(await patrol(env, fetcher, from, until)).toEqual(['intro:2026-10-27:analyzer', 'intro:2026-11-01:plan'])
  })
})

describe('サイトに置いた紹介（public/intro/intros.json）', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'public', 'intro')
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'intros.json'), 'utf8')) as { intros: { slug: string; phase?: unknown; text: string; images: { file: string }[] }[] }
  it('全部の紹介が Worker の読み取りを通る（落ちる紹介は出されないまま気づけない）', () => {
    expect(raw.intros.length).toBeGreaterThan(0)
    expect(parseIntros(raw, SITE).map((e) => e.slug)).toEqual(raw.intros.map((e) => e.slug))
  })
  it('全部の紹介が段（gacha か running）を明示している（Worker は打ち間違いを黙って running にするので、ここで止める）', () => {
    expect(raw.intros.filter((e) => e.phase !== 'gacha' && e.phase !== 'running').map((e) => e.slug)).toEqual([])
    // gacha の紹介が無いと、ガチャの日に出すものが無くなる
    expect(raw.intros.some((e) => e.phase === 'gacha')).toBe(true)
  })
  it.each(raw.intros.map((e) => [e.slug, e] as const))('%s: サイトのページ・本文の URL とハッシュタグ・画像（2400×2000 の PNG）', (slug, e) => {
    expect(PAGES[`/${slug}`], 'サイトに無いページ').toBeDefined()
    expect(e.text).toContain(`${SITE}/${slug}`)
    expect(e.text.endsWith('#プロセカ')).toBe(true)
    for (const img of e.images) {
      const buf = fs.readFileSync(path.join(dir, slug, img.file))
      expect(buf.subarray(1, 4).toString('latin1'), img.file).toBe('PNG')
      expect([buf.readUInt32BE(16), buf.readUInt32BE(20)], img.file).toEqual([2400, 2000])
      expect(buf.length, img.file).toBeLessThanOrEqual(4_500_000)
    }
  })
})
