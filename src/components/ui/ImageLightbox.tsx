import { useCallback, useId, useRef, useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import { FOCUS_RING, useModalA11y } from "../../lib/a11y";

/**
 * 画像を同じタブの中で画面いっぱいに出す（ライトボックス）。更新履歴の告知画像と、
 * 知識ガイドの撮影・まとめ画像で共通に使う。
 *
 * - 以前は `<a target="_blank">` で原寸を新しいタブで開いていた。タブが増えて戻りにくいので、
 *   ページの上に重ねて出し、閉じれば元の位置に戻るようにした（2026-11-12 運営者の要望）
 * - 作法はほかのモーダルと同じ: ポータルを使わない `fixed inset-0 z-50`、`data-overlay` の印、
 *   `useModalA11y`（Esc・背面スクロールの停止・フォーカスの巡回と戻し）
 * - 画像は縦横どちらも画面に収める（はみ出さない）。原寸より大きくはしない
 * - **ブラウザの拡大（ピンチ）は止めない。** touch-action や touch の preventDefault を書かない。
 *   スマホでは全面に出しても字が小さいので、指で広げて読む前提
 * - 幕と文字は黒と白の固定値。このサイトの slate はダークで階調が反転するので使わない
 * - 読み上げ: ダイアログの名前は題、説明（aria-describedby）は画像の alt。開いた直後にフォーカスが
 *   「閉じる」に入っても、画像の中身まで伝わる
 *
 * ★ onClose は useCallback などで固定して渡すこと。useModalA11y の deps に入るので、毎回作り直すと
 *   スクロール停止とフォーカスの記憶がやり直され、閉じたときのフォーカスの戻し先が狂う
 */
export function ImageLightbox({
  open,
  onClose,
  src,
  alt,
  title,
  width,
  height,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  /** 読み上げのラベルと、画像の下の題。無いときは「画像の拡大表示」。長い alt はラベルにしない（説明として結ぶ）。 */
  title?: string;
  width?: number;
  height?: number;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const imgId = useId();
  // 押し始めが画像の上だったか。画像の上で押して背景で離したときに閉じないため
  const downOnImage = useRef(false);
  useModalA11y(open, onClose, dialogRef);
  if (!open) return null;

  /** 画像と操作部品（閉じるボタン）以外を押したら閉じる。余白のどこを押しても閉じられるように。 */
  const isBackdrop = (target: EventTarget) =>
    target instanceof Element && !target.closest("img, button");

  return (
    <div
      ref={dialogRef}
      data-overlay=""
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "画像の拡大表示"}
      aria-describedby={alt ? imgId : undefined}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 overscroll-contain bg-black/90 px-2 pt-14 pb-3 outline-none sm:px-6 sm:pb-5"
      onMouseDown={(e: MouseEvent) => {
        downOnImage.current = !isBackdrop(e.target);
      }}
      // ★ mousedown ではなく click で閉じる。スマホのタップは mousedown → click の順に出るので、
      //   mousedown で消すと、続く click が下にあったリンクに落ちる
      onClick={(e: MouseEvent) => {
        if (!downOnImage.current && isBackdrop(e.target)) onClose();
        downOnImage.current = false;
      }}
    >
      {/* ★ fixed にしない。useModalA11y は offsetParent の無い要素をフォーカスの巡回から外す */}
      {/* min-h-11・min-w-11: 押せる大きさの基準 44px を満たす（py-2 だけだと高さ 36px） */}
      <button
        type="button"
        onClick={onClose}
        className={`absolute top-2 right-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-white/15 px-3 py-2 text-sm font-bold text-white hover:bg-white/25 sm:top-3 sm:right-3 ${FOCUS_RING}`}
      >
        <X size={18} aria-hidden="true" />
        閉じる
      </button>
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <img
          id={imgId}
          src={src}
          alt={alt}
          width={width}
          height={height}
          decoding="async"
          // width・height の属性は寸法の目安にだけ使い、表示は auto に戻して枠の大きさで縮める。
          // 高さの上限は枠（flex-1・min-h-0）に従わせる。題が 2 行に折り返しても画像がはみ出さない
          className="block h-auto max-h-full w-auto max-w-full rounded-md object-contain"
        />
      </div>
      {title && (
        <p id={titleId} className="max-w-full shrink-0 px-2 text-center text-sm font-bold text-white/90">
          {title}
        </p>
      )}
    </div>
  );
}

/**
 * ページに置く画像。押す（Enter・Space でも）と ImageLightbox で全面に出す。
 *
 * - `<a target="_blank"><img/></a>` をそのまま置き換えられる props にしてある
 *  （更新履歴の告知画像・知識ガイドの撮影 Shot・まとめ画像 GuideCards）
 * - 縮小版と原寸が別のファイルのとき（まとめ画像）は、src に縮小版、fullSrc に原寸を渡す
 * - ダイアログはボタンの中ではなく兄弟に出す（中を押した拍子にボタンが開き直さない）
 */
export function ZoomableImage({
  src,
  alt,
  width,
  height,
  fullSrc,
  fullWidth,
  fullHeight,
  title,
  className = "block w-full",
  imgClassName = "block h-auto w-full rounded-lg border border-slate-300",
  loading = "lazy",
}: {
  /** ページに出す画像。 */
  src: string;
  alt: string;
  width: number;
  height: number;
  /** 全面に出すときの画像（無ければ src）。 */
  fullSrc?: string;
  fullWidth?: number;
  fullHeight?: number;
  /** ダイアログのラベルと題（版の名前・図の題など短いもの）。 */
  title?: string;
  /** 押せる枠（button）のクラス。既定は親の幅いっぱい。 */
  className?: string;
  /** ページに出す img のクラス。 */
  imgClassName?: string;
  loading?: "lazy" | "eager";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // ★ useModalA11y の deps に入るので、関数を毎回作り直さない（作り直すとスクロール停止とフォーカスがやり直しになる）
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          // Safari はボタンを押してもフォーカスしないので、そのままだと hook の戻し先が body になる。
          // 開く前にフォーカスを載せておき、閉じたときに hook がここへ戻すようにする
          triggerRef.current?.focus({ preventScroll: true });
          setOpen(true);
        }}
        className={`cursor-zoom-in rounded-lg text-left ${FOCUS_RING} ${className}`}
      >
        <img src={src} alt={alt} width={width} height={height} loading={loading} decoding="async" className={imgClassName} />
        {/* 読み上げでは、名前が alt だけだと押すと何が起きるか分からない */}
        <span className="sr-only">（拡大して表示）</span>
      </button>
      <ImageLightbox
        open={open}
        onClose={close}
        src={fullSrc ?? src}
        alt={alt}
        title={title}
        width={fullSrc ? fullWidth : width}
        height={fullSrc ? fullHeight : height}
      />
    </>
  );
}
