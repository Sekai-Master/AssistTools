import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { SITE_NAME, SITE_URL } from "../../lib/site";
import { parseEntry, sortEntries, STATUS_TONE, type Entry } from "./lib/entry";
import type { Block, Inline } from "./lib/md";

/**
 * 知見ノート。**このサイトの外の人が引用できる文献**として置く（Nori 判断 2026-08-21）。
 *
 * ★ 中身の正本は `docs/knowledge/*.md`。ページ用にデータを持ち直さない
 *  （更新履歴が CHANGELOG.md を直接読んでいるのと同じ作法）。
 *   Markdown を書き換えればそのままここに出る＝**蓄積が実装の副産物になる**。
 *
 * ★ 記事の背骨は「状態（確定・有力・未検証・誤り）」。攻略サイトとの違いはそこにある。
 *   結論だけを置かず、**どこまで確かめられているか**を必ず並べて出す。
 */

// docs/ は src の外だが、CHANGELOG.md と同じく raw で読める。
const FILES = import.meta.glob("../../../docs/knowledge/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const ENTRIES: Entry[] = sortEntries(
  Object.entries(FILES)
    .filter(([path]) => !path.endsWith("README.md"))
    .map(([path, src]) =>
      parseEntry(path.split("/").pop()!.replace(/\.md$/, ""), src),
    ),
);

function Text({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "strong") return <b key={i}>{p.text}</b>;
        if (p.kind === "code")
          return (
            <code
              key={i}
              className="rounded bg-neu px-1 py-0.5 text-[0.9em] shadow-neu-inset"
            >
              {p.text}
            </code>
          );
        if (p.kind === "link") {
          // 相対リンク（他の記事）と外部リンクを分ける。
          const inner = p.href.replace(/\.md$/, "");
          if (!/^https?:/.test(p.href)) {
            const to = inner.startsWith("http")
              ? inner
              : `/knowledge/${inner.split("/").pop()}`;
            return (
              <Link key={i} to={to} className="font-bold underline">
                {p.text}
              </Link>
            );
          }
          return (
            <a
              key={i}
              href={p.href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-bold underline"
            >
              {p.text}
            </a>
          );
        }
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return b.level === 2 ? (
              <h2
                key={i}
                className="!mt-8 border-l-4 pl-3 text-lg font-bold text-slate-700"
                style={{ borderColor: "var(--unit-color)" }}
              >
                <Text parts={b.text} />
              </h2>
            ) : (
              <h3 key={i} className="!mt-6 text-base font-bold text-slate-600">
                <Text parts={b.text} />
              </h3>
            );
          case "para":
            return (
              <p key={i} className="text-sm leading-relaxed text-slate-600">
                <Text parts={b.text} />
              </p>
            );
          case "list": {
            const cls =
              "ml-5 space-y-1.5 text-sm leading-relaxed text-slate-600";
            const items = b.items.map((it, j) => (
              <li key={j}>
                <Text parts={it} />
              </li>
            ));
            return b.ordered ? (
              <ol key={i} className={`list-decimal ${cls}`}>
                {items}
              </ol>
            ) : (
              <ul key={i} className={`list-disc ${cls}`}>
                {items}
              </ul>
            );
          }
          case "table":
            return (
              // ★ 表だけ横に逃がす。ページ本体が横スクロールしないように。
              <div key={i} className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--neu-lo)]">
                      {b.head.map((c, j) => (
                        <th
                          key={j}
                          className="whitespace-nowrap px-2 py-2 font-bold text-slate-600"
                        >
                          <Text parts={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr
                        key={j}
                        className="border-b border-[color:var(--neu-lo)]/60"
                      >
                        {r.map((c, k) => (
                          <td
                            key={k}
                            className="px-2 py-1.5 tabular-nums text-slate-600"
                          >
                            <Text parts={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-4 pl-3 text-sm leading-relaxed text-slate-600"
                style={{ borderColor: "var(--unit-color)" }}
              >
                <Text parts={b.text} />
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg bg-neu p-3 text-xs leading-relaxed text-slate-700 shadow-neu-inset"
              >
                {b.text}
              </pre>
            );
          case "rule":
            return <hr key={i} className="border-[color:var(--neu-lo)]" />;
        }
      })}
    </div>
  );
}

/**
 * タブとブックマークの名前を記事名にする。
 * ★ **引用される前提の文書**なので、全部が「Sekai-Master」だと、開いたタブも
 *   ブックマークも共有リンクも見分けが付かない。ページを離れたら元に戻す。
 * ★ OGP（SNS のカード）はサーバ側で描く必要があるので、ここでは直せない。宿題。
 */
function useDocTitle(title: string): void {
  useEffect(() => {
    const before = document.title;
    document.title = `${title}｜${SITE_NAME}`;
    return () => {
      document.title = before;
    };
  }, [title]);
}

function StatusBadge({ status }: { status: Entry["status"] }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tone.bg} ${tone.fg}`}
      title={tone.note}
    >
      {status}
    </span>
  );
}

const INTRO =
  "プロセカの計算式・仕様・通例のうち、公式にもゲーム内にも書かれていないものを置いています。このサイトのツールが立っている根拠でもあります。";

function Index() {
  useDocTitle("知見ノート");
  return (
    <ToolPage unit="vs" title="知見ノート" icon="menu_book">
      <p className="text-sm leading-relaxed text-slate-600">
        {INTRO}
        <br />
        この手の知見は個人の記事や投稿に散っていて、
        <b>前提条件・いつの情報か・どこまで確かめられているか</b>
        が抜けたまま伝わりがちです。ここでは結論より先に、その3つを書きます。
      </p>

      <div className="space-y-4">
        {ENTRIES.map((e) => (
          <Link key={e.slug} to={`/knowledge/${e.slug}`} className="block">
            <article className="neu-panel neu-tactile p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 flex-1 font-bold text-slate-700">
                  {e.title}
                </h2>
                <StatusBadge status={e.status} />
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-500">
                <Text parts={e.summary} />
              </p>
              {e.updated && (
                <p className="mt-2 text-xs text-slate-400">
                  最終更新 {e.updated}
                </p>
              )}
            </article>
          </Link>
        ))}
      </div>

      <div className="neu-panel p-5 text-sm leading-relaxed text-slate-600">
        <h2 className="mb-2 font-bold text-slate-700">「状態」の見方</h2>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <b>確定</b> … 独立した2つ以上の根拠が一致しています（例:
            マスタデータ＋実機の計測）
          </li>
          <li>
            <b>有力</b> … 根拠は1つ。反証は見つかっていません
          </li>
          <li>
            <b>未検証</b> … 見聞きした段階です。
            <b>そのまま計算に使わないでください</b>
          </li>
          <li>
            <b>誤り</b> …
            広まっていますが、違うと分かったものです。同じ誤解が繰り返し来るので消さずに残しています
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          誤り・反証・出典の追加を見つけたら教えてください。直したうえで、いつ何で覆ったかを残します。
        </p>
      </div>
    </ToolPage>
  );
}

function Article({ entry }: { entry: Entry }) {
  useDocTitle(entry.title);
  const url = `${SITE_URL}/knowledge/${entry.slug}`;
  return (
    <ToolPage unit="vs" title={entry.title} icon="menu_book">
      <p className="text-xs">
        <Link to="/knowledge" className="text-slate-500 underline">
          ← 知見ノート
        </Link>
      </p>

      <div className="neu-panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={entry.status} />
          <span className="text-xs text-slate-500">
            {STATUS_TONE[entry.status].note}
          </span>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm text-slate-600">
          {entry.meta.map((m) => (
            <div key={m.label} className="flex flex-wrap gap-x-2">
              <dt className="shrink-0 font-bold text-slate-500">{m.label}</dt>
              <dd className="min-w-0 flex-1">
                <Text parts={m.value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <article className="neu-panel p-5 sm:p-6">
        <Blocks blocks={entry.body} />
      </article>

      {/**
       * ★ 引用のための情報を最後に置く。**外の人が参照できる文献**として出す以上、
       *   URL と最終更新が同じ場所に無いと引く側が困る。
       */}
      <div className="neu-panel p-5 text-xs leading-relaxed text-slate-500">
        <h2 className="mb-1.5 text-sm font-bold text-slate-600">
          この記事を引用するとき
        </h2>
        <p>
          {SITE_NAME}「{entry.title}」
          {entry.updated && `（最終更新 ${entry.updated}）`}
          <br />
          <span className="break-all">{url}</span>
        </p>
        <p className="mt-2">
          内容の誤りや、より確からしい根拠を見つけたら教えてください。出典を添えて反映します。
        </p>
      </div>
    </ToolPage>
  );
}

export default function KnowledgePage() {
  const { slug } = useParams();
  if (!slug) return <Index />;
  const entry = ENTRIES.find((e) => e.slug === slug);
  if (!entry) {
    return (
      <ToolPage unit="vs" title="知見ノート" icon="menu_book">
        <div className="neu-panel p-5 text-sm text-slate-600">
          <p>その記事は見つかりませんでした。</p>
          <p className="mt-3">
            <Link to="/knowledge" className="font-bold underline">
              一覧に戻る
            </Link>
          </p>
        </div>
      </ToolPage>
    );
  }
  return <Article entry={entry} />;
}
