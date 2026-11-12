import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ToolPage } from "../../components/ui/ToolPage";
import { NeuButton } from "../../components/ui/NeuButton";
import { ZoomableImage } from "../../components/ui/ImageLightbox";
import { CARDS_ZIP, cardSrc, type GuideCard } from "./lib/cards";
import {
  SHARE_RESULT_TEXT,
  browserShareEnv,
  canShareToPhotos,
  fetchCardFiles,
  shareCards,
  type ShareEnv,
} from "./lib/cardsShare";

/**
 * まとめ画像（/guide/cards）。6 枚を 1 枚ずつ保存するか、まとめて保存する。
 *
 * - 「まとめてダウンロード（zip）」はいつも出す（ただのダウンロードのリンク）
 * - 「写真に保存（共有）」は、指で操作する端末でファイルを共有できるときだけ出す（lib/cardsShare.ts）。
 *   パソコンでは OS の共有の画面に「保存」が無いので出さない（検分 G1 の H1）
 * - 一覧は縮小版の WebP を見せ、PNG は保存・共有のときだけ読む
 * ★ iPhone の Safari は、押してから画像を取りに行くと共有を拒むことがある。ボタンに指を置いた・
 *   フォーカスした時点で 6 枚を先読みし、押したときは待たずに共有の画面を開く
 */
export function GuideCards({ cards, env }: { cards: GuideCard[]; env?: ShareEnv }) {
  const base = import.meta.env.BASE_URL;
  const [shareEnv] = useState<ShareEnv>(() => env ?? browserShareEnv());
  // 端末の性質はページを開いている間は変わらないので、最初に 1 回だけ見る
  const [canShare] = useState(() => canShareToPhotos(shareEnv));
  const cached = useRef<File[] | undefined>(undefined);
  const prefetching = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const items = cards.map((c) => ({ url: cardSrc(base, c.file), fileName: `sekaimaster-guide-${c.file}` }));

  const prefetch = () => {
    if (cached.current || prefetching.current) return;
    prefetching.current = true;
    fetchCardFiles({ cards: items }, shareEnv)
      .then((files) => {
        cached.current = files;
      })
      .catch(() => {
        // 押したときに取り直す
      })
      .finally(() => {
        prefetching.current = false;
      });
  };

  const share = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await shareCards({ cards: items, cached: cached.current }, shareEnv, (files) => {
        cached.current = files;
      });
      setNotice(SHARE_RESULT_TEXT[result]);
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
          {canShare && (
            <NeuButton onClick={share} onTouchStart={prefetch} onFocus={prefetch} disabled={busy}>
              {busy ? "準備しています…" : "写真に保存（共有）"}
            </NeuButton>
          )}
          <a
            href={cardSrc(base, CARDS_ZIP)}
            download={CARDS_ZIP}
            className="neu-raised neu-tactile rounded-xl px-4 py-2 text-sm font-bold text-slate-700"
          >
            まとめてダウンロード（zip）
          </a>
          <span role="status" aria-live="polite" className="text-sm text-slate-500">
            {notice}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {canShare
            ? "「写真に保存」は共有の画面を開きます。「画像を保存」を選ぶと 6 枚が写真に入ります。zip は 6 枚をまとめたファイルです。"
            : "zip は 6 枚をまとめたファイルです。1 枚ずつなら、各画像の「保存」を押してください。"}
        </p>
      </div>

      <ol className="grid gap-6 sm:grid-cols-2">
        {cards.map((c) => {
          const src = cardSrc(base, c.file);
          return (
            <li key={c.n} className="rounded-2xl border border-[color:var(--neu-edge)] p-3">
              {/**
               * 一覧も全面表示も縮小版の WebP（幅 1200）。押すと同じタブの中で全面に出す（サイト共通のライトボックス）。
               * ★ fullSrc に PNG（2400×2000）を渡さない。ライトボックスを「原寸」にしたとき幅 390 で 6.4 倍・1 字約 60px に
               *   なって大きすぎる（#259 の検分）。WebP なら約 3.2 倍で、更新履歴の告知画像と同じくらい。PNG は保存・共有だけ
               */}
              <ZoomableImage
                src={cardSrc(base, c.preview)}
                width={c.previewWidth}
                height={c.previewHeight}
                alt={c.alt}
                title={`${c.n}. ${c.title}`}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-700">
                  {c.n}. {c.title}
                </span>
                <a
                  href={src}
                  download={`sekaimaster-guide-${c.file}`}
                  aria-label={`${c.n}. ${c.title} を保存`}
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
