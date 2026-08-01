/**
 * ページを「ディビジョン（ブロック）」に割って、カスケードの順番を印として書き込む。
 *
 * リッチの振り付けはブロック単位で走る（下から順に溶け、上から順に像を結ぶ）。
 * その順番を CSS だけで表現する方法は無いので、遷移のたびにこのモジュールが
 * DOM を1回だけ歩いて `data-div` と `--div-t`（0=先頭 / 1=末尾）を書く。
 * 時間の計算は CSS 側（--stage-*-cascade との掛け算）で、ここは順番だけを決める。
 *
 * ★ ページ側に印を要求しない。全ツールに data 属性を撒くと、新しいページを
 *   足すたびに演出が抜け落ちる事故が起きる。代わりに「見た目を持たない入れ物は
 *   割る／影や背景を持つ箱はそれ以上割らない」という規則で構造から推定する。
 *   ニューモーフィズムでは "浮いている箱" がそのまま意味の単位なので、
 *   影の有無がブロック境界の良い近似になる。
 */

/** ディビジョン印。値は画面内かどうか（near だけがぼける＝ぼかす面積を1画面に抑える）。 */
export const DIV_ATTR = "data-div";
/** ページ内での位置。0=先頭 / 1=末尾。CSS 側で遅延時間に換算する。 */
export const DIV_T = "--div-t";

export interface DivisionOptions {
  /** 見た目を持たない純粋なレイアウト箱か。 */
  isBare?: (el: Element) => boolean;
  /** 実際に描画されているか（display:none や lg 限定の要素を数から外す）。 */
  isRendered?: (el: Element) => boolean;
  /** 画面内に入っているか。 */
  isNear?: (el: Element) => boolean;
  /** 何段まで割るか。 */
  maxDepth?: number;
  /** これを超えたら1段粗い割り方でやり直す。 */
  max?: number;
}

const TRANSPARENT = new Set(["rgba(0, 0, 0, 0)", "transparent"]);

/**
 * 「自分の見た目を持たない入れ物」か。ここが false になった時点でそれが1ブロック。
 *
 * 影・背景・枠のどれかを持つ要素は、この製品では意味のある面（パネル/見出しバナー/
 * カード）なので、それ以上は割らない。直下にテキストを持つ箱も中身そのものなので割らない。
 */
function defaultIsBare(el: Element): boolean {
  const cs = getComputedStyle(el);
  if (cs.boxShadow !== "none") return false;
  if (cs.backgroundImage !== "none") return false;
  if (!TRANSPARENT.has(cs.backgroundColor)) return false;
  if (
    parseFloat(cs.borderTopWidth) > 0 ||
    parseFloat(cs.borderRightWidth) > 0 ||
    parseFloat(cs.borderBottomWidth) > 0 ||
    parseFloat(cs.borderLeftWidth) > 0
  ) {
    return false;
  }
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") return false;
  }
  return true;
}

const defaultIsRendered = (el: Element): boolean => el.getClientRects().length > 0;

const defaultIsNear = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
};

/**
 * 中身が1つしか無い入れ物は「そのブロックの外皮」でしかないので剥がす。
 *
 * ★ 描画されている子だけを数える。`hidden lg:block` と `lg:hidden` が並ぶ
 *   2カラムは、実際にはどちらかの端末で必ず1つしか出ていない。生の children で
 *   数えると剥がし損ねて、ページ全体が1ブロックに潰れる。
 */
function unwrap(
  el: Element,
  isBare: (el: Element) => boolean,
  isRendered: (el: Element) => boolean
): Element {
  let cur = el;
  for (;;) {
    if (!isBare(cur)) return cur;
    const kids = Array.from(cur.children).filter(isRendered);
    if (kids.length !== 1) return cur;
    cur = kids[0];
  }
}

function walk(
  stage: Element,
  maxDepth: number,
  isBare: (el: Element) => boolean,
  isRendered: (el: Element) => boolean
): Element[] {
  const out: Element[] = [];
  const visit = (node: Element, depth: number) => {
    const el = unwrap(node, isBare, isRendered);
    const kids = Array.from(el.children).filter(isRendered);
    if (kids.length >= 2 && depth < maxDepth && isBare(el)) {
      for (const kid of kids) visit(kid, depth + 1);
      return;
    }
    out.push(el);
  };
  visit(stage, 0);
  return out;
}

/**
 * ステージをディビジョンに割る。
 *
 * 上限を超えたら「捨てる」のではなく1段粗く割り直す。捨てると印の付かない中身が
 * 残り、沈むときにそこだけ消えずに居残る（無地に切り替わる瞬間に消える＝ポップする）。
 */
export function collectDivisions(stage: Element, opt: DivisionOptions = {}): Element[] {
  const isBare = opt.isBare ?? defaultIsBare;
  const isRendered = opt.isRendered ?? defaultIsRendered;
  const maxDepth = opt.maxDepth ?? 4;
  const max = opt.max ?? 16;

  let coarsest: Element[] = [];
  for (let depth = maxDepth; depth >= 1; depth--) {
    coarsest = walk(stage, depth, isBare, isRendered);
    if (coarsest.length <= max) break;
  }
  // 何も割れず自分自身しか出てこなかった＝中身が空。ステージ自体に印を付けると
  // 「ステージごとのフェード」と二重になるので、割れなかったことにして退避路に渡す。
  if (coarsest.length === 1 && coarsest[0] === stage) return [];
  return coarsest;
}

export function clearDivisions(stage: Element): void {
  for (const el of stage.querySelectorAll(`[${DIV_ATTR}]`)) {
    el.removeAttribute(DIV_ATTR);
    (el as HTMLElement).style.removeProperty(DIV_T);
  }
}

/**
 * ページ内での位置 0..1 を割り当てる。
 *
 * ★ 画面外のブロックにカスケードの尺を食わせない。長いページで下の方まで順番に
 *   遅延させると、見えている数ブロックが一瞬で終わって残りの尺が画面外で
 *   浪費される。画面内の並びに 0..1 を張り、上にあるものは 0、下にあるものは 1
 *  （＝先頭/末尾と同じ扱い）に丸める。
 */
export function cascadeOrder(near: boolean[]): number[] {
  const nearIdx = near.flatMap((yes, i) => (yes ? [i] : []));
  const first = nearIdx.length > 0 ? nearIdx[0] : 0;
  const last = nearIdx.length > 0 ? nearIdx[nearIdx.length - 1] : near.length - 1;
  return near.map((_, i) => {
    if (i <= first) return 0;
    if (i >= last) return 1;
    return (i - first) / (last - first);
  });
}

/**
 * スタイル計算を1回強制する。
 *
 * ★ 浮上のときは必須。印を付けた直後に data-stage が rise へ変わるが、同じタスク内の
 *   2回の DOM 変更はまとめて1回しか計算されないので、transition の「開始値」が
 *   確定せず、カスケードが丸ごと効かない（一斉にパッと出る）。ここで1回だけ
 *   レイアウトを読んで、無地の状態＝開始値をブラウザに確定させる。
 *   沈みのときは開始値が既定値のままなので呼ばない（余計なリフローを踏まない）。
 *
 * ★ 呼ぶ前に html[data-divs] を立てておくこと。開始値はその属性込みで決まる。
 */
export function flushStyles(el: Element): void {
  void (el as HTMLElement).offsetHeight;
}

/** ステージに印を書く。戻り値はディビジョン数（0 ならカスケードしない）。 */
export function markDivisions(stage: Element, opt: DivisionOptions = {}): number {
  const isNear = opt.isNear ?? defaultIsNear;
  clearDivisions(stage);

  const divisions = collectDivisions(stage, opt);
  if (divisions.length === 0) return 0;

  // 読み（レイアウト）を全部先に済ませてから書く。交互にやるとリフローを繰り返す。
  const near = divisions.map(isNear);
  const order = cascadeOrder(near);
  divisions.forEach((el, i) => {
    el.setAttribute(DIV_ATTR, near[i] ? "near" : "far");
    (el as HTMLElement).style.setProperty(DIV_T, order[i].toFixed(3));
  });

  return divisions.length;
}
