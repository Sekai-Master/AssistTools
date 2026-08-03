import { Link } from "react-router-dom";
import { COPYRIGHT_SINCE, OWNER_NAME, REPO_URL, X_HANDLE, X_URL } from "../lib/site";

/**
 * サイト全体のフッター。
 *
 * ★ ここが規約・ポリシー・更新履歴への唯一の導線。ヘッダーはツールに使うので、
 *   読み物はここへ集める。「どこにも無い」より「常に足元にある」が正しい。
 *
 * ★ バージョンとデータ更新日を並べて出しているのは、この2つが別系統で動くから
 *  （docs/versioning.md）。毎日のデータ更新ではバージョンは上がらない。
 *   片方だけ見せると「何日も更新されていないサイト」に見える。
 */

/** ISO 文字列を JST の YYYY-MM-DD にする。空・不正なら null（＝表示ごと落とす）。 */
export function formatDataDate(iso: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
  return parts;
}

const LINK = "hover:text-slate-700 transition-colors";

export function SiteFooter() {
  const dataDate = formatDataDate(__CARD_DATA_GENERATED_AT__);
  const thisYear = new Date().getFullYear();
  const years = thisYear > COPYRIGHT_SINCE ? `${COPYRIGHT_SINCE}-${thisYear}` : `${COPYRIGHT_SINCE}`;

  return (
    <footer className="mt-8 border-t border-[color:var(--neu-edge)]">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-8 text-center text-xs text-slate-500">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/terms" className={LINK}>
            利用規約
          </Link>
          <Link to="/privacy" className={LINK}>
            プライバシーポリシー
          </Link>
          <Link to="/changelog" className={LINK}>
            更新履歴
          </Link>
          <a href={X_URL} target="_blank" rel="noreferrer noopener" className={LINK}>
            {X_HANDLE}
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className={LINK}>
            GitHub
          </a>
        </nav>

        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-slate-400">
          <Link to="/changelog" className={LINK} title="更新履歴を見る">
            v{__APP_VERSION__}
          </Link>
          {dataDate && (
            <span title="カード・イベントデータを最後に取り込んだ日（日本時間）">
              データ更新 {dataDate}
            </span>
          )}
        </p>

        <p className="text-slate-400">
          本サイトは非公式のファンサイトであり、株式会社セガおよび Colorful Palette Inc.
          とは関係ありません。
        </p>

        <p>
          © {years} {OWNER_NAME} All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}
