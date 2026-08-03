import type { ReactNode } from "react";

/**
 * 規約・ポリシーの文書用パーツ。
 *
 * 条文の入れ物をツールの Panel と分けているのは、ここが「読むための画面」で
 * 操作が無いから。ツールと同じ厚みのパネルで区切ると、短い条が並ぶだけで
 * 段差だらけになって読み進められない。区切りは細い線1本で足りる。
 */

export function DocIntro({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-7 text-slate-600">{children}</p>;
}

/** 施行日・最終改訂日。文書の頭に置く。 */
export function DocMeta({ effective, revised }: { effective: string; revised?: string }) {
  return (
    <p className="text-xs text-slate-500">
      施行日: {effective}
      {revised && revised !== effective && <> ／ 最終改訂日: {revised}</>}
    </p>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[color:var(--neu-edge)] pt-5">
      <h2 className="text-base font-bold text-slate-700">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
    </section>
  );
}

export function DocList({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-1.5 marker:text-slate-400">{children}</ul>;
}

/**
 * 用語や外部サイトへのリンク。外部は新しいタブで開く。
 *
 * ★ わざと太字にしていない。リンクは色と下線で十分に分かるし、ここで
 *   font-medium を使うと**この2ページのためだけに 500 の字重（83KB）を
 *   追加でダウンロードさせる**ことになる（実測）。読み物のページで
 *   装飾のために1割近い転送量を足す価値は無い。
 */
export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="text-[color:var(--unit-color)] underline underline-offset-2"
    >
      {children}
    </a>
  );
}
