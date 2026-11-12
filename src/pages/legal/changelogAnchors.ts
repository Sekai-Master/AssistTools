/**
 * 更新履歴の版のアンカー（ChangelogPage の版の枠の id と、目次 ChangelogToc の飛び先）。
 * 部品のファイルから関数を export すると Fast Refresh が効かなくなるので、ここに分けた。
 */

/** 版の枠（article）の id。目次の飛び先と同じ値を使う。 */
export const releaseAnchor = (version: string) => `v${version}`;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * その版の枠へ飛び、URL に #v〜 を残し、見出しにフォーカスを移す（読み上げとキーボードの続きをそこから始める）。
 *
 * - URL は replaceState で書き換える。目次で飛ぶたびに履歴を積まないので、「戻る」は前のページへ戻る
 *  （目次の移動を一つずつ戻ることはない）
 */
export function jumpToRelease(version: string, { smooth = true } = {}) {
  const id = releaseAnchor(version);
  const article = document.getElementById(id);
  if (!article) return;
  article.scrollIntoView({ behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto", block: "start" });
  // ルーターが history.state に持つ値（idx・key）を消さないよう、state はそのまま渡す
  window.history.replaceState(window.history.state, "", `#${id}`);
  article.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
}
