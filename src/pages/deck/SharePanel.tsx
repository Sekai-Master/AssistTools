import { useRef, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { cardThumbUrl } from "./CardThumb";
import { cardArtUrl, loadCardArt } from "./lib/cardArt";
import { drawDeckCanvas, resolveColor } from "./lib/deckCanvas";
import { buildShareCard, shareFileName } from "./lib/share";
import type { CatalogCard } from "./lib/deckInputs";
import type { CardStates } from "./lib/deckStore";
import type { DeckEval } from "./lib/evaluate";

/**
 * 編成の紹介カード（PNG）。
 *
 * ★ 数字は画面と同じものを使う（buildShareCard が evaluated をそのまま読む）。
 *   画像用に計算し直すと、貼った画像と画面で数字が食い違う事故が起きる。
 *
 * ★ 描いてから出す。押した瞬間に描画するので、編成を変えたあとの
 *   「古い画像が出てくる」が起きない（canvas を状態として持たない）。
 */
export function SharePanel({
  deckName,
  eventName,
  cards,
  states,
  evaluated,
  leaderCardId,
  hideBonus,
}: {
  deckName: string;
  /** チャレンジライブではイベントボーナスの欄を出さない。 */
  hideBonus?: boolean;
  eventName?: string;
  cards: CatalogCard[];
  states: CardStates;
  evaluated: DeckEval;
  leaderCardId?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 立ち絵を取れずに簡易版で描いたか。黙って別物を出さない。 */
  const [simple, setSimple] = useState(false);

  const say = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const render = async (): Promise<HTMLCanvasElement | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // ★ ユニット色は light-dark() で定義されている。canvas は解釈できないので、
    //   ブラウザに計算させた rgb() へ解決してから渡す（渡さないと描画が落ちる）。
    const accent = resolveColor(canvas, "var(--unit-color)");

    /**
     * リーダーの立ち絵だけ、その場で配信元から取る。
     * ★ 立ち絵はリポジトリに持っていない（全カードで50〜200MB になるため）。
     * ★ **取れなくても止めない。** null ならサムネイルだけの簡易版で描く。
     */
    const leader = cards.find((c) => c.id === leaderCardId) ?? cards[0];
    const s = leader ? states[leader.id] : undefined;
    const url = leader ? cardArtUrl(leader, !!s?.trained && !s?.artUntrained) : null;
    const heroArt = url ? await loadCardArt(url) : null;
    setSimple(!heroArt);

    await drawDeckCanvas(canvas, {
      ...buildShareCard({
        deckName: deckName.trim() || "編成",
        eventName,
        cards,
        states,
        evaluated,
        leaderCardId,
        thumbUrl: cardThumbUrl,
        accent,
        hideBonus,
      }),
      heroArt,
    });
    return canvas;
  };

  const copy = async () => {
    const canvas = await render();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        say("画像をコピーしました。");
      } catch {
        say("コピーに失敗しました（保存をお使いください）。");
      }
    }, "image/png");
  };

  const save = async () => {
    const canvas = await render();
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = shareFileName(deckName);
    a.click();
    say("画像を保存しました。");
  };

  if (cards.length === 0) return null;

  return (
    <Panel title="紹介カード">
      <p className="text-sm text-slate-500">
        編成のカード5枚と、総合力・イベントボーナス・スキル値を1枚の画像にします。
        リーダーの立ち絵だけ、書き出すときに配信元から読み込みます（サイトには持っていません）。
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <NeuButton onClick={copy}>画像をコピー</NeuButton>
        <NeuButton onClick={save}>画像を保存</NeuButton>
        {notice && (
          <span role="status" className="text-xs text-slate-600">
            {notice}
          </span>
        )}
      </div>
      {simple && (
        <p className="mt-2 text-xs text-amber-600">
          立ち絵を読み込めなかったので、サムネイルだけの簡易版で書き出しました（数字は同じです）。
        </p>
      )}
      {/* 画面には出さない作業用（他ツールの画像出力と同じ作法）。 */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px"
      />
    </Panel>
  );
}
