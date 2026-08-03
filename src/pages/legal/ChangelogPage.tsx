import { ToolPage } from "../../components/ui/ToolPage";
import { DocIntro, DocLink } from "./LegalDoc";
import { parseChangelog } from "./changelogParser";
import { REPO_URL } from "../../lib/site";
// 正本はリポジトリ直下の CHANGELOG.md（docs/versioning.md）。
// ここで読み込んでいるので、ページ用にデータを持ち直す必要は無い。
import changelogMarkdown from "../../../CHANGELOG.md?raw";

const RELEASES = parseChangelog(changelogMarkdown);

const SITE_UPDATE_NOTE =
  "このサイトに入った変更のうち、使う人から見て違いが出るものを載せています。カード・楽曲データの自動更新はここには載りません（フッターの「データ更新」の日付を見てください）。";

/** 見出しの色。追加＝新しいもの、変更＝形が変わったもの、修正＝直したもの。 */
const GROUP_TONE: Record<string, string> = {
  追加: "text-[color:var(--color-mmj)]",
  変更: "text-[color:var(--color-vs)]",
  修正: "text-[color:var(--color-n25)]",
};

export default function ChangelogPage() {
  return (
    <ToolPage unit="vs" title="更新履歴" icon="history">
      <DocIntro>
        {SITE_UPDATE_NOTE}
        <DocLink href={`${REPO_URL}/blob/main/CHANGELOG.md`}>GitHub</DocLink>
        でも同じものを読めます。
      </DocIntro>

      <div className="space-y-8">
        {RELEASES.map((release, i) => (
          <article key={release.version} className="neu-panel p-5 sm:p-6">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-bold text-slate-700">v{release.version}</h2>
              <time className="text-xs text-slate-500" dateTime={release.date}>
                {release.date}
              </time>
              {/* 最新版だけ印を付ける。今どこまで来ているかが一目で分かればよい。 */}
              {i === 0 && (
                <span className="rounded-full bg-[color:var(--color-vs)]/15 px-2 py-0.5 text-[11px] font-bold text-[color:var(--color-vs)]">
                  最新
                </span>
              )}
            </header>

            {release.summary && (
              <p className="mt-3 text-sm leading-7 text-slate-600">{release.summary}</p>
            )}

            {release.groups.map((group) => (
              <div key={group.label} className="mt-4">
                <h3 className={`text-xs font-bold tracking-wide ${GROUP_TONE[group.label] ?? "text-slate-500"}`}>
                  {group.label}
                </h3>
                <ul className="mt-1.5 ml-5 list-disc space-y-1.5 text-sm leading-7 text-slate-600 marker:text-slate-400">
                  {group.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
        ))}
      </div>
    </ToolPage>
  );
}
