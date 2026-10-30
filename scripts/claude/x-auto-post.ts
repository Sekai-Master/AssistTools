/**
 * ② 公式 X の投稿の自動作成（.github/workflows/x-auto-post.yml から毎日 12:17 JST）。
 *
 *   node scripts/claude/x-auto-post.ts [--dry-run]
 *
 * 72時間前の main と今の main を比べて、新しく公開された曲があれば1曲1本で告知（型で書く。曲名はデータのまま）
 * を投稿キューに積む（X にだけ出す）。承認なしで出してよい（2026-09-30 Nori）。
 * id は曲ごとに決まっているので、窓が重なっても二重には出ない（Worker が INSERT OR IGNORE）。
 *
 * 版の告知はやめた（2026-10-31 Nori「アプデのときはどうせ手が入るので自動投稿の仕組みごと削除」）。
 * 版を上げたら、告知の画像を作って Nori が手で予約する（docs/x-operations.md 第7節）。
 *
 * ★ 比べる元が読めない・空のときは何も出さない。1回の本数にも上限を置く
 *   （全部を「新しい」とみなして全曲を流す事故を止める。レビュー H1）
 *
 * 環境変数: BORDER_API・BORDER_ADMIN_TOKEN（投稿キュー）
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { queuePost } from './queue.ts'
import { MAX_SONGS_PER_RUN, newSongs, songPayload, songPost, songPostId, type AnnouncePayload, type Song } from './xposts.ts'

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

async function post(id: string, text: string, payload: AnnouncePayload | null) {
  console.log(`---- ${id}\n${text}\n（画像: ${payload ? (payload.kind === 'song' ? `新曲カード ${payload.jacketUrl}` : `ページ ${payload.path}`) : 'なし'}）`)
  if (DRY) return
  const queued = await queuePost({ id, eventId: 0, kind: 'announce', text, xOnly: true, payload })
  console.log(queued ? '→ 投稿キューに入れた' : '→ 入れ済み（二重にはしない）')
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
    if (text) await post(songPostId(s), text, songPayload(s))
    else console.log(`「${s.title}」は文面の確かめを通らないので知らせない`)
  }
}

async function main() {
  const base = baseCommit()
  if (!base) {
    console.log(`${WINDOW_HOURS}時間前の main が無い（履歴が浅い）ので飛ばす`)
    return
  }
  await songs(base, Date.now())
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
