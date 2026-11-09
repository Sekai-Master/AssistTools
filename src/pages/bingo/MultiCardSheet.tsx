import { useState } from "react";
import { NeuInput } from "../../components/ui/NeuInput";
import { progressOf } from "./bingoProgress";
import { CellSheetFrame } from "./CellSheetFrame";
import { MAX_CARD_NAME } from "./multiStorage";
import type { MultiEntry } from "./useMultiSet";

interface Props {
  entry: MultiEntry;
  /** 見出しに出している名前（名前が空なら「カード1」）。 */
  name: string;
  /** このカードを開くリンク（埋めた状態ごと。今の ?card= と同じ）。 */
  link: string;
  onRename: (name: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

const SUB_BUTTON =
  "mt-3 min-h-11 w-full shrink-0 rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

/**
 * カードの設定（名前・リンクをコピー・外す）。見出しの [設定] から開く。
 * ドロップダウンのメニューは作らず、このページのほかの操作と同じ小窓（CellSheetFrame）にする。
 */
export function MultiCardSheet({ entry, name, link, onRename, onRemove, onClose }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  // 打っている間は下書きに持ち、離れたとき・閉じたときに整えて残す（打つたびに整えると、語の間の空白が打てない）
  const [draft, setDraft] = useState(entry.name);
  const commit = () => {
    if (draft !== entry.name) onRename(draft);
  };
  const close = () => {
    commit();
    onClose();
  };
  const filled = entry.card ? progressOf(entry.card.card).filled : 0;

  // 読めないカードはリンクにしても開けないので、元のコードを写せるようにする（楽曲データが戻れば開ける）
  const copyTarget = entry.card ? link : entry.code;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(copyTarget);
      setMessage(entry.card ? "リンクをコピーしました。開くと、埋めたところまで同じカードが出ます" : "コードをコピーしました");
    } catch {
      setMessage(`${entry.card ? "リンク" : "コード"}: ${copyTarget}`);
    }
  };

  const remove = () => {
    if (filled > 0 && !window.confirm(`${name}を外しますか？埋めたマスも消えます`)) return;
    onRemove();
  };

  return (
    <CellSheetFrame caption="カードの設定" title={name} onClose={close}>
      <label className="mt-4 block text-xs font-bold text-slate-500">
        名前（<span className="font-num">{MAX_CARD_NAME}</span>字まで）
        {/* 16px 未満だと iOS が入力時に画面を拡大する。字数は整える側（cleanCardName）でも切る */}
        <NeuInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={name}
          maxLength={MAX_CARD_NAME * 2}
          className="mt-2 text-base"
        />
      </label>
      <button type="button" onClick={copyLink} className={SUB_BUTTON}>
        {entry.card ? "リンクをコピー" : "コードをコピー"}
      </button>
      <button type="button" onClick={remove} className={SUB_BUTTON}>
        このカードを外す
      </button>
      {message && (
        <p className="mt-3 text-sm break-all text-slate-600" role="status">
          {message}
        </p>
      )}
    </CellSheetFrame>
  );
}
