import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  /** いま休止しているか。 */
  paused: boolean;
  onRename: (name: string) => void;
  /** 休止する（true）／再開する（false）。押したら小窓を閉じる（盤面の帯で結果が見える）。 */
  onPause: (paused: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * 名前の入力の上限（maxLength は UTF-16 の数で数える）。保存は [...s] で 16 字（cleanCardName）なので、
 * 絵文字など 2 つに数える字の分だけ広げる。これで入力が保存の上限を超えず、閉じたときに黙って切られない（検分 M1 低-6）。
 * 上限は今の字から数えるので、絵文字を貼る・15 字目に絵文字を打つときは 16 字より手前で止まることがある（超えることはない）。
 * ★ onChange で字を切らない。日本語の変換中に値を書き換えると、変換が崩れる
 */
const nameLimit = (s: string) => MAX_CARD_NAME + (s.length - [...s].length);

const SUB_BUTTON =
  "mt-3 min-h-11 w-full shrink-0 rounded-lg text-sm font-bold text-slate-600 hover:bg-[color:color-mix(in_srgb,var(--neu-ink)_9%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--unit-color)]";

/**
 * カードの設定（名前・リンクをコピー・休止・外す）。見出しの [設定] から開く。
 * ドロップダウンのメニューは作らず、このページのほかの操作と同じ小窓（CellSheetFrame）にする。
 */
export function MultiCardSheet({ entry, name, link, paused, onRename, onPause, onRemove, onClose }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  // 打っている間は下書きに持ち、離れたとき・閉じたときに整えて残す（打つたびに整えると、語の間の空白が打てない）
  const [draft, setDraft] = useState(entry.name);
  const commit = () => {
    if (draft !== entry.name) onRename(draft);
  };
  // ★ 小窓の作法（useModalA11y）は onClose が変わるたびに掛け直し、そのたびにフォーカスを開く前の要素へ戻してから
  //   小窓の先頭（閉じる）へ移す。下書きを同じ部品に持つので、描くたびに作る close を渡すと、1 字打つごとに欄から
  //   フォーカスが外れ、キーでは 2 字目から入らず、変換も途中で確定された（検分 M1b 新-高-1）。
  //   BingoCardGrid と同じく変わらない関数を渡し、閉じるときの下書きは ref から読む
  const latest = useRef({ commit, onClose });
  useLayoutEffect(() => {
    latest.current = { commit, onClose };
  });
  const close = useCallback(() => {
    latest.current.commit();
    latest.current.onClose();
  }, []);
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
        {/* 16px 未満だと iOS が入力時に画面を拡大する。字数は入力で止め、整える側（cleanCardName）でも切る */}
        <NeuInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={name}
          maxLength={nameLimit(draft)}
          className="mt-2 text-base"
        />
      </label>
      <button type="button" onClick={copyLink} className={SUB_BUTTON}>
        {entry.card ? "リンクをコピー" : "コードをコピー"}
      </button>
      {/* 読めないカードは盤面が無く、休止しても見た目が変わらないので出さない（休止中のまま読めなくなったときは戻せるように残す） */}
      {(entry.card || paused) && (
        <>
          <button
            type="button"
            onClick={() => {
              commit();
              onPause(!paused);
            }}
            className={SUB_BUTTON}
          >
            {paused ? "再開する" : "休止する"}
          </button>
          <p className="mt-1 text-center text-xs text-slate-500">休止中は、遊んだ曲を反映せず、マスも押せません</p>
        </>
      )}
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
