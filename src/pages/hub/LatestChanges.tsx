import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { parseChangelog, type Release } from "../legal/changelogParser";
import { shortDate, summaryOf } from "./hubView";

/** 出す件数。スマホは1件だけ（下に長くしない）。 */
const SHOWN = 3;

/**
 * トップの下の更新履歴（直近の版と一行の説明）。
 *
 * ★ CHANGELOG.md（約47KB）はトップの初期表示に載せない（motion/routes.ts の PAGE_LOADERS の注記と同じ方針）。
 *   描画の後に読み込む。更新履歴のページと同じ読み込み先なので、そのページへ移るときは読み込み済みの物が使われる。
 * ★ 読めなければ欄ごと出さない（付け足しの欄でページを落とさない）。
 */
export function LatestChanges() {
  const [releases, setReleases] = useState<Release[] | null>(null);

  useEffect(() => {
    let alive = true;
    import("../../../CHANGELOG.md?raw")
      .then((m) => {
        if (alive) setReleases(parseChangelog(m.default).slice(0, SHOWN));
      })
      .catch(() => {
        if (alive) setReleases([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!releases || releases.length === 0) return null;
  return (
    <section aria-labelledby="hub-changes" className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="hub-changes" className="text-base font-bold text-slate-700">
          更新履歴
        </h2>
        <Link to="/changelog" className="text-sm text-slate-500 underline-offset-2 hover:underline">
          すべて見る →
        </Link>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {releases.map((r, i) => (
          <li key={r.version} className={i > 0 ? "hidden sm:block" : undefined}>
            <Link to="/changelog" className="block h-full rounded-xl px-4 py-3 shadow-neu-sm">
              <span className="flex items-baseline gap-2.5 font-num text-xs tabular-nums text-slate-500">
                <span className="text-sm font-medium text-slate-700">v{r.version}</span>
                <span>{shortDate(r.date)}</span>
              </span>
              <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-slate-600">{summaryOf(r)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
