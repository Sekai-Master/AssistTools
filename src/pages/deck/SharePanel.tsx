import { useRef, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { cardThumbUrl } from "./CardThumb";
import { drawDeckCanvas } from "./lib/deckCanvas";
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
}: {
  deckName: string;
  eventName?: string;
  cards: CatalogCard[];
  states: CardStates;
  evaluated: DeckEval;
  leaderCardId?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const say = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const render = async (): Promise<HTMLCanvasElement | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const accent =
      getComputedStyle(canvas).getPropertyValue("--unit-color").trim() || "#884499";
    await drawDeckCanvas(
      canvas,
      buildShareCard({
        deckName: deckName.trim() || "編成",
        eventName,
        cards,
        states,
        evaluated,
        leaderCardId,
        thumbUrl: cardThumbUrl,
        accent,
      })
    );
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
      {/* 画面には出さない作業用（他ツールの画像出力と同じ作法）。 */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px"
      />
    </Panel>
  );
}
