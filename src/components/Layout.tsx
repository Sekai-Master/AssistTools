import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Settings2, X } from "lucide-react";
import { READY_TOOLS } from "../tools";
import { resolveTheme, usePrefersDark, useTheme } from "../lib/theme";
import { SiteFooter } from "./SiteFooter";

/**
 * 全ページ共通レイアウト。ニューモーフィズム基調＋グラス質感のヘッダー。
 *
 * ヘッダーは中身を最大幅で締めず、**ロゴは左端・設定は右端まで寄せ切る**。
 * バーは画面の端から端までの帯なので、その中身だけ中央 1024px に収めると
 * 帯と中身の幅が食い違って落ち着かない。本文（main）だけが最大幅を持つ。
 */
export function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  // ★ プルダウン（PC）とシート（モバイル）で別々に持つ。1つの ref を両方に
  //   付けると後から描画された方で上書きされ、外側クリック判定が片方で壊れる。
  const menuRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dark = resolveTheme(useTheme(), usePrefersDark()) === "dark";

  // 主要ツール ＋ いま開いているツール（主要でなければ）。定義順のまま並べる。
  // 現在地を必ず含めるのは、主要でないツールに居るとき「ナビのどこにも
  // 自分が居ない」状態を作らないため。
  const navTools = READY_TOOLS.filter((t) => t.primary || t.path === pathname);

  // 開いている間だけ Escape と外側クリックで閉じられるようにする。
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || sheetRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-[color:var(--neu-edge)] bg-neu/55 backdrop-blur-lg shadow-[0_6px_18px_-8px_rgba(150,150,160,0.45)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            to="/"
            onClick={close}
            className="neu-raised neu-tactile flex shrink-0 items-center gap-2 pl-2 pr-4 py-1.5 font-bold tracking-wide text-slate-700"
          >
            {/* アイコンは「明るい素材の板の上に花弁が乗っている」絵で、板そのものが
                画像に焼き込まれている。素の icon.webp は板の外側が純白で埋まっていて
                四隅だけ白く見えるうえ、暗い配色では板ごと白い四角として浮く。
                ヘッダー用は四隅を透過させ、暗所版は中立色を暗い素材へ移し替えてある
                （生成: scripts/make-header-icons.mjs）。 */}
            <img
              src={dark ? "/images/icon-dark.webp" : "/images/icon-light.webp"}
              alt=""
              className="h-7 w-7"
            />
            Sekai-Master
          </Link>

          {/* PC: 「|」区切りの横並びナビ。ロゴのすぐ隣に置いて左詰めにする。
              全ツールは並べない（9個は詰まるし「全部同じ重要度」に見える）。
              残りはハンバーガーのプルダウンから辿る。 */}
          <nav className="hidden md:flex items-center divide-x divide-slate-300/70 text-sm">
            {navTools.map((t) => {
              const active = pathname === t.path;
              return (
                <Link
                  key={t.id}
                  to={t.path}
                  title={t.name}
                  // 太字ぶんの幅を常に確保して、選択が移ってもナビがずれないようにする。
                  data-label={t.shortName}
                  className={`nav-steady px-3 transition-colors ${
                    active ? "text-slate-900 font-bold" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.shortName}
                </Link>
              );
            })}
          </nav>

          {/* 右端まで寄せ切る。ml-auto なので中央に浮かない。 */}
          <div ref={menuRef} className="relative ml-auto flex shrink-0 items-center gap-2">
            {/* 設定。ツールではないので READY_TOOLS のナビには入れない。 */}
            <Link
              to="/settings"
              aria-label="設定"
              title="設定"
              onClick={close}
              className="neu-raised neu-tactile p-2 text-slate-600"
            >
              <Settings2 className="h-5 w-5" />
            </Link>

            {/* 全サイズ共通のメニューボタン。PC ではプルダウン、モバイルでは
                ヘッダー下のシートを開く。ハブへ飛ばしてしまうと、いま開いている
                ツールから追い出されるので行き先はこの場のメニューにする。 */}
            <button
              type="button"
              aria-label={menuOpen ? "ツール一覧を閉じる" : "ツール一覧を開く"}
              aria-expanded={menuOpen}
              aria-controls="tool-menu"
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="neu-raised neu-tactile p-2 text-slate-600"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* PC: ボタンの真下に出すプルダウン */}
            {menuOpen && (
              <div
                id="tool-menu"
                className="neu-panel absolute right-0 top-full z-50 mt-2 hidden w-64 p-2 md:block"
              >
                <ToolMenu pathname={pathname} onNavigate={close} />
              </div>
            )}
          </div>
        </div>

        {/* モバイル: ヘッダー下に開くシート（幅が無いのでプルダウンにしない） */}
        {menuOpen && (
          <div ref={sheetRef} className="md:hidden border-t border-[color:var(--neu-edge)] px-4 pb-3 pt-1">
            <ToolMenu pathname={pathname} onNavigate={close} />
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}

/** ツール全件。PC のプルダウンとモバイルのシートで同じものを出す。 */
function ToolMenu({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav>
      {READY_TOOLS.map((t) => {
        const active = pathname === t.path;
        return (
          <Link
            key={t.id}
            to={t.path}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
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
  );
}
