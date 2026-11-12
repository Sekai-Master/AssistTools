import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { NeuButton } from "../../components/ui/NeuButton";
import { CARDS_ZIP, cardSrc, type GuideCard } from "./lib/cards";
import { SAVE_ALL_TEXT, browserSaveAllEnv, saveAllCards, type SaveAllEnv } from "./lib/cardsShare";

/**
 * まとめ画像（/guide/cards）。6 枚を 1 枚ずつ保存するか、まとめて保存する。
 * まとめて保存は、スマホでは共有シート（「画像を保存」で写真に入る）、PC では zip（lib/cardsShare.ts）。
 */
export function GuideCards({ cards, env }: { cards: GuideCard[]; env?: SaveAllEnv }) {
  const base = import.meta.env.BASE_URL;
  const cached = useRef<File[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const saveAll = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveAllCards(
        {
          cards: cards.map((c) => ({ url: cardSrc(base, c.file), fileName: `sekaimaster-guide-${c.file}` })),
          zip: { url: cardSrc(base, CARDS_ZIP), fileName: CARDS_ZIP },
          cached: cached.current,
        },
        env ?? browserSaveAllEnv(),
        (files) => {
          cached.current = files;
        },
      );
      setNotice(SAVE_ALL_TEXT[result]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage unit="vs" title="まとめ画像" icon="collections">
      <p className="text-xs">
        <Link to="/guide" className="text-slate-500 underline">
          ← 知識ガイドの目次
        </Link>
      </p>

      <div className="rounded-2xl border border-[color:var(--neu-edge)] p-4 text-[16px] leading-relaxed text-slate-700 sm:p-6">
        <p>
          <Link to="/guide/start" className="font-bold underline">
            はじめての周回
          </Link>
          の要点を 6 枚の画像にまとめました。友だちに送ったり、周回の前に見返したりするのに使ってください。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <NeuButton onClick={saveAll} disabled={busy}>
            {busy ? "準備しています…" : "まとめて保存（6 枚）"}
          </NeuButton>
          <span role="status" aria-live="polite" className="text-sm text-slate-500">
            {notice}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          スマホでは共有の画面が開きます（「画像を保存」で写真に入ります）。パソコンでは 6 枚をまとめた zip を保存します。
        </p>
      </div>

      <ol className="grid gap-6 sm:grid-cols-2">
        {cards.map((c) => {
          const src = cardSrc(base, c.file);
          return (
            <li key={c.n} className="rounded-2xl border border-[color:var(--neu-edge)] p-3">
              <a href={src} target="_blank" rel="noopener" className="block">
                <img
                  src={src}
                  alt={c.alt}
                  width={c.width}
                  height={c.height}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full rounded-lg border border-slate-300"
                />
                <span className="sr-only">（原寸を新しいタブで開く）</span>
              </a>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-700">
                  {c.n}. {c.title}
                </span>
                <a
                  href={src}
                  download={`sekaimaster-guide-${c.file}`}
                  className="neu-raised neu-tactile shrink-0 rounded-full px-3 py-1 text-xs font-bold text-slate-600"
                >
                  保存
                </a>
              </div>
            </li>
          );
        })}
      </ol>
    </ToolPage>
  );
}
