/**
 * ② 公式 X の投稿の自動作成（.github/workflows/x-auto-post.yml から毎日 12:05 JST）。
 *
 *   node scripts/claude/x-auto-post.ts [--dry-run]
 *
 * 72時間前の main と今の main を比べて、
 *   - 新しい版（MINOR 以上・更新履歴の日付が7日以内）があれば、更新履歴を Claude に要約させて告知
 *   - 新しく公開された曲があれば、1曲1本で告知（型で書く。曲名はデータのまま）
 * を投稿キューに積む（X にだけ出す）。承認なしで出してよい（2026-09-30 Nori）。
 * id は版・曲ごとに決まっているので、窓が重なっても二重には出ない（Worker が INSERT OR IGNORE）。
 *
 * ★ 比べる元が読めない・空のときは何も出さない。1回の本数にも上限を置く
 *   （全部を「新しい」とみなして過去の版や全曲を流す事故を止める。レビュー H1）
 *
 * 環境変数: BORDER_API・BORDER_ADMIN_TOKEN（投稿キュー）、ANTHROPIC_API_KEY（無ければ版の告知は型で書く）
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { askClaude, hasKey } from './client.ts'
import { queuePost } from './queue.ts'
import {
  MAX_RELEASES_PER_RUN,
  MAX_SONGS_PER_RUN,
  RELEASE_SYSTEM,
  checkReleasePost,
  fallbackReleasePost,
  newAnnounceable,
  newSongs,
  parseChangelog,
  recentReleases,
  releasePostId,
  releaseUser,
  safeForX,
  songPost,
  songPostId,
  type ChangelogEntry,
  type Song,
} from './xposts.ts'

const DRY = process.argv.includes('--dry-run')
const WINDOW_HOURS = 72
const SONGS_PATH = 'public/MusicDatas/transformedMusics.json'

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** 比べる元の版（72時間前の main）と、その時刻 */
function baseCommit(): { sha: string; at: number } | null {
  const sha = git(['rev-list', '-1', `--before=${WINDOW_HOURS} hours ago`, 'HEAD']).trim()
  if (!sha) return null
  return { sha, at: Number(git(['show', '-s', '--format=%ct', sha]).trim()) * 1000 }
}

function fileAt(sha: string, path: string): string | null {
  try {
    return git(['show', `${sha}:${path}`])
  } catch {
    return null
  }
}

const parseSongs = (s: string | null): Song[] => {
  try {
    const v = s ? JSON.parse(s) : []
    return Array.isArray(v) ? (v as Song[]).filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string') : []
  } catch {
    return []
  }
}

async function releaseText(e: ChangelogEntry): Promise<string | null> {
  if (hasKey()) {
    try {
      const text = await askClaude({ label: `版の告知 v${e.version}`, system: RELEASE_SYSTEM, user: releaseUser(e), maxTokens: 600 })
      const bad = checkReleasePost(text, e.version)
      if (!bad) return text
      console.log(`Claude の文面が型に合わない（${bad}）。型の文面にする`)
    } catch (err) {
      console.log(`Claude を呼べなかった（${err instanceof Error ? err.message : String(err)}）。型の文面にする`)
    }
  }
  const fallback = fallbackReleasePost(e)
  const bad = safeForX(fallback)
  if (bad) {
    console.log(`型の文面も出せない（${bad}）。v${e.version} は知らせない`)
    return null
  }
  return fallback
}

async function post(id: string, text: string) {
  console.log(`---- ${id}\n${text}`)
  if (DRY) return
  const queued = await queuePost({ id, eventId: 0, kind: 'announce', text, xOnly: true })
  console.log(queued ? '→ 投稿キューに入れた' : '→ 入れ済み（二重にはしない）')
}

async function releases(baseSha: string, now: number) {
  const before = parseChangelog(fileAt(baseSha, 'CHANGELOG.md') ?? '')
  const after = parseChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'))
  if (before.length === 0 || after.length === 0) {
    console.log('更新履歴を読めない（比べる元か今のどちらかが空）ので、版の告知は飛ばす')
    return
  }
  const fresh = recentReleases(newAnnounceable(before, after), now)
  if (fresh.length > MAX_RELEASES_PER_RUN) throw new Error(`新しい版が ${fresh.length} 本ある（上限 ${MAX_RELEASES_PER_RUN}）。比べる元を疑って何も出さない`)
  for (const e of fresh) {
    const text = await releaseText(e)
    if (text) await post(releasePostId(e.version), text)
  }
}

async function songs(base: { sha: string; at: number }, now: number) {
  const before = parseSongs(fileAt(base.sha, SONGS_PATH))
  const after = parseSongs(fs.readFileSync(SONGS_PATH, 'utf8'))
  if (before.length === 0 || after.length === 0) {
    console.log('楽曲データを読めない（比べる元か今のどちらかが空）ので、新曲の告知は飛ばす')
    return
  }
  const scores = JSON.parse(fs.readFileSync('public/MusicDatas/musicScoreData.json', 'utf8')) as Record<string, unknown>
  const added = newSongs(before, base.at, after, now, new Set(Object.keys(scores)))
  if (added.length > MAX_SONGS_PER_RUN) throw new Error(`新しい曲が ${added.length} 曲ある（上限 ${MAX_SONGS_PER_RUN}）。比べる元を疑って何も出さない`)
  for (const s of added) {
    const text = songPost(s)
    if (text) await post(songPostId(s), text)
    else console.log(`「${s.title}」は文面の確かめを通らないので知らせない`)
  }
}

async function main() {
  const base = baseCommit()
  if (!base) {
    console.log(`${WINDOW_HOURS}時間前の main が無い（履歴が浅い）ので飛ばす`)
    return
  }
  const now = Date.now()
  await releases(base.sha, now)
  await songs(base, now)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
