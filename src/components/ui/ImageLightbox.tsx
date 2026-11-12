import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
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
 *   スマホでは全面に出しても字が小さいので、指で広げるか、画像を押して原寸にして読む（下の LightboxDialog）
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
  useModalA11y(open, onClose, dialogRef);
  if (!open) return null;
  // 中身は開いている間だけ置く。原寸の切り替えの状態は閉じると捨てる（開き直すと「画面に合わせる」から）
  return (
    <LightboxDialog
      dialogRef={dialogRef}
      onClose={onClose}
      src={src}
      alt={alt}
      title={title}
      width={width}
      height={height}
    />
  );
}

type Zoom = "fit" | "actual";
type Point = { x: number; y: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 全面表示のボタン（閉じる・原寸の切り替え）。押せる大きさの基準 44px を満たす（py-2 だけだと高さ 36px）。 */
const OVERLAY_BUTTON = `inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-white/15 px-3 py-2 text-sm font-bold text-white hover:bg-white/25 ${FOCUS_RING}`;

/**
 * 全面表示の中身。
 *
 * 原寸の切り替え（2026-11-12 運営者が検分 gate-256 の中 1 の案 (a) を選んだ）:
 * - 画像を押す、または「原寸で見る」で、画面に合わせる ⇔ 原寸（画像の画素数のまま）を切り替える。
 *   原寸のときは画像の枠が縦横にスクロールする。画像を押して原寸にしたときは、押した所が画面の中央付近に
 *   来るように最初のスクロールを合わせる（ボタンのときは画像の真ん中）
 * - 原寸にしても大きくならない（画面に合わせた大きさ＝画素数）画像では、ボタンを出さず、押しても切り替えない
 * - 閉じ方は変えない: Esc・閉じるボタン・背景（画像の外）。押し始めが画像の上やスクロールバーの上なら閉じない
 */
function LightboxDialog({
  dialogRef,
  onClose,
  src,
  alt,
  title,
  width,
  height,
}: {
  dialogRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  src: string;
  alt: string;
  title?: string;
  width?: number;
  height?: number;
}) {
  const titleId = useId();
  const imgId = useId();
  const imgRef = useRef<HTMLImageElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 押し始めが画像・ボタン・スクロールバーの上だったか。そこで押して背景で離したときに閉じないため
  const downInside = useRef(false);
  const [zoom, setZoom] = useState<Zoom>("fit");
  /** 画像の画素数（読み込んでから分かる）。原寸の表示の大きさに使う。 */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  /** 原寸にすると大きくなるか（画面に合わせた表示より画素数が大きいか）。 */
  const [canZoom, setCanZoom] = useState(false);
  /** 原寸にしたときに画面の中央へ持ってくる所（画像の幅・高さに対する割合）。 */
  const focusPoint = useRef<Point>({ x: 0.5, y: 0.5 });

  /** 画面に合わせているときの表示の大きさと画素数を比べる。原寸のときは表示＝画素数なので測らない。 */
  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || img.dataset.zoom !== "fit") return;
    setCanZoom(img.naturalWidth > img.clientWidth + 1 || img.naturalHeight > img.clientHeight + 1);
  }, []);

  // 画面の大きさが変わると、画面に合わせた表示の大きさも変わる（横向きにした・窓を広げた）
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // 原寸にした直後に、中央に持ってくる所へスクロールを合わせる。描く前に合わせるので、左上が一瞬見えることはない
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const img = imgRef.current;
    if (zoom !== "actual" || !box || !img) return;
    const { x, y } = focusPoint.current;
    box.scrollLeft = Math.max(0, img.offsetLeft + x * img.naturalWidth - box.clientWidth / 2);
    box.scrollTop = Math.max(0, img.offsetTop + y * img.naturalHeight - box.clientHeight / 2);
  }, [zoom]);

  const toggle = (point?: Point) => {
    if (zoom === "fit" && !canZoom) return;
    focusPoint.current = point ?? { x: 0.5, y: 0.5 };
    setZoom(zoom === "fit" ? "actual" : "fit");
  };

  /** 画像と操作部品（ボタン）以外を押したら閉じる。余白のどこを押しても閉じられるように。 */
  const isBackdrop = (target: EventTarget) => target instanceof Element && !target.closest("img, button");
  /** スクロールバーの上か（offsetX・offsetY が中身の幅・高さを超える）。原寸のときの枠のスクロールバーで閉じない */
  const onScrollbar = (e: MouseEvent) =>
    e.target instanceof HTMLElement &&
    (e.nativeEvent.offsetX > e.target.clientWidth || e.nativeEvent.offsetY > e.target.clientHeight);

  const actual = zoom === "actual" && natural != null;

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
        downInside.current = !isBackdrop(e.target) || onScrollbar(e);
      }}
      // ★ mousedown ではなく click で閉じる。スマホのタップは mousedown → click の順に出るので、
      //   mousedown で消すと、続く click が下にあったリンクに落ちる
      onClick={(e: MouseEvent) => {
        if (!downInside.current && isBackdrop(e.target)) onClose();
        downInside.current = false;
      }}
    >
      {/*
        ★ ボタンは fixed にしない。useModalA11y は offsetParent の無い要素をフォーカスの巡回から外す。
        DOM の順は「閉じる」が先（開いた直後のフォーカスは閉じるに入る）。見た目は flex-row-reverse で
        閉じるを右端に置き、その左に切り替えのボタンを並べる
      */}
      <div className="absolute top-2 right-2 flex flex-row-reverse items-center gap-2 sm:top-3 sm:right-3">
        <button type="button" onClick={onClose} className={OVERLAY_BUTTON}>
          <X size={18} aria-hidden="true" />
          閉じる
        </button>
        {(canZoom || actual) && (
          <button type="button" onClick={() => toggle()} className={OVERLAY_BUTTON}>
            {actual ? <ZoomOut size={18} aria-hidden="true" /> : <ZoomIn size={18} aria-hidden="true" />}
            {actual ? "画面に合わせる" : "原寸で見る"}
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        data-lightbox-scroll=""
        // 原寸のときだけ、矢印キーで動かせるよう Tab で止まる枠にする
        tabIndex={actual ? 0 : undefined}
        role={actual ? "group" : undefined}
        aria-label={actual ? "原寸の画像（矢印キーで動かせます）" : undefined}
        className={`relative flex min-h-0 w-full flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
          actual ? "overflow-auto overscroll-contain" : ""
        }`}
      >
        <img
          ref={imgRef}
          id={imgId}
          src={src}
          alt={alt}
          width={width}
          height={height}
          decoding="async"
          data-zoom={actual ? "actual" : "fit"}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            measure();
          }}
          onClick={(e) => {
            if (actual) return toggle();
            const r = e.currentTarget.getBoundingClientRect();
            toggle(
              r.width > 0 && r.height > 0
                ? { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
                : undefined,
            );
          }}
          style={actual ? { width: natural.w, height: natural.h } : undefined}
          // 画面に合わせるとき: width・height の属性は寸法の目安にだけ使い、表示は auto に戻して枠の大きさで縮める。
          //   高さの上限は枠（flex-1・min-h-0）に従わせる。題が 2 行に折り返しても画像がはみ出さない
          // 原寸のとき: 画素数のまま出し、枠がスクロールする。m-auto は小さい向きでは真ん中に寄せ、
          //   はみ出す向きでは 0 になる（justify-center と違い、左・上が切れて届かなくなることがない）
          className={`m-auto block rounded-md ${
            actual
              ? "max-h-none max-w-none shrink-0 cursor-zoom-out"
              : `h-auto max-h-full w-auto max-w-full object-contain ${canZoom ? "cursor-zoom-in" : ""}`
          }`}
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
