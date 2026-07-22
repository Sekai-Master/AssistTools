import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { READY_TOOLS } from "../tools";

/**
 * 全ページ共通レイアウト。ニューモーフィズム基調（土台 #f0f0f0）。
 * ヘッダー/フッターは自由に刷新してよい範囲（不可侵はニューモーフィズムとユニットカラー）。
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-neu/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="neu-raised px-4 py-2 font-bold tracking-wide text-slate-700"
          >
            Sekai-Master
          </Link>
          <nav className="hidden md:flex items-center gap-2 text-sm">
            {READY_TOOLS.map((t) => (
              <Link
                key={t.id}
                to={t.path}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:shadow-neu-sm transition-shadow"
              >
                {t.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-8">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-500">
          © 2024 @Noritake All Rights Reserved.
        </div>
      </footer>
    </div>
  );
}
