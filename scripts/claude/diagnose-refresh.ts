/**
 * ① データ更新が失敗したときの一次診断（.github/workflows/diagnose-refresh.yml から）。
 *
 *   node scripts/claude/diagnose-refresh.ts <失敗のログのファイル>
 *
 * 環境変数: ANTHROPIC_API_KEY（無ければ何もしない）, GH_TOKEN, GITHUB_REPOSITORY,
 *           WORKFLOW_NAME, WORKFLOW_PATH, RUN_URL
 * 出す先: GitHub の Issue（ラベル auto-diagnosis。同じワークフローの件が開いていれば追記）
 */
import fs from 'node:fs'
import { askClaude, hasKey, MODEL } from './client.ts'
import { DIAGNOSIS_SYSTEM, diagnosisUser, localImports, sanitizeForIssue, scriptPaths, tail } from './diagnose.ts'
import { findOpenIssue, upsertIssue } from './github.ts'

/** 同じ件をこの時間内に書いていれば、診断しない */
const RECENT_MS = 20 * 3_600_000
const LOG_MAX = 40_000
const FILE_MAX = 12_000
const FILES_MAX = 60_000

function readCapped(p: string): string | null {
  try {
    const t = fs.readFileSync(p, 'utf8')
    return t.length > FILE_MAX ? `${t.slice(0, FILE_MAX)}\n…（以下略）` : t
  } catch {
    return null
  }
}

/** ワークフロー → スクリプト → その相対 import（1段）を、合計の上限まで集める */
function collectFiles(workflowPath: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  let total = 0
  const add = (p: string) => {
    if (out.some((f) => f.path === p) || total > FILES_MAX) return
    const text = readCapped(p)
    if (text == null) return
    out.push({ path: p, text })
    total += text.length
  }
  const yml = readCapped(workflowPath) ?? ''
  add(workflowPath)
  for (const s of scriptPaths(yml)) {
    add(s)
    for (const imp of localImports(readCapped(s) ?? '', s)) add(imp)
  }
  return out
}

/** データ元の直近のコミット（形が変わったのはいつか、の手がかり） */
async function upstreamCommits(): Promise<string[]> {
  try {
    const res = await fetch('https://api.github.com/repos/Sekai-World/sekai-master-db-diff/commits?per_page=8', {
      headers: { Accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
    })
    if (!res.ok) return []
    const list = (await res.json()) as { commit?: { message?: string; committer?: { date?: string } } }[]
    return list.map((c) => `${c.commit?.committer?.date ?? '?'} ${(c.commit?.message ?? '').split('\n')[0]}`)
  } catch {
    return []
  }
}

async function main() {
  if (!hasKey()) {
    console.log('ANTHROPIC_API_KEY が無いので、一次診断は飛ばす')
    return
  }
  const logFile = process.argv[2]
  const workflow = process.env.WORKFLOW_NAME ?? '（不明なワークフロー）'
  // 「.github/workflows/x.yml@refs/heads/main」の形で来ることがあるので、@ から後ろを落とす（レビュー M6）
  const workflowPath = (process.env.WORKFLOW_PATH ?? '').split('@')[0]
  const runUrl = process.env.RUN_URL ?? ''
  const log = tail(logFile && fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '（ログを取れなかった）', LOG_MAX)

  // 壊れたままだと6時間おきに失敗する。同じ件を最近書いていれば Claude を呼ばない（費用と Issue の荒れを止める。レビュー M4）
  const prefix = `[自動診断] ${workflow} が失敗`
  const recent = await findOpenIssue('auto-diagnosis', prefix)
  if (recent && Date.now() - Date.parse(recent.updated_at) < RECENT_MS) {
    console.log(`同じ件を最近書いている（${recent.html_url}）ので、今回は診断しない`)
    return
  }

  const diagnosis = await askClaude({
    label: '一次診断',
    system: DIAGNOSIS_SYSTEM,
    user: diagnosisUser({ workflow, runUrl, log, files: workflowPath ? collectFiles(workflowPath) : [], upstream: await upstreamCommits() }),
    maxTokens: 2_000,
  })
  const day = new Date().toISOString().slice(0, 10)
  const url = await upsertIssue({
    title: `[自動診断] ${workflow} が失敗（${day}）`,
    dedupePrefix: prefix,
    label: 'auto-diagnosis',
    body: [
      `失敗した実行: ${runUrl}`,
      '',
      sanitizeForIssue(diagnosis),
      '',
      '---',
      `Claude（${MODEL}）による一次診断です。見立てには推測を含みます。直すときは実物で確かめてください。`,
    ].join('\n'),
  })
  console.log(`一次診断を書いた: ${url}`)
}

main().catch((err) => {
  // 診断の失敗で、元の失敗の通知を邪魔しない（この job だけ赤にする）
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
