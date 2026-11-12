import { Link } from "react-router-dom";
import type { GuideBlock, GuideInline } from "./lib/guide";
import { guideImageSrc, guideImagesOf } from "./lib/images";
import { FIGURES } from "./lib/chapters";

/**
 * 知識ガイドの本文の描画。見た目は知見ノート（KnowledgePage）の本文にそろえている。
 * ★ 見た目の仕上げ（印・節の飾り・余白）は指揮の設計待ち（2026-11-12）。ここは骨組みの最小限。
 */

function Leaf({ x }: { x: Exclude<GuideInline, { kind: "link" }> }) {
  if (x.kind === "strong") return <b>{x.text}</b>;
  if (x.kind === "code")
    return <code className="rounded bg-neu px-1 py-0.5 text-[0.9em] shadow-neu-inset">{x.text}</code>;
  if (x.kind === "mark") {
    // 確かさの印。文字は残し、色だけに頼らない（実感・見立て・プレイヤーの間では点線の枠）。
    const soft = x.mark?.tone === "soft";
    return (
      <span
        data-mark={x.mark?.key ?? "unknown"}
        title={x.mark?.note}
        className={`mx-0.5 inline-block whitespace-nowrap rounded border px-1 align-[0.1em] text-[0.75em] leading-snug text-slate-500 ${
          soft ? "border-dashed border-slate-400" : "border-slate-300"
        }`}
      >
        {x.text}
      </span>
    );
  }
  return <>{x.text}</>;
}

export function GuideText({ parts }: { parts: GuideInline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind !== "link") return <Leaf key={i} x={p} />;
        const inner = p.parts.map((x, j) => <Leaf key={j} x={x} />);
        return p.to ? (
          <Link key={i} to={p.to} className="font-bold underline">
            {inner}
          </Link>
        ) : (
          <a key={i} href={p.href} target="_blank" rel="noreferrer noopener" className="font-bold underline">
            {inner}
          </a>
        );
      })}
    </>
  );
}

/**
 * 図。SVG を文字列のまま埋め込む（img だとサイトの CSS 変数が効かず、ダークモードで崩れる）。
 * ★ dangerouslySetInnerHTML を使うのはここだけ。中身は src/pages/guide/figures/ の静的なファイルで、
 *   外からの入力は入らない（guide.test.ts が script・on〜 の属性・外への参照が無いことを見ている）。
 */
function Figure({ n, title }: { n: number; title: string }) {
  const svg = FIGURES.get(n);
  return (
    <figure className="!my-6">
      {svg ? (
        // viewBox の幅は 440。広い画面で伸びすぎないよう上限を付ける
        <div className="mx-auto w-full max-w-[520px]" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="text-sm text-slate-500">（図{n} は準備中です）</p>
      )}
      <figcaption className="mt-2 text-center text-xs font-bold text-slate-500">
        図{n} {title}
      </figcaption>
    </figure>
  );
}

/** ゲームの撮影。押すと原寸を新しいタブで開く（スマホでは縮んで字が読めないので）。 */
function Shot({ n, title }: { n: number; title: string }) {
  const files = guideImagesOf(n) ?? [];
  return (
    <figure className="!my-6">
      <div className={files.length > 1 ? "grid gap-3 sm:grid-cols-2" : ""}>
        {files.map((f) => {
          const src = guideImageSrc(import.meta.env.BASE_URL, f);
          return (
            <a key={f.file} href={src} target="_blank" rel="noopener" className="block">
              <img
                src={src}
                alt={f.note ? `${title}（${f.note}）` : title}
                width={f.width}
                height={f.height}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full rounded-lg border border-slate-300"
              />
              <span className="sr-only">（原寸を新しいタブで開く）</span>
            </a>
          );
        })}
        {files.length === 0 && <p className="text-sm text-slate-500">（画像{n} は準備中です）</p>}
      </div>
      <figcaption className="mt-2 text-center text-xs font-bold text-slate-500">
        画像{n} {title}
      </figcaption>
    </figure>
  );
}

export function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return b.level === 2 ? (
              <h2
                key={i}
                id={b.id}
                className="!mt-8 first:!mt-0 scroll-mt-24 border-l-4 pl-3 text-lg font-bold text-slate-700"
                style={{ borderColor: "var(--unit-color)" }}
              >
                <GuideText parts={b.text} />
              </h2>
            ) : (
              <h3 key={i} id={b.id} className="group !mt-8 first:!mt-0 scroll-mt-24 text-base font-bold text-slate-700">
                <GuideText parts={b.text} />
                <a
                  href={`#${b.id}`}
                  className="ml-2 text-sm font-normal text-slate-400 no-underline hover:text-slate-600"
                  aria-label="この節へのリンク"
                >
                  #
                </a>
              </h3>
            );
          case "para":
            return (
              <p key={i} className="text-sm leading-relaxed text-slate-600">
                <GuideText parts={b.text} />
              </p>
            );
          case "list": {
            const cls = "ml-5 space-y-2 text-sm leading-relaxed text-slate-600";
            const items = b.items.map((it, j) => (
              <li key={j}>
                <GuideText parts={it} />
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
              // 表だけ横に逃がす。ページ本体が横スクロールしないように。
              <div key={i} className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--neu-lo)]">
                      {b.head.map((c, j) => (
                        <th key={j} className="whitespace-nowrap px-2 py-2 font-bold text-slate-600">
                          <GuideText parts={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-[color:var(--neu-lo)]/60">
                        {r.map((c, k) => (
                          <td key={k} className="px-2 py-1.5 align-top text-slate-600">
                            <GuideText parts={c} />
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
                <GuideText parts={b.text} />
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
          case "figure":
            return <Figure key={i} n={b.n} title={b.title} />;
          case "image":
            return <Shot key={i} n={b.n} title={b.title} />;
        }
      })}
    </div>
  );
}
