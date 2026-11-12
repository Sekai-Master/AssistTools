import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { FOCUS_RING } from "../../lib/a11y";
import { jumpToRelease, releaseAnchor } from "./changelogAnchors";

/**
 * 更新履歴の版の目次（2026-11-12 運営者の要望「バージョン目次とか作ってもいいよねぇ」）。
 *
 * - 広い画面（lg 以上）は、本文の右の余白にスクロールしても付いてくる目次（ChangelogSideToc）。
 *   いま読んでいる版に印（aria-current）を付ける
 * - 狭い画面は、ページの上に畳んだ一覧（ChangelogFoldToc）。既定は閉じる
 * - どちらも新しい順に全版。表示は版の番号と日付だけ
 *
 * - 項目を押したときは既定の hash の移動を止め、jumpToRelease（changelogAnchors.ts）で飛ぶ。
 *   理由は、なめらかに動かす（動きを減らす設定では瞬時）・版の見出しにフォーカスを移す・
 *   目次で飛ぶたびに履歴を積まない、の 3 つ。ふつうの hash の移動でも遷移の演出は走らず、
 *   位置も同じになることは実ブラウザで確かめてある（2026-11-12）
 */

export interface TocRelease {
  version: string;
  date: string;
}

/** 版の見出しが「上に過ぎた」とみなす線。sticky のヘッダー（約 64px）と scroll-mt-20（80px）の間。 */
const READ_LINE = 96;

/** 横の目次を出す幅（Tailwind の lg）。これより狭いと横の目次は隠れているので、測らない。 */
const WIDE = "(min-width: 1024px)";

/**
 * いま読んでいる版。READ_LINE を過ぎた最後の版。どれも過ぎていなければ先頭（最新）。
 * ページの一番下まで来たときは最後の版（末尾の短い版は見出しが READ_LINE まで上がりきらない）。
 */
function useActiveVersion(versions: readonly string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(versions[0]);
  useEffect(() => {
    const mql = typeof window.matchMedia === "function" ? window.matchMedia(WIDE) : undefined;
    let frame = 0;
    let listening = false;
    const measure = () => {
      frame = 0;
      let current = versions[0];
      for (const v of versions) {
        const el = document.getElementById(releaseAnchor(v));
        if (!el) continue;
        if (el.getBoundingClientRect().top <= READ_LINE) current = v;
        else break; // 新しい順に上から並んでいるので、ここから先はまだ下
      }
      const root = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= root.scrollHeight - 2) {
        current = versions[versions.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const start = () => {
      if (listening) return;
      listening = true;
      measure();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    };
    const stop = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    // 狭い画面では横の目次が隠れていて印を誰も見ないので、スクロールを購読しない
    const sync = () => (!mql || mql.matches ? start() : stop());
    sync();
    mql?.addEventListener("change", sync);
    return () => {
      mql?.removeEventListener("change", sync);
      stop();
    };
  }, [versions]);
  return active;
}

/**
 * URL に #v〜 を付けて来たときに、その版へ飛ぶ。
 * ページは遅延で読み込むので、ブラウザ自身の hash のスクロールは要素が出る前に終わっていて効かない。
 * （サイトの中に /changelog#… へのリンクは今は無い。足すときは、遷移の演出がスクロールを戻す順番と
 *   ぶつからないか実ブラウザで確かめること）
 */
function useJumpToHashOnArrival(versions: readonly string[]) {
  useEffect(() => {
    let hash: string;
    try {
      hash = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return; // 壊れた hash（#% など）は外から来うる。ページを落とさず、何もしない
    }
    const version = versions.find((v) => releaseAnchor(v) === hash);
    if (!version) return;
    const frame = requestAnimationFrame(() => jumpToRelease(version, { smooth: false }));
    return () => cancelAnimationFrame(frame);
  }, [versions]);
}

function TocItem({ release, current }: { release: TocRelease; current: boolean }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // 新しいタブで開く操作（Ctrl・中ボタンなど）はブラウザに任せる
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    jumpToRelease(release.version);
  };
  return (
    <a
      href={`#${releaseAnchor(release.version)}`}
      onClick={onClick}
      aria-current={current ? "location" : undefined}
      className={`block rounded-md px-2 py-1 leading-tight ${FOCUS_RING} ${
        current
          ? "bg-[color:var(--color-vs)]/15 font-bold text-slate-700"
          : "text-slate-500 hover:bg-slate-500/10 hover:text-slate-700"
      }`}
    >
      <span className="block text-sm">v{release.version}</span>
      <span className="block text-xs tabular-nums">{release.date}</span>
    </a>
  );
}

/**
 * 広い画面の目次。本文の右の余白に置き、スクロールしても付いてくる（sticky）。
 * 置く側は、版の並び全体を包む relative の要素の中に入れる（その高さいっぱいに付いてくる）。
 * mb-0 は、親の space-y が付ける下の余白で付いてくる範囲が縮まないようにするため（space-y の規則は詳細度 0）。
 */
export function ChangelogSideToc({ releases }: { releases: readonly TocRelease[] }) {
  // releases はページのモジュール定数なので参照が変わらない（effect は張り直されない）
  const versions = useMemo(() => releases.map((r) => r.version), [releases]);
  const active = useActiveVersion(versions);
  useJumpToHashOnArrival(versions);
  const navRef = useRef<HTMLElement>(null);

  // 版が多く目次そのものも縦にスクロールするので、印の付いた項目を目次の中で見える所へ送る。
  // ★ scrollIntoView は使わない（ページ全体も動かしてしまう）。目次の箱の scrollTop だけを動かす
  useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!nav || !item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < nav.scrollTop) nav.scrollTop = top - 8;
    else if (bottom > nav.scrollTop + nav.clientHeight) nav.scrollTop = bottom - nav.clientHeight + 8;
  }, [active]);

  return (
    <aside className="absolute top-0 bottom-0 left-full mb-0 ml-4 hidden w-28 lg:block xl:ml-8 xl:w-36">
      <nav
        ref={navRef}
        aria-label="版の目次"
        className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain pr-1"
      >
        <p className="px-2 pb-2 text-xs font-bold text-slate-500">版の目次</p>
        <ol className="space-y-0.5">
          {releases.map((r) => (
            <li key={r.version}>
              <TocItem release={r} current={r.version === active} />
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}

/** 狭い画面の目次。ページの上に畳んで置く（既定は閉じる）。 */
export function ChangelogFoldToc({ releases }: { releases: readonly TocRelease[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <nav aria-label="版の目次（一覧）" className="neu-panel p-2 lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-bold text-slate-600 ${FOCUS_RING}`}
      >
        <span>
          版の目次<span className="ml-2 text-xs font-normal text-slate-500">全 {releases.length} 版・新しい順</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol id={listId} className="mt-2 grid grid-cols-3 gap-1 px-1 pb-1 sm:grid-cols-4">
          {releases.map((r) => (
            <li key={r.version}>
              <TocItem release={r} current={false} />
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

