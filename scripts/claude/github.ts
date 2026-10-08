/**
 * GitHub の Issue を作る・追記する（REST を fetch で直接。Actions の GITHUB_TOKEN を使う）。
 * リポジトリは GITHUB_REPOSITORY（"owner/name"）。
 */
const API = 'https://api.github.com'

export interface IssueTarget {
  title: string
  body: string
  label: string
  /** 同じ件が開いていればそちらに追記する。タイトルがこれで始まる開いた Issue を探す */
  dedupePrefix: string
}

function env() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) throw new Error('GH_TOKEN と GITHUB_REPOSITORY が要る')
  return { token, repo }
}

async function gh<T>(method: string, path: string, body: unknown, fetchImpl: typeof fetch): Promise<{ status: number; data: T }> {
  const { token } = env()
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as T
  return { status: res.status, data }
}

export interface OpenIssue {
  number: number
  title: string
  html_url: string
  updated_at: string
}

/** 同じ件（タイトルの頭が同じ・同じラベル・開いている）を探す */
export async function findOpenIssue(label: string, prefix: string, fetchImpl: typeof fetch = fetch): Promise<OpenIssue | null> {
  const { repo } = env()
  const open = await gh<OpenIssue[]>('GET', `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=50`, undefined, fetchImpl)
  return (Array.isArray(open.data) ? open.data.find((i) => i.title.startsWith(prefix)) : undefined) ?? null
}

/**
 * 同じ件があれば追記、無ければ作る。
 * @returns Issue の URL
 */
export async function upsertIssue(t: IssueTarget, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { repo } = env()
  // ラベルが無ければ作る（あれば 422 が返るだけ）
  await gh('POST', `/repos/${repo}/labels`, { name: t.label, color: 'c5def5' }, fetchImpl)
  const same = await findOpenIssue(t.label, t.dedupePrefix, fetchImpl)
  if (same) {
    const c = await gh('POST', `/repos/${repo}/issues/${same.number}/comments`, { body: t.body }, fetchImpl)
    if (c.status >= 300) throw new Error(`Issue への追記に失敗 ${c.status}`)
    return same.html_url
  }
  const made = await gh<{ html_url?: string }>('POST', `/repos/${repo}/issues`, { title: t.title, body: t.body, labels: [t.label] }, fetchImpl)
  if (made.status >= 300 || !made.data?.html_url) throw new Error(`Issue の作成に失敗 ${made.status}`)
  return made.data.html_url
}
