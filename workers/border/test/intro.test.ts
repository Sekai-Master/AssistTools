import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGES } from '../../../src/seo.ts'
import { unsentPosts } from '../src/db.ts'
import type { Env } from '../src/env.ts'
import { INTRO_ALT_MAX, INTRO_TEXT_MAX_WEIGHT, introIdPrefix, introSlotOf, parseIntros, pickIntro, runIntro } from '../src/intro.ts'
import { createD1 } from './d1shim.ts'

const H = 3_600_000
const M = 60_000
const SITE = 'https://sekaimaster.pages.dev'
// 2026-11-04（水）12:00 日本時間
const WED_NOON = Date.UTC(2026, 10, 4, 3, 0)
const WEEK = 7 * 24 * H

const entry = (slug: string, files = ['p1.png', 'p2.png']) => ({
  slug,
  text: `【機能紹介】${slug}\n\nhttps://sekaimaster.pages.dev/${slug}\n#プロセカ`,
  images: files.map((file) => ({ file, alt: `${slug} ${file}` })),
})
const CATALOG = { intros: [entry('analyzer', ['p1.png', 'p2.png', 'p3.png', 'p4.png']), entry('deck'), entry('tweet')] }

function setup(catalog: unknown = CATALOG, status = 200) {
  const env: Env = { DB: createD1(), SITE_ORIGIN: SITE, ADMIN_TOKEN: 'tok' }
  const calls: string[] = []
  const fetcher = (async (url: string) => {
    calls.push(String(url))
    return new Response(JSON.stringify(catalog), { status })
  }) as unknown as typeof fetch
  return { env, calls, fetcher }
}

describe('積む時間帯（introSlotOf）', () => {
  it('水曜 11:00〜11:59 は、その日の 12:00 を返す', () => {
    expect(introSlotOf(WED_NOON - H)).toBe(WED_NOON)
    expect(introSlotOf(WED_NOON - 5 * M)).toBe(WED_NOON)
  })
  it('1時間より前・12:00 ちょうど以降・ほかの曜日は null', () => {
    expect(introSlotOf(WED_NOON - H - 1)).toBeNull()
    expect(introSlotOf(WED_NOON)).toBeNull()
    expect(introSlotOf(WED_NOON - 24 * H - 30 * M)).toBeNull()
    expect(introSlotOf(WED_NOON + 24 * H - 30 * M)).toBeNull()
  })
  it('id の頭は日本時間の日付', () => {
    expect(introIdPrefix(WED_NOON)).toBe('intro:2026-11-04:')
  })
})

describe('intros.json の読み取り（parseIntros）', () => {
  it('画像の URL はサイトの /intro/<slug>/ の下', () => {
    const [a] = parseIntros(CATALOG, SITE)
    expect(a.images.map((i) => i.url)).toEqual([1, 2, 3, 4].map((n) => `${SITE}/intro/analyzer/p${n}.png`))
  })
  it('形の崩れた紹介だけ落とす', () => {
    const long = { ...entry('long'), text: 'あ'.repeat(INTRO_TEXT_MAX_WEIGHT / 2 + 1) }
    const out = parseIntros(
      {
        intros: [
          entry('Bad Slug'),
          entry('../x'),
          entry('pathy', ['../p1.png']),
          entry('five', ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']),
          entry('none', []),
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
    const recent = ['intro:2026-11-25:deck', 'intro:2026-11-18:analyzer', 'intro:2026-11-11:tweet', 'intro:2026-11-04:deck']
    expect(pickIntro(entries, recent)?.slug).toBe('tweet')
  })
  it('一覧が空なら null', () => {
    expect(pickIntro([], [])).toBeNull()
  })
})

describe('積む（runIntro）', () => {
  it('時間帯の外では D1 もサイトも読まない', async () => {
    const { env, calls, fetcher } = setup()
    env.DB = null as unknown as D1Database
    expect(await runIntro(env, WED_NOON - 2 * H, fetcher)).toEqual({ status: 'idle' })
    expect(calls).toEqual([])
  })
  it('水曜11時台に1本積み、X にだけ出す（Discord は送信済み）', async () => {
    const { env, calls, fetcher } = setup()
    const now = WED_NOON - 55 * M
    expect(await runIntro(env, now, fetcher)).toEqual({ status: 'queued', id: 'intro:2026-11-04:analyzer' })
    expect(calls).toEqual([`${SITE}/intro/intros.json`])
    const [post] = await unsentPosts(env.DB, 'x')
    expect(post.id).toBe('intro:2026-11-04:analyzer')
    expect(post.kind).toBe('intro')
    expect(post.text).toBe(CATALOG.intros[0].text)
    expect(JSON.parse(post.payload as string)).toEqual({
      kind: 'intro',
      postAt: WED_NOON,
      slug: 'analyzer',
      images: [1, 2, 3, 4].map((n) => ({ url: `${SITE}/intro/analyzer/p${n}.png`, alt: `analyzer p${n}.png` })),
    })
    expect(await unsentPosts(env.DB, 'discord')).toEqual([])
  })
  it('同じ週の2回目以降は積まず、サイトも読まない', async () => {
    const { env, calls, fetcher } = setup()
    await runIntro(env, WED_NOON - 55 * M, fetcher)
    expect(await runIntro(env, WED_NOON - 50 * M, fetcher)).toEqual({ status: 'exists', id: 'intro:2026-11-04:analyzer' })
    expect(calls).toHaveLength(1)
  })
  it('次の週は次の紹介、一巡したら最初に戻る', async () => {
    const { env, fetcher } = setup()
    const ids: string[] = []
    for (let w = 0; w < 4; w++) {
      const r = await runIntro(env, WED_NOON + w * WEEK - 30 * M, fetcher)
      if (r.status === 'queued') ids.push(r.id)
    }
    expect(ids).toEqual(['intro:2026-11-04:analyzer', 'intro:2026-11-11:deck', 'intro:2026-11-18:tweet', 'intro:2026-11-25:analyzer'])
  })
  it('intros.json が読めなければ積まない（次の見回りでまた読む）', async () => {
    const { env, fetcher } = setup(CATALOG, 404)
    expect(await runIntro(env, WED_NOON - 30 * M, fetcher)).toEqual({ status: 'skip', reason: 'intros.json が読めない（404）' })
    expect(await unsentPosts(env.DB, 'x')).toEqual([])
    const thrower = (async () => {
      throw new Error('timeout')
    }) as unknown as typeof fetch
    expect((await runIntro(env, WED_NOON - 25 * M, thrower)).status).toBe('skip')
  })
  it('出せる紹介が無ければ積まない', async () => {
    const { env, fetcher } = setup({ intros: [] })
    expect(await runIntro(env, WED_NOON - 30 * M, fetcher)).toEqual({ status: 'skip', reason: '出せる紹介が無い' })
  })
})

describe('サイトに置いた紹介（public/intro/intros.json）', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'public', 'intro')
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'intros.json'), 'utf8')) as { intros: { slug: string; text: string; images: { file: string }[] }[] }
  it('全部の紹介が Worker の読み取りを通る（落ちる紹介は出されないまま気づけない）', () => {
    expect(raw.intros.length).toBeGreaterThan(0)
    expect(parseIntros(raw, SITE).map((e) => e.slug)).toEqual(raw.intros.map((e) => e.slug))
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
