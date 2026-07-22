import { Link } from "react-router-dom";
import { TOOLS } from "../tools";

// 各ツールカードのアクセント（ユニット代表色を巡回。装飾用）。
const ACCENTS = ["var(--color-vs)", "var(--color-ln)", "var(--color-mmj)", "var(--color-vbs)", "var(--color-wxs)", "var(--color-n25)"];

/** ランディング（ハブ）。ニューモーフィズム＋ユニットカラー。 */
export function Hub() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="py-12 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-700">
          プロセカをより楽しむためのツール集
        </h1>
        <p className="mt-3 text-slate-500">
          プロセカのゲーム体験を向上させるための様々なツールを提供しています。
        </p>
      </section>

      <section className="pb-16">
        <h2 className="text-lg font-bold mb-4 text-slate-600">ツール一覧</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map((tool, i) => {
            const isReady = tool.status === "ready";
            const accent = ACCENTS[i % ACCENTS.length];
            const card = (
              <div
                className={`h-full neu-panel p-5 transition-transform ${
                  isReady ? "hover:-translate-y-0.5" : "opacity-60"
                }`}
                style={{ borderTop: `4px solid ${accent}` }}
              >
                <span
                  className="material-icons text-3xl"
                  style={{ color: accent }}
                  aria-hidden
                >
                  {tool.icon}
                </span>
                <h3 className="mt-2 font-bold text-slate-700">{tool.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{tool.description}</p>
                <div className="mt-4 text-sm font-bold">
                  {isReady ? (
                    <span style={{ color: accent }}>使う →</span>
                  ) : (
                    <span className="text-slate-400">Coming soon</span>
                  )}
                </div>
              </div>
            );
            return isReady ? (
              <Link key={tool.id} to={tool.path} className="block">
                {card}
              </Link>
            ) : (
              <div key={tool.id}>{card}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
