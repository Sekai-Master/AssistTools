import { useEffect } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { NOT_FOUND, PAGES, docTitle, guideChapterMeta } from "../../seo";
import { ACCENT, GuideBlocks } from "./GuideBlocks";
import { GuideCards } from "./GuideCards";
import { GuideStart } from "./GuideStart";
import { CARDS, CHAPTERS, CHAPTER_SOURCES, GUIDE } from "./lib/chapters";
import { chapterParam, type Chapter } from "./lib/guide";

/**
 * 知識ガイド。/guide に前置き（第 0 章）と章の一覧、/guide/:n に章ごと。
 * 入口のページ（/guide/start）とまとめ画像（/guide/cards）も同じ入口（同じチャンク）で出す。
 *
 * ★ 中身の正本は docs/guide/chN.md（読み込みと変換は lib/）。ページ用にデータを持ち直さない。
 * ★ 第 0 章は /guide に載せる。/guide/0 は /guide へ送る（同じ中身を 2 つの URL で出さない。
 *   書き出しの HTML とサイトマップも 1 章から: scripts/seo/write-pages.ts）。
 */

const PREFACE = CHAPTERS.find((c) => c.n === 0);
const BODY_CHAPTERS = CHAPTERS.filter((c) => c.n > 0);

/** タブの名前。章のページは Layout が名前を知らないので、ここで付ける（知見ノートの記事と同じ）。 */
function useChapterTitle(title: string | null): void {
  useEffect(() => {
    if (title != null) document.title = title;
  }, [title]);
}

/**
 * 節のアンカー（/guide/3#s3-2）に着地させる。
 * 遷移の演出は着いたときに先頭へ戻すので、描画が落ち着いてから見出しまで送る。
 * ★ location.key も見る。同じ節のリンクをもう一度押す（hash が同じ）ときも送り直す。
 * ★ 壊れたパーセントエンコード（#%E0%A4）で decodeURIComponent が投げても、ページを落とさない。
 */
function useHashLanding(dep: string): void {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // 生のまま探す
    }
    let tries = 0;
    let timer = 0;
    const go = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ block: "start" });
      else if (tries++ < 20) timer = window.setTimeout(go, 50);
    };
    timer = window.setTimeout(go, 50);
    return () => window.clearTimeout(timer);
  }, [hash, key, dep]);
}

function chapterLabel(c: Chapter): string {
  return `第${c.n}章 ${c.title}`;
}

function Sections({ chapter }: { chapter: Chapter }) {
  if (chapter.sections.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-600">
      {chapter.sections.map((s) => (
        <li key={s.id}>
          <Link to={`/guide/${chapter.n}#${s.id}`} className="underline">
            {s.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Index() {
  useHashLanding("index");
  return (
    <ToolPage unit="vs" title="知識ガイド" icon="auto_stories">
      {/* 入口へのいちばん目立つ導線（初心者向けの層。運営者 2026-11-12） */}
      {GUIDE.start && (
        <Link
          to="/guide/start"
          className="block rounded-2xl border-2 p-4 text-slate-700 sm:p-6"
          style={{ borderColor: ACCENT }}
        >
          <span className="block text-[18px] font-bold">はじめての方は、まずここから</span>
          <span className="mt-1 block text-[15px] leading-relaxed text-slate-600">
            部屋の探し方からスタンプ、休憩まで、{GUIDE.start.sections.length} つの手順で案内します。
          </span>
          <span className="mt-2 block text-sm font-bold underline">{GUIDE.start.title}を読む →</span>
        </Link>
      )}
      <p className="text-sm text-slate-600">
        要点をまとめた画像は
        <Link to="/guide/cards" className="font-bold underline">
          まとめ画像
        </Link>
        から保存・共有できます。
      </p>

      {PREFACE && (
        <article className="neu-panel p-4 sm:p-6">
          <GuideBlocks blocks={PREFACE.blocks} />
        </article>
      )}

      <nav className="neu-panel p-4 sm:p-6" aria-label="章の一覧">
        <h2 className="text-lg font-bold text-slate-700">目次</h2>
        <ol className="mt-4 space-y-5">
          {BODY_CHAPTERS.map((c) => (
            <li key={c.n}>
              <Link to={`/guide/${c.n}`} className="font-bold text-slate-700 underline">
                {chapterLabel(c)}
              </Link>
              <Sections chapter={c} />
            </li>
          ))}
        </ol>
      </nav>

      <p className="text-xs leading-relaxed text-slate-500">
        計算式・仕様を根拠ごとに詳しく書いたものは
        <Link to="/knowledge" className="font-bold underline">
          知見ノート
        </Link>
        にあります。
      </p>
    </ToolPage>
  );
}

function PrevNext({ n }: { n: number }) {
  const prev = CHAPTERS.find((c) => c.n === n - 1);
  const next = CHAPTERS.find((c) => c.n === n + 1);
  return (
    <nav className="grid gap-3 sm:grid-cols-2" aria-label="前後の章">
      {prev ? (
        <Link to={prev.n === 0 ? "/guide" : `/guide/${prev.n}`} className="neu-raised neu-tactile block p-4 text-sm">
          <span className="block text-xs text-slate-500">前の章</span>
          <span className="font-bold text-slate-700">{prev.n === 0 ? "はじめに・目次" : chapterLabel(prev)}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link to={`/guide/${next.n}`} className="neu-raised neu-tactile block p-4 text-right text-sm">
          <span className="block text-xs text-slate-500">次の章</span>
          <span className="font-bold text-slate-700">{chapterLabel(next)}</span>
        </Link>
      )}
    </nav>
  );
}

function ChapterView({ chapter }: { chapter: Chapter }) {
  useHashLanding(String(chapter.n));
  return (
    <ToolPage unit="vs" title={chapterLabel(chapter)} icon="auto_stories">
      <p className="text-xs">
        <Link to="/guide" className="text-slate-500 underline">
          ← 知識ガイドの目次
        </Link>
      </p>

      {chapter.sections.length > 0 && (
        <nav className="neu-panel p-4 sm:p-6" aria-label="この章の節">
          <h2 className="text-sm font-bold text-slate-600">この章の節</h2>
          <Sections chapter={chapter} />
        </nav>
      )}

      <article className="neu-panel p-4 sm:p-6">
        <GuideBlocks blocks={chapter.blocks} />
      </article>

      <PrevNext n={chapter.n} />
    </ToolPage>
  );
}

function NotFoundView() {
  return (
    <ToolPage unit="vs" title="知識ガイド" icon="auto_stories">
      <div className="neu-panel p-4 sm:p-6 text-sm text-slate-600">
        <p>その章は見つかりませんでした。</p>
        <p className="mt-3">
          <Link to="/guide" className="font-bold underline">
            目次に戻る
          </Link>
        </p>
      </div>
    </ToolPage>
  );
}

export default function GuidePage() {
  const { pathname } = useLocation();
  const { n: raw } = useParams();
  // React Router は大文字小文字と末尾の / を区別せずに照合するので、こちらも揃える
  const page = pathname.replace(/\/+$/, "").toLowerCase();
  if (page === "/guide/start") return <StartRoute />;
  if (page === "/guide/cards") return <GuideCards cards={CARDS} />;
  return <ChapterRoute raw={raw} />;
}

function StartRoute() {
  useHashLanding("start");
  return <GuideStart start={GUIDE.start} />;
}

function ChapterRoute({ raw }: { raw: string | undefined }) {
  const n = chapterParam(raw);
  const chapter = n != null && n > 0 ? BODY_CHAPTERS.find((c) => c.n === n) : undefined;
  const src = chapter ? CHAPTER_SOURCES.get(chapter.n) : undefined;
  const meta = chapter && src != null ? guideChapterMeta(chapter.n, src) : null;
  useChapterTitle(
    raw == null ? docTitle("/guide", PAGES["/guide"]) : meta ? docTitle(meta.path, meta) : docTitle("/404", NOT_FOUND),
  );
  if (raw == null) return <Index />;
  if (n === 0) return <Navigate to="/guide" replace />;
  if (!chapter) return <NotFoundView />;
  return <ChapterView chapter={chapter} />;
}
