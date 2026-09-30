/**
 * 公開日（publishedAt）を過ぎた曲だけを配信データに入れる（2026-09-30 Nori「公開日準拠で」）。
 *
 * ★ カードと同じく、公式の公開前のデータはサイトに出さない（曲名もジャケットも）。
 *   以前は公開前の曲も published:false で配信データに入れ、ジャケットまで取りに行っていた
 *  （画面には出ないが、JSON を開けば曲名が読めた）。
 * ★ 毎日の更新が公開日を過ぎた最初の回で拾うので、失うものは無い。
 */

const isReleased = (m, now) => typeof m?.publishedAt === "number" && m.publishedAt <= now;

/** 公開済み（公開日ちょうどを含む）と公開前に分ける。公開日が読めない曲は出さない側に倒す。 */
export function splitByRelease(musics, now) {
  const list = (Array.isArray(musics) ? musics : []).filter((m) => m && typeof m === "object");
  return {
    released: list.filter((m) => isReleased(m, now)),
    upcoming: list.filter((m) => !isReleased(m, now)),
  };
}

/** 書き出す直前の検算。公開前の曲が混ざっていれば「id 曲名」を挙げる（空なら安全）。 */
export function auditUnreleased(transformed, now) {
  return transformed.filter((m) => !isReleased(m, now)).map((m) => `${m.id} ${m.title}`);
}
