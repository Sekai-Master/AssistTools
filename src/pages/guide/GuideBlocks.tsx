import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ZoomableImage } from "../../components/ui/ImageLightbox";
import { GuideTerm } from "./GuideTerm";
import type { GuideBlock, GuideInline, Leaf as LeafNode } from "./lib/guide";
import { guideImageSrc, guideImagesOf } from "./lib/images";
import { FIGURES, GUIDE } from "./lib/chapters";
import { STAMPS, stampSrc } from "./lib/stamps";

/**
 * 知識ガイドの本文の描画。章のページは知見ノート（KnowledgePage）の本文にそろえ、
 * 入口のページ（variant="start"）は初心者向けに大きい字・広い行間にする（運営者 2026-11-12「分かりやすさ特化」）。
 */
export type Variant = "body" | "start";

/** 撮影の囲みの色（annotated の画像の #ff3d7f）。手順の番号と ①② の字もこの色にそろえる。 */
export const ACCENT = "#ff3d7f";
/** 字に使うときの色。明るい地では濃くして、文字の読みやすさ（コントラスト）を保つ（サイトの配色と同じ light-dark()）。 */
const ACCENT_INK = "text-[light-dark(#c2185b,#ff6b9d)]";

/** ①〜⑳ を差し色にする（入口のページの、撮影の番号の囲みと対応する字）。 */
function Circled({ text }: { text: string }) {
  const parts = text.split(/([①-⑳])/);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        /^[①-⑳]$/.test(p) ? (
          <span key={i} className={`font-bold ${ACCENT_INK}`}>
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Leaf({ x, variant }: { x: LeafNode; variant: Variant }) {
  const text = (t: string) => (variant === "start" ? <Circled text={t} /> : t);
  if (x.kind === "strong") return <b>{text(x.text)}</b>;
  if (x.kind === "code")
    return <code className="rounded bg-neu px-1 py-0.5 text-[0.9em] shadow-neu-inset">{x.text}</code>;
  if (x.kind === "mark") {
    // 確かさの印。文字は残し、色だけに頼らない（実感・見立て・プレイヤーの間では点線の枠）。
    const soft = x.mark?.tone === "soft";
    return (
      <span
        data-mark={x.mark?.key ?? "unknown"}
        title={x.mark?.note}
        className={`mx-0.5 inline-block whitespace-nowrap rounded border px-1 align-[0.1em] text-[0.72em] font-normal leading-snug text-slate-500 ${
          soft ? "border-dashed border-slate-400" : "border-slate-300"
        }`}
      >
        {x.text}
      </span>
    );
  }
  if (x.kind === "stamp") {
    // 文字・数字のスタンプは絵の中の字が小さく、暗い地に沈むので、大きめに・白い台の上に出す（検分 G1 の L2）
    const textStamp = STAMPS.get(x.asset)?.name.startsWith("[テキストスタンプ]") ?? false;
    return (
      <img
        src={stampSrc(import.meta.env.BASE_URL, x.asset)}
        alt={x.alt}
        width={74}
        height={64}
        loading="lazy"
        decoding="async"
        className={`mr-1 inline-block w-auto align-middle ${
          textStamp ? "h-14 rounded-md bg-white p-0.5 sm:h-20" : "h-12 sm:h-16"
        }`}
      />
    );
  }
  if (x.kind === "term")
    return (
      <GuideTerm text={x.text} entry={x.entry} renderDef={(e) => <GuideText parts={e.def} variant="body" />} />
    );
  return <>{text(x.text)}</>;
}

/** 印のすぐ後の句読点。印と一緒に送って、「。」だけが次の行に落ちないようにする（検分 G1 の L3）。 */
const PUNCT_AFTER_MARK = /^[。、，．）」』]+/;

export function GuideText({ parts, variant = "body" }: { parts: GuideInline[]; variant?: Variant }) {
  return (
    <>
      {parts.map((p, i) => {
        const prev = parts[i - 1];
        if (p.kind === "text" && prev?.kind === "mark" && PUNCT_AFTER_MARK.test(p.text)) {
          // 句読点は直前の印の側で出したので、残りだけ
          const rest = p.text.replace(PUNCT_AFTER_MARK, "");
          return rest ? <Leaf key={i} x={{ kind: "text", text: rest }} variant={variant} /> : null;
        }
        if (p.kind === "mark") {
          const next = parts[i + 1];
          const punct = next?.kind === "text" ? PUNCT_AFTER_MARK.exec(next.text)?.[0] : undefined;
          if (punct)
            return (
              <span key={i} className="whitespace-nowrap">
                <Leaf x={p} variant={variant} />
                {punct}
              </span>
            );
        }
        if (p.kind !== "link") return <Leaf key={i} x={p} variant={variant} />;
        const inner = p.parts.map((x, j) => <Leaf key={j} x={x} variant={variant} />);
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
        /**
         * viewBox の幅は 440。広い画面で伸びすぎないよう上限を付ける。
         * ★ 狭い画面（640px 未満）では縮めずに元の幅で出し、図の枠の中だけ横に送れるようにする。
         *   縮めると字が 7〜8px になって読めない（検分 G1 の M3）。ページ全体は横に動かさない
         */
        <div
          className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0"
          tabIndex={0}
          role="group"
          aria-label={`図${n} ${title}（横に動かせます）`}
          data-figure-scroll
        >
          <div className="mx-auto w-[440px] sm:w-full sm:max-w-[520px]" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      ) : (
        <p className="text-sm text-slate-500">（図{n} は準備中です）</p>
      )}
      <figcaption className="mt-2 text-center text-xs font-bold text-slate-500">
        図{n} {title}
        {svg && <span className="mt-0.5 block font-normal sm:hidden">図は横に動かせます</span>}
      </figcaption>
    </figure>
  );
}

/** ゲームの撮影。押すと同じタブの中で全面に出す（スマホでは縮んで字が読めないので、指で広げて読める）。 */
function Shot({ imageKey, title }: { imageKey: string; title: string }) {
  const files = guideImagesOf(imageKey) ?? [];
  // 囲みを描いた撮影（A1〜）は入口のページ用。番号は読者に意味が無いので題だけ出す
  const caption = /^\d+$/.test(imageKey) ? `画像${imageKey} ${title}` : title;
  return (
    <figure className="!my-6">
      <div className={files.length > 1 ? "grid gap-3 sm:grid-cols-2" : ""}>
        {files.map((f) => {
          const src = guideImageSrc(import.meta.env.BASE_URL, f);
          // 押すと同じタブの中で全面に出す（サイト共通のライトボックス。運営者「ガイド内でも画像置くなら共通処理で」）
          return (
            <ZoomableImage
              key={f.file}
              src={src}
              alt={f.note ? `${title}（${f.note}）` : title}
              width={f.width}
              height={f.height}
              title={f.note ? `${caption}（${f.note}）` : caption}
            />
          );
        })}
        {files.length === 0 && <p className="text-sm text-slate-500">（画像{imageKey} は準備中です）</p>}
      </div>
      <figcaption className="mt-2 text-center text-xs font-bold text-slate-500">{caption}</figcaption>
    </figure>
  );
}

/** スタンプ早見表（docs/guide/stamps.md）。入口のページの手順 6 と第 4 章 4.3 の終わりに同じものを出す。 */
function StampTable() {
  if (GUIDE.stamps.length === 0) return null;
  return (
    <section
      aria-label="スタンプ早見表"
      data-stamps
      className="!my-6 rounded-xl border-2 p-3 sm:p-4"
      style={{ borderColor: ACCENT }}
    >
      <p className="mb-3 text-[17px] font-bold text-slate-700">{GUIDE.stampsTitle}</p>
      <div className="space-y-4">
        {GUIDE.stamps.map((b, i) =>
          b.kind === "table" ? (
            <Fragment key={i}>
              {/* 広い画面は表、狭い画面（640px 未満）は 1 行を 1 枚のカードに（指揮 2026-11-12） */}
              <div className="hidden sm:block" data-stamps-table>
                <GuideBlocks blocks={[b]} variant="start" />
              </div>
              <StampCards table={b} />
            </Fragment>
          ) : (
            <GuideBlocks key={i} blocks={[b]} variant="start" />
          ),
        )}
      </div>
    </section>
  );
}

/** セルが確かさの印だけか（「確かさ」の列）。カードでは見出しを付けずに最後に置く。 */
const onlyMarks = (cell: GuideInline[]) =>
  cell.some((x) => x.kind === "mark") && cell.every((x) => x.kind === "mark" || (x.kind === "text" && !x.text.trim()));

/** 狭い画面のスタンプ早見表。上にスタンプの絵を横に並べ、下に「いつ」「だれが」と確かさの印。 */
function StampCards({ table }: { table: Extract<GuideBlock, { kind: "table" }> }) {
  const heads = table.head.map((h) => h.map((x) => ("text" in x ? x.text : "")).join("").trim());
  const stampCol = table.rows[0]?.findIndex((c) => c.some((x) => x.kind === "stamp")) ?? -1;
  return (
    <ul className="space-y-3 sm:hidden" data-stamps-cards>
      {table.rows.map((r, j) => {
        const marks = r.filter((c, k) => k !== stampCol && onlyMarks(c));
        return (
          <li key={j} className="rounded-lg border border-[color:var(--neu-edge)] bg-[color:var(--neu-hi)] p-3">
            {stampCol >= 0 && (
              <div className="flex flex-wrap gap-1">
                <GuideText parts={r[stampCol]} variant="start" />
              </div>
            )}
            <dl className="mt-2 space-y-1 text-[16px] leading-relaxed text-slate-700">
              {r.map((c, k) =>
                k === stampCol || onlyMarks(c) ? null : (
                  <div key={k} className="flex gap-2">
                    <dt className="w-14 shrink-0 text-sm font-bold text-slate-500">{heads[k]}</dt>
                    <dd className="min-w-0 flex-1">
                      <GuideText parts={c} variant="start" />
                    </dd>
                  </div>
                ),
              )}
            </dl>
            {marks.length > 0 && (
              <p className="mt-1 text-right text-[15px]">
                {marks.map((c, k) => (
                  <GuideText key={k} parts={c} variant="start" />
                ))}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 節の「ひとことで」（docs/guide/summary.md）。見出しのすぐ下に、目立つ枠で。 */
function Summary({ text }: { text: GuideInline[] }) {
  return (
    <p
      data-summary
      className="rounded-lg border-l-4 bg-[color:var(--neu-hi)] px-3 py-2 text-[15px] font-bold leading-relaxed text-slate-700"
      style={{ borderColor: ACCENT }}
    >
      <span className={`mr-2 text-xs ${ACCENT_INK}`}>ひとことで</span>
      <GuideText parts={text} />
    </p>
  );
}

function More({ refs }: { refs: { label: string; to: string }[] }) {
  return (
    <p className="text-sm text-slate-600">
      くわしく →{" "}
      {refs.map((r, i) => (
        <Fragment key={`${r.to}-${i}`}>
          {i > 0 && "・"}
          <Link to={r.to} className="font-bold underline">
            {r.label}
          </Link>
        </Fragment>
      ))}
    </p>
  );
}

export function GuideBlocks({ blocks, variant = "body" }: { blocks: GuideBlock[]; variant?: Variant }) {
  const big = variant === "start";
  const textCls = big ? "text-[17px] leading-loose text-slate-700" : "text-sm leading-relaxed text-slate-600";
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
                <GuideText parts={b.text} variant={variant} />
              </h2>
            ) : (
              <h3 key={i} id={b.id} className="group !mt-8 first:!mt-0 scroll-mt-24 text-base font-bold text-slate-700">
                <GuideText parts={b.text} variant={variant} />
                <a
                  href={`#${b.id}`}
                  className="ml-2 text-sm font-normal text-slate-400 no-underline hover:text-slate-600"
                  aria-label={`「${b.text.map((x) => ("text" in x ? x.text : "")).join("")}」へのリンク`}
                >
                  #
                </a>
              </h3>
            );
          case "para":
            return (
              <p key={i} className={textCls}>
                <GuideText parts={b.text} variant={variant} />
              </p>
            );
          case "list": {
            const cls = `ml-5 space-y-2 ${textCls}`;
            const items = b.items.map((it, j) => (
              <li key={j}>
                <GuideText parts={it} variant={variant} />
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
                {/* 2 列の表は折り返して収める（横に送れることが分かりにくい。L1）。3 列以上は最小の幅を付けて表の中だけ横に送る */}
                <table className={`w-full text-left ${b.head.length > 2 ? "min-w-[22rem]" : ""} ${big ? "text-[15px]" : "text-sm"}`}>
                  <thead>
                    <tr className="border-b border-[color:var(--neu-lo)]">
                      {b.head.map((c, j) => (
                        <th key={j} className="whitespace-nowrap px-2 py-2 font-bold text-slate-600">
                          <GuideText parts={c} variant={variant} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-[color:var(--neu-lo)]/60">
                        {r.map((c, k) => (
                          <td
                            key={k}
                            className={`px-2 py-1.5 align-middle text-slate-600 ${
                              c.some((x) => x.kind === "stamp") ? "min-w-[10.5rem]" : ""
                            }`}
                          >
                            <GuideText parts={c} variant={variant} />
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
                className={`border-l-4 pl-3 ${textCls}`}
                style={{ borderColor: "var(--unit-color)" }}
              >
                <GuideText parts={b.text} variant={variant} />
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
            return <Shot key={i} imageKey={b.key} title={b.title} />;
          case "stamps":
            return <StampTable key={i} />;
          case "summary":
            return <Summary key={i} text={b.text} />;
          case "more":
            return <More key={i} refs={b.refs} />;
        }
      })}
    </div>
  );
}
