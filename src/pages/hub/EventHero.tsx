import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { eventUnitColor } from "../../lib/units";
import { formatMan } from "../../../workers/border/src/posts";
import { formatJst, phaseOf, type Snapshot } from "../border/borderView";
import { elapsedRatio, formatCountdown, logoSrc, rankBar, tickMs } from "./hubView";
import { useCurrentBorder } from "./useCurrentBorder";

/**
 * トップの最初の画面: 開催中のイベントのロゴ・集計までの残り時間・6順位の最終ボーダーの予測。
 *
 * ★ 文字を増やさない（Nori 2026-11-05「画面に文字が多すぎると『うっ』ってなる人は少なくない」）。
 *   説明の文は付けず、数字とバーで読ませる。日程はバーの両端に置き、凡例は色見本にする。
 * ★ スマホは低く保つ（同日「機能へのアクセスを阻害しすぎ」）。ロゴと残り時間を横に並べ、
 *   順位は予測値だけ。バー・「いま」・凡例は sm から。
 * ★ ゲームの素材を増やさない。ロゴ1枚（サイトが既に配っている /CardDatas/logo/）だけ。
 *
 * 開催中のイベントが無い・読めないときは欄ごと出さない（ツールの一覧が最初に来る）。
 */
export function EventHero() {
  const { current } = useCurrentBorder();
  if (!current) return null;
  return <Hero snap={current} />;
}

function Hero({ snap }: { snap: Snapshot }) {
  const ev = snap.event;
  const now = useNow(ev.aggregateAt);
  const running = phaseOf(snap, now) === "running";
  const logo = logoSrc(ev.asset);
  const accent = eventUnitColor(ev.unit);
  const ratio = elapsedRatio(ev, now);
  const name = `第${ev.id}回 ${ev.name}`;

  return (
    <section aria-label="開催中のイベント" className="neu-panel p-4 sm:p-8" style={{ "--accent": accent } as CSSProperties}>
      <div className="flex items-center gap-4 sm:gap-x-12">
        <h2 className="shrink-0">
          {logo ? (
            <img src={logo} alt={name} width={280} height={140} className="block h-auto w-[clamp(7.5rem,30vw,18.75rem)]" />
          ) : (
            <span className="block max-w-[10rem] text-base font-bold text-slate-700 sm:max-w-none sm:text-xl">{name}</span>
          )}
        </h2>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 sm:text-sm">{running ? "集計まで" : "このイベントは終わりました"}</p>
          <p className="font-num text-[clamp(1.75rem,6.4vw,4.5rem)] font-medium leading-tight tabular-nums text-slate-800">
            {running ? formatCountdown(ev.aggregateAt - now) || "集計中" : "終了"}
          </p>
          <div className="mt-2 flex items-center gap-2.5 sm:mt-3">
            <div className="h-1.5 flex-1 rounded-full shadow-neu-inset sm:h-2">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(ratio * 100).toFixed(2)}%` }} />
            </div>
            <span className="font-num text-xs tabular-nums text-slate-500">{Math.round(ratio * 100)}%</span>
          </div>
          <p className="mt-1 hidden justify-between font-num text-xs tabular-nums text-slate-500 sm:flex">
            <span>{formatJst(ev.startAt)}</span>
            <span>{formatJst(ev.aggregateAt)}</span>
          </p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-3 gap-1.5 sm:mt-6 sm:gap-2.5 lg:grid-cols-6">
        {snap.ranks.map((r) => {
          const shown = r.visible && r.predicted != null;
          const bar = shown ? rankBar(r) : null;
          return (
            <li key={r.rank}>
              <Link to="/border" className="block h-full rounded-xl px-2 py-1.5 shadow-neu-inset sm:px-3 sm:py-2.5">
                <span className="block text-xs text-slate-500">
                  {r.rank}位{shown ? "" : "（いま）"}
                </span>
                {/* ★ スマホの3列で「1億2,644万」が「万」だけ次の行に落ち、1段目の枠が高くなった（2026-11-05 の撮影）。折り返さない大きさにする */}
                <span className="block whitespace-nowrap font-num text-[0.9375rem] font-medium tabular-nums text-slate-800 sm:text-xl">
                  {formatMan(shown ? (r.predicted as number) : r.current)}
                </span>
                {bar && (
                  <>
                    <span className="relative mt-2.5 hidden h-1.5 rounded-full bg-slate-200 sm:block" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-full bg-slate-400" style={{ width: `${bar.current}%` }} />
                      <span
                        className="absolute -inset-y-0.5 rounded-sm bg-[var(--accent)] opacity-30"
                        style={{ left: `${bar.low}%`, width: `${bar.band}%` }}
                      />
                      <span className="absolute -inset-y-1 w-0.5 rounded-full bg-[var(--accent)]" style={{ left: `${bar.predicted}%` }} />
                    </span>
                    <span className="mt-1.5 hidden text-xs text-slate-500 sm:block">
                      いま <span className="font-num tabular-nums">{formatMan(r.current)}</span>
                    </span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="hidden items-center gap-3 sm:flex" aria-hidden>
          <Swatch className="h-1.5 w-3 rounded-full bg-slate-400" label="いま" />
          <Swatch className="h-3 w-0.5 rounded-full bg-[var(--accent)]" label="予測" />
          <Swatch className="h-2 w-3 rounded-sm bg-[var(--accent)] opacity-30" label="8割の幅" />
        </span>
        <span>予測・{formatJst(snap.sampleAt)} 時点</span>
      </div>
    </section>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block ${className}`} />
      {label}
    </span>
  );
}

/**
 * 残り時間のために描き直す。この欄の中だけで回す（ページ全体は描き直さない）。
 * 秒を出すのは最終日だけなので、それより前は15秒ごとで足りる。
 */
function useNow(aggregateAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const interval = tickMs(aggregateAt - now);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}
