import { useState } from "react";
import { ActionButton } from "../../components/ui/ActionButton";
import { NeuButton } from "../../components/ui/NeuButton";
import { SHARE_RESULT_TEXT, browserShareEnv, downloadBlob, shareCard } from "./bingoShare";

interface Props {
  /** 書き出し画像（描き終わるのを待ってから返す）。 */
  getImage: () => Promise<Blob | null>;
  /** このカードを開くリンク。 */
  link: string;
  /** 共有に添える短い文。 */
  text: string;
  fileName: string;
}

/**
 * 共有（主）と、画像の保存・リンクのコピー（副）。結果は短く 1 行で出す。
 * 共有: 画像を送れる端末は共有の画面へ、送れない端末（PC など）は画像をコピー、だめなら保存。
 * ★ 見出しと 1 行で、リンクで埋めたところまで渡せること（別の端末で続き・友だちに見せる）を伝える（持ち主の 6 つ目の要望）。
 *   仕組み（コードに埋めた状態が入る）は書かない。盤面の上や埋めた直後には出さない（盤面を押し下げない。計画のレビュー G-09）。
 *   共有の文・画像に時刻は載せない（持ち主の決定 3）
 */
export function BingoShareBar({ getImage, link, text, fileName }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  const withImage = async (act: (blob: Blob) => Promise<void> | void) => {
    try {
      const blob = await getImage();
      if (!blob) throw new Error("no image");
      await act(blob);
    } catch {
      setMessage("画像を作れませんでした");
    }
  };

  const share = () =>
    withImage(async (blob) => {
      const result = await shareCard(blob, { text, url: link, fileName }, browserShareEnv());
      setMessage(SHARE_RESULT_TEXT[result]);
    });

  const save = () =>
    withImage((blob) => {
      downloadBlob(blob, fileName);
      setMessage(SHARE_RESULT_TEXT.saved);
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("リンクをコピーしました。開くと、埋めたところまで同じカードが出ます（スマホでもPCでも）");
    } catch {
      setMessage(`リンク: ${link}`);
    }
  };

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold text-slate-700">このカードを渡す</h3>
      <p className="mt-1 mb-3 text-sm text-slate-600">
        埋めたところまで、そのまま渡せます。別の端末で続きを遊んだり、友だちに今のカードを見せたりできます
      </p>
      <ActionButton onClick={share} className="min-h-12 w-full text-base">
        共有
      </ActionButton>
      <div className="mt-3 flex gap-3">
        <NeuButton onClick={save} className="min-h-11 flex-1 !px-2 whitespace-nowrap">
          画像を保存
        </NeuButton>
        <NeuButton onClick={copyLink} className="min-h-11 flex-1 !px-2 whitespace-nowrap">
          リンクをコピー
        </NeuButton>
      </div>
      {message && (
        <p className="mt-3 text-sm break-all text-slate-600" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
