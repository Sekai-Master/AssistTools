import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { READY_TOOLS } from "../tools";

/**
 * 全ページ共通レイアウト。ニューモーフィズム基調＋グラス質感のヘッダー。
 * PCは「|」区切りの横並びナビ、モバイルはハンバーガーメニュー。
 */
export function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // モバイルメニューを開いている間は Escape で閉じられるようにする。
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-neu/55 backdrop-blur-lg shadow-[0_6px_18px_-8px_rgba(150,150,160,0.45)]">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="neu-raised neu-tactile flex items-center gap-2 pl-2 pr-4 py-1.5 font-bold tracking-wide text-slate-700"
          >
            <img src="/images/icon.webp" alt="" className="h-7 w-7" />
            Sekai-Master
          </Link>

          {/* PC: 「|」区切りの横並びナビ（短縮名で詰まりを防ぐ） */}
          <nav className="hidden md:flex items-center divide-x divide-slate-300/70 text-sm">
            {READY_TOOLS.map((t) => {
              const active = pathname === t.path;
              return (
                <Link
                  key={t.id}
                  to={t.path}
                  title={t.name}
                  className={`px-3 transition-colors ${
                    active ? "text-slate-900 font-bold" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.shortName}
                </Link>
              );
            })}
          </nav>

          {/* モバイル: ハンバーガー */}
          <button
            type="button"
            aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden neu-raised neu-tactile p-2 text-slate-600"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* モバイルメニュー */}
        {menuOpen && (
          <nav id="mobile-nav" className="md:hidden border-t border-white/60 px-4 pb-3 pt-1">
            {READY_TOOLS.map((t) => {
              const active = pathname === t.path;
              return (
                <Link
                  key={t.id}
                  to={t.path}
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 text-sm ${
                    active
                      ? "text-slate-900 font-bold shadow-neu-inset"
                      : "text-slate-600 hover:shadow-neu-sm"
                  }`}
                >
                  {t.name}
                </Link>
              );
            })}
          </nav>
        )}
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
