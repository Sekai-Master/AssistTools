import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { eventUnitColor } from "../../lib/units";
import { formatMan } from "../../../workers/border/src/posts";
import { formatJst, phaseOf, type Snapshot } from "../border/borderView";
import { captionKind, elapsedRatio, endAt, formatCountdown, logoSrc, rankBar, tickMs } from "./hubView";
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
 * まだ一度も読めていないあいだは、同じ形の空の欄で場所を取っておく（後から差し込むと一覧が押し下げられる）。
 */
export function EventHero() {
  const { current, loading } = useCurrentBorder();
  if (current) return <Hero snap={current} />;
  return loading ? <Placeholder /> : null;
}

const CARD = "block h-full rounded-xl px-2 py-1.5 shadow-neu-inset sm:px-3 sm:py-2.5";
const VALUE = "block whitespace-nowrap font-num text-[0.9375rem] font-medium tabular-nums text-slate-800 max-[360px]:text-sm sm:text-xl";

function Hero({ snap }: { snap: Snapshot }) {
  const ev = snap.event;
  const now = useNow(ev.aggregateAt);
  const running = phaseOf(snap, now) === "running";
  const kind = captionKind(snap, running);
  const accent = eventUnitColor(ev.unit);
  const ratio = elapsedRatio(ev, now);

  return (
    <section aria-label={running ? "開催中のイベント" : "直近のイベント"} className="neu-panel p-4 sm:p-8" style={{ "--accent": accent } as CSSProperties}>
      <div className="flex items-center gap-4 sm:gap-x-12">
        <Logo id={ev.id} name={ev.name} asset={ev.asset} />
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
            <span>{formatJst(endAt(ev))}</span>
          </p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-3 gap-1.5 sm:mt-6 sm:gap-2.5 lg:grid-cols-6">
        {snap.ranks.map((r) => {
          // 終わった回は予測でなく、最後に集めた値（実際の着地に近い）を出す
          const shown = running && r.visible && r.predicted != null;
          const bar = shown ? rankBar(r) : null;
          return (
            <li key={r.rank}>
              <Link to="/border" className={CARD}>
                <span className="block text-xs text-slate-500">
                  {r.rank}位{shown || kind === "final" ? "" : "（いま）"}
                </span>
                {/* ★ スマホの3列で「1億2,644万」が「万」だけ次の行に落ち、1段目の枠が高くなった（2026-11-05 の撮影）。折り返さない大きさにする */}
                <span className={VALUE}>{formatMan(shown ? (r.predicted as number) : r.current)}</span>
                {bar && (
                  <>
                    <RankBar bar={bar} />
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
        {kind === "predicted" && (
          <span className="hidden items-center gap-3 sm:flex" aria-hidden>
            <Swatch className="h-1.5 w-3 rounded-full bg-slate-500" label="いま" />
            <Swatch className="h-3 w-0.5 rounded-full bg-slate-800" label="予測" />
            <Swatch className="h-2.5 w-3 rounded-sm border-[1.5px] border-slate-700" label="8割の幅" />
          </span>
        )}
        {Number.isFinite(snap.sampleAt) && (
          <span>
            {kind === "predicted" ? "予測" : kind === "current" ? "いまの値" : "最後に集めた値"}・{formatJst(snap.sampleAt)} 時点
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * ロゴ。読めないとき（素材名がおかしい・ファイルが無い）は名前の文字で出す（歴代ボーダーと同じく壊れた画像を見せない）。
 * ★ ロゴは横 280px で、縦は 80〜177px とばらつく（2026-11-05 に 223 枚を数えた）。2:1 の箱に収めて、読み込みで下がずれないようにする。
 *   原寸より大きくしない（280px まで）。
 */
function Logo({ id, name, asset }: { id: number; name: string; asset: unknown }) {
  const src = logoSrc(asset);
  const [failed, setFailed] = useState(false);
  const label = `第${id}回 ${name}`;
  return (
    <h2 className="shrink-0">
      {src && !failed ? (
        <img
          src={src}
          alt={label}
          width={280}
          height={140}
          onError={() => setFailed(true)}
          className="block aspect-[2/1] h-auto w-[clamp(7.5rem,30vw,17.5rem)] object-contain"
        />
      ) : (
        <span className="block max-w-[10rem] text-base font-bold text-slate-700 sm:max-w-none sm:text-xl">{label}</span>
      )}
    </h2>
  );
}

/**
 * 順位のバー（PC だけ）。いま＝灰色の帯、予測＝濃い縦線、8割の幅＝濃い枠。
 * ★ ユニットの色で塗っていた版は、地とのコントラストが 1.1〜1.7（図形に求める 3:1 を下回る）だった（#194 のレビュー M5）。
 *   MORE MORE JUMP! の緑は明るい地で消える。色は無彩色にして、ユニットの色は経過のバーと見出しに任せる。
 */
function RankBar({ bar }: { bar: NonNullable<ReturnType<typeof rankBar>> }) {
  return (
    <span className="relative mt-2.5 hidden h-1.5 rounded-full bg-slate-200 sm:block" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full bg-slate-500" style={{ width: `${bar.current}%` }} />
      <span className="absolute -inset-y-[3px] rounded-sm border-[1.5px] border-slate-700" style={{ left: `${bar.low}%`, width: `${bar.band}%` }} />
      <span className="absolute -inset-y-1 w-0.5 rounded-full bg-slate-800" style={{ left: `${bar.predicted}%` }} />
    </span>
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

/** 初めて開いたときの、読み込み中の欄。本物と同じ形で場所だけ取る。 */
function Placeholder() {
  return (
    <section aria-label="開催中のイベント（読み込み中）" aria-busy className="neu-panel p-4 sm:p-8">
      <div className="flex items-center gap-4 sm:gap-x-12">
        <span className="block aspect-[2/1] w-[clamp(7.5rem,30vw,17.5rem)] shrink-0 rounded-lg bg-slate-200/60" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-transparent sm:text-sm">集計まで</p>
          <p className="font-num text-[clamp(1.75rem,6.4vw,4.5rem)] font-medium leading-tight text-slate-300">—</p>
          {/* 本物と同じ形の行にする（バーの横の % の字が行の高さを決めている。バーだけだと 8〜10px 低くなった） */}
          <div className="mt-2 flex items-center gap-2.5 sm:mt-3">
            <div className="h-1.5 flex-1 rounded-full shadow-neu-inset sm:h-2" />
            <span className="font-num text-xs text-transparent">0%</span>
          </div>
          <p className="mt-1 hidden text-xs sm:block">&nbsp;</p>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-1.5 sm:mt-6 sm:gap-2.5 lg:grid-cols-6">
        {[50, 100, 200, 500, 1000, 2000].map((rank) => (
          <li key={rank}>
            <span className={CARD}>
              <span className="block text-xs text-slate-500">{rank}位</span>
              <span className={`${VALUE} text-slate-300`}>—</span>
              <span className="mt-2.5 hidden h-1.5 sm:block" />
              <span className="mt-1.5 hidden text-xs sm:block">&nbsp;</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 text-xs">&nbsp;</div>
    </section>
  );
}

/**
 * 残り時間のために描き直す。この欄の中だけで回す（ページ全体は描き直さない）。
 * 秒を出すのは最終日だけなので、それより前は15秒ごと、終わった後は1分ごとで足りる。
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
