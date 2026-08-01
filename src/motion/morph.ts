/**
 * 共有要素の変形（ページをまたいで「同じもの」を1つの動きで繋ぐ）。
 *
 * ハブのカードを押すと、そのカードだけが素材から持ち上がり、他が溶けているあいだ
 * 宙に留まり、行き先ページの見出しバナーの位置・形へ飛んでいって着地する。
 * 「一覧から選ぶ → その画面になる」を1つの連続した動きとして読ませるための仕掛け。
 *
 * ── 対応づけの規約 ────────────────────────────────────────────
 * ページ側は `data-morph="<キー>"` を置くだけ。遷移の前後で**同じキーを持つ要素が
 * 両方に居たとき**に変形が走る。
 *   - 向きが自動で決まる。戻るときは「見出し → カード」に逆流するだけ
 *   - 対応が無ければ何も起きず、ふつうの遷移になる（足し忘れても壊れない）
 *
 * ── ステージの外でやる理由 ──────────────────────────────────
 * 変形は位置と大きさを動かす。ところが .stage の中で transform / filter を使うと
 * position:fixed の包含ブロックを奪ってしまい、モバイルの常設バーやポータル未使用の
 * モーダルが飛ぶ（docs/motion-system.md）。そこで**複製を body 直下の fixed
 * レイヤーへ出して**動かし、ステージ本体には一切触らない。複製なので、元ページが
 * 差し替わっても飛んでいるものは影響を受けない。
 *
 * ── なぜ「複製2枚のクロスフェード」なのか ────────────────────
 * 出発点（カード）と到着点（見出し）は中身が違う。1枚を伸縮させると中身が
 * 引き伸ばされるか、毎フレーム折り返しが変わってガタつく。2枚重ねて箱だけを
 * 同じ軌道で動かし、中身は原寸のまま overflow で切り、透明度だけを入れ替える。
 */

import { DIV_ATTR, DIV_T } from "./divisions";

/** ページ側が置く印。値が対応づけのキー。 */
export const MORPH_ATTR = "data-morph";

const LAYER_ID = "morph-layer";
/** 押下で指名された内容を次の遷移まで持ち越さないための賞味期限。 */
const AIM_TTL_MS = 1000;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

interface Captured {
  key: string;
  rect: Rect;
  /** 出発点の複製。採寸した瞬間に作って浮かせる（元は隠す）。 */
  box: HTMLElement;
  /** 着地後に見せ直す元の要素。 */
  origin: HTMLElement;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * 動かすプロパティの並び。**TS 側を正本にして inline で指定する。**
 *
 * ★ transition-duration は値が足りないと先頭から循環して割り当てられる。
 *   CSS に property を書いて TS から duration だけ渡すと、片方を増やしたときに
 *   「left だけ違う速さで動いて箱が歪む」という壊れ方をする（実際にそうなっていた）。
 *   並びと長さを1箇所で作れば、ずれようがない。
 */
const MOVED = ["top", "left", "width", "height", "border-radius", "transform"] as const;

/** 持ち上げたときの浮き。少しだけ大きくして「摘まみ上げた」を出す。 */
const LIFT_SCALE = 1.02;

interface Transition {
  property: string;
  duration: string;
  delay: string;
}

/**
 * 入れ替え（opacity）だけ遅らせて短く走らせる。
 *
 * 中身は箱に合わせて引き伸ばされるので、出発点の複製は**終盤ほど歪み**、
 * 到着点の複製は**序盤ほど歪む**。だから「最初は出発点だけ・最後は到着点だけ」を
 * 見せ、いちばん歪んでいる真ん中でだけ2枚を混ぜる。ここを端に寄せると、
 * ひしゃげた文字がはっきり見えてしまう。
 */
function transition(timing: FlightTiming): Transition {
  const delay = Math.round(timing.flyMs * 0.28);
  return {
    property: [...MOVED, "opacity"].join(", "),
    duration: [...MOVED.map(() => `${timing.flyMs}ms`), `${timing.fadeMs}ms`].join(", "),
    delay: [...MOVED.map(() => "0ms"), `${delay}ms`].join(", "),
  };
}

/**
 * 中身を箱の大きさに合わせて引き伸ばす倍率。
 *
 * ★ ここが無いと「箱だけ大きくなって中身は原寸のまま左上に residual」になり、
 *   伸びているように見えない。移動が終わってから中身が入れ替わって初めて
 *   大きさの変化に気づく＝「移動してから一瞬で伸びた」という読み方になる。
 *   中身も一緒に伸ばすことで、移動と変形が1つの動きとして読める。
 */
function scaleTo(content: Rect, box: Rect): string {
  return `scale(${box.width / content.width}, ${box.height / content.height})`;
}

function layer(): HTMLElement {
  let el = document.getElementById(LAYER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = LAYER_ID;
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
}

function readRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    radius: getComputedStyle(el).borderRadius,
  };
}

function place(box: HTMLElement, rect: Rect): void {
  box.style.top = `${rect.top}px`;
  box.style.left = `${rect.left}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.style.borderRadius = rect.radius;
}

/**
 * 複製を作る。
 *
 * 中身は原寸のまま固定した内側の箱に入れ、外側の箱だけを動かす。
 * --unit-color はページのルートで宣言されているのでレイヤーへ出すと継承が切れる。
 * 解決済みの値を焼き付けて持っていく。
 */
function clone(el: HTMLElement, content: Rect, boxRect: Rect = content): HTMLElement {
  const cs = getComputedStyle(el);
  const box = document.createElement("div");
  box.className = "morph-box";
  box.style.setProperty("--unit-color", cs.getPropertyValue("--unit-color").trim());
  place(box, boxRect);

  // 中身は「その要素の本来の大きさ」で組み、外の箱に合わせて拡縮する。
  // 幅を毎フレーム変えると折り返しが変わって文字が踊るので、レイアウトは動かさない。
  const inner = document.createElement("div");
  inner.className = "morph-inner";
  inner.style.width = `${content.width}px`;
  inner.style.height = `${content.height}px`;
  inner.style.transform = scaleTo(content, boxRect);

  const copy = el.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));

  // ページ側の印を全部剥がす。
  //  - data-morph: 残っていると次の採寸で複製自身を拾ってしまう
  //  - data-div  : 残っているとカスケードの規則が複製にも当たり、飛ぶはずのものが
  //                ページと一緒に溶けて消える（印は遷移後も要素に残るので、
  //                2回目以降の遷移でだけ起きる）
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    el.removeAttribute(MORPH_ATTR);
    el.removeAttribute(DIV_ATTR);
    el.style?.removeProperty(DIV_T);
  }
  copy.style.width = `${content.width}px`;
  copy.style.height = `${content.height}px`;
  copy.style.margin = "0";

  inner.appendChild(copy);
  box.appendChild(inner);
  return box;
}

let captured: Captured | null = null;
let aimedAt = -Infinity;
let boxes: HTMLElement[] = [];
let landing: HTMLElement | null = null;
let timer = 0;

function cleanup(): void {
  clearTimeout(timer);
  timer = 0;
  boxes.forEach((b) => b.remove());
  boxes = [];
  if (landing) landing.style.visibility = "";
  landing = null;
}

/** 出発点を浮かせる。元の要素は場所を残したまま隠す（下のレイアウトを動かさない）。 */
function lift(el: HTMLElement): Captured | null {
  // ★ 前の飛行をここで必ず終わらせる。
  //   後片付けは「飛行が終わる頃」のタイマーでやっているので、着地しきる前に
  //   次の遷移を始めると、**前の飛行のタイマーが新しく持ち上げた複製まで消す**。
  //   複製が消えたのに元は隠れたままなので「選んだパネルごと消える」ことになる。
  //   間隔を空けて操作している限り起きないので、テストでも実測でも取り逃しやすい。
  cleanup();

  const key = el.getAttribute(MORPH_ATTR);
  if (!key) return null;
  const rect = readRect(el);
  if (rect.width === 0 || rect.height === 0) return null;

  const box = clone(el, rect);
  layer().appendChild(box);
  // 開始値を確定させてから浮かせる（同じタスク内の2回の変更は1回しか計算されない）。
  void box.offsetHeight;
  // 行き先が分かるまで、素材が溶けるあいだ宙で待つ。完全に静止させると
  // 「固まった」ように見えるので、摘まみ上げたぶんだけ浮かせておく。
  box.style.transform = `scale(${LIFT_SCALE})`;
  el.style.visibility = "hidden";
  document.documentElement.dataset.morph = "on";
  boxes.push(box);
  return { key, rect, box, origin: el };
}

/**
 * 押された要素を出発点として指名する。
 *
 * 一覧には同じ印のカードが何枚もあるので、採寸だけでは「どれ」か決まらない。
 * 押下でここに手を挙げてもらう（キーボードの Enter も click になる）。
 */
export function aimMorph(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  // ★ 上下どちらも見る。押された点が印の内側とは限らない ──
  //   ハブのカードはリンクの**子**なので、キーボードの Enter や
  //   リンク自体をクリックした場合は target がリンクになり、closest では届かない。
  const el =
    target.closest<HTMLElement>(`[${MORPH_ATTR}]`) ??
    target.querySelector<HTMLElement>(`[${MORPH_ATTR}]`);
  if (!el || captured) return;
  const next = lift(el);
  if (!next) return;
  captured = next;
  aimedAt = now();
}

/**
 * 出発点を確定する。遷移が始まる時点（＝まだ元ページが見えている）で呼ぶ。
 *
 * 直前の押下で指名されていればそれを使う。指名が無ければ、画面内に見えている
 * 印付きの要素を採る ── 戻るときのツールページのように、印が1つしか無い場合は
 * これで足りる（＝戻る/進むでも同じ動きになる）。
 */
export function captureMorph(stage: Element | null, destKey?: string | null): void {
  if (captured && now() - aimedAt < AIM_TTL_MS) return; // 押下で指名済み
  cancelMorph();
  if (!stage) return;
  // ★ 行き先が印を持たないなら持ち上げない。持ち上げると本文だけ沈んで
  //   **機能名だけが宙に残り**、行き先が見つからずに消える（issue #3）。
  //   ツール→ツールがまさにこれで、印はどちらにもあるがキーが違う。
  if (destKey === null) return;

  const visible = Array.from(stage.querySelectorAll<HTMLElement>(`[${MORPH_ATTR}]`)).filter(
    (el) => {
      const r = el.getBoundingClientRect();
      // 画面外のものを持ち上げると、見えない所から飛んできたように見える。
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    }
  );
  // 候補が複数あるのに押下の指名が無い＝どれを飛ばすか決められない。何もしない。
  if (visible.length !== 1) return;
  // 行き先の印が分かっているなら、一致するときだけ持ち上げる（"*" は不問＝ハブ）。
  const key = visible[0].getAttribute(MORPH_ATTR);
  if (destKey != null && destKey !== "*" && destKey !== key) return;
  captured = lift(visible[0]);
}

export interface FlightTiming {
  /** 飛んでいる時間。 */
  flyMs: number;
  /** 出発点の複製が消えるまで（＝中身が入れ替わる速さ）。 */
  fadeMs: number;
}

/**
 * 行き先が確定した時点で呼ぶ（新しい木は commit 済み・画面はまだ無地）。
 * 対応するキーが見つからなければ複製を片付けて、ふつうの遷移に戻す。
 *
 * @returns 変形を始めたか
 */
export function flyMorph(stage: Element | null, timing: FlightTiming): boolean {
  const from = captured;
  captured = null;
  aimedAt = -Infinity;
  if (!from) return false;
  // 持ち上げた複製が既に外されている（＝別の遷移に片付けられた）なら飛ばせない。
  if (!from.box.isConnected) {
    cancelMorph();
    return false;
  }

  // キーはページ側が自由に付ける文字列なので、セレクタに埋めずに突き合わせる
  //（引用符やコロンのエスケープを考えなくて済むし、CSS.escape の有無にも依らない）。
  const target = stage
    ? Array.from(stage.querySelectorAll<HTMLElement>(`[${MORPH_ATTR}]`)).find(
        (el) => el.getAttribute(MORPH_ATTR) === from.key
      )
    : undefined;
  const to = target ? readRect(target) : null;
  if (!target || !to || to.width === 0 || to.height === 0) {
    cancelMorph();
    return false;
  }

  // 到着点の複製は「行き先の大きさで組んだ中身」を「出発点の箱」に押し込んで始める。
  // つまり最初はぺしゃんこで、箱が育つにつれて本来の形へ戻っていく。
  const toBox = clone(target, to, from.rect);
  toBox.style.opacity = "0";
  layer().appendChild(toBox);
  boxes.push(toBox);

  // 本物は着地するまで隠す。visibility なら場所は確保されたままなので、
  // 下に続く中身のレイアウトが動かない。
  target.style.visibility = "hidden";
  landing = target;

  // 開始値を確定させてから終了値を置く。同じタスク内の2回の変更はまとめて
  // 1回しか計算されないので、これが無いと一瞬で終点に飛ぶ。
  void layer().offsetHeight;

  const { property, duration, delay } = transition(timing);
  const contents: [HTMLElement, Rect][] = [
    [from.box, from.rect],
    [toBox, to],
  ];
  for (const [box, content] of contents) {
    box.style.transitionProperty = property;
    box.style.transitionDuration = duration;
    box.style.transitionDelay = delay;
    place(box, to);

    // 浮かせていたぶんを降ろしながら飛ぶ＝行き先へ「置きにいく」。
    box.style.transform = "scale(1)";

    const inner = box.firstElementChild as HTMLElement;
    inner.style.transitionDuration = `${timing.flyMs}ms`;
    inner.style.transform = scaleTo(content, to);
  }
  from.box.style.opacity = "0";
  toBox.style.opacity = "1";

  timer = window.setTimeout(() => {
    cleanup();
    delete document.documentElement.dataset.morph;
  }, timing.flyMs + 60);
  return true;
}

/** 遷移が中断された・対応が見つからなかったときの後片付け。 */
export function cancelMorph(): void {
  if (captured) captured.origin.style.visibility = "";
  captured = null;
  aimedAt = -Infinity;
  cleanup();
  delete document.documentElement.dataset.morph;
}
