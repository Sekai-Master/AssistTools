/**
 * リフレッシュゲージの周回ペースを、どちらのライブで回す想定で出すか（2026-11-18）。
 *
 * ── なぜ足したか ────────────────────────────────────────────
 * 2026-11-18 23:00 から公式が「みんなでライブ」を止めた（終わり未定。src/lib/liveSuspension.ts）。
 * それまでの計算は、周回ペースの既定 28 回/時（エビ基準）＝みんなでライブのマッチング・支援者交代込みの
 * 実測だけを前提にしていた。ひとりでライブだけのイベントでは 1 周が短くなり、100%までの時間・持続ペースが
 * 変わる。Nori の決定「リフレゲージはひとり想定を作ってタグかなんかで明示」。
 *
 * ── 何が想定で変わるか ──────────────────────────────────────
 * 変わるのは「1 周の曲以外の秒数（ロス）」だけ。ゲージの増え方（定数×157）・休憩での減り方は同じ式を使う。
 * - みんなでライブ: 周回ペース 28 回/時からロスを逆算する（≒53.8 秒）。**足す前と 1 つも変えない。**
 * - ひとりでライブ: ロスは src/lib/overhead.ts の OVERHEAD_SEC.solo（2026-11-18 時点は実測前の仮の値）。
 *   ここでは数字を持たない。画面に「仮」と出すかは同じファイルの SOLO_OVERHEAD_PROVISIONAL だけで決める
 *   （値が 33 かどうかでは判定しない）。
 * 「詰めて回した場合（MULTI_OVERHEAD_THEORETICAL）」は部屋待ち・支援者交代が無い場合の値で、ひとりでライブには
 * 当たるものが無い。リフレッシュゲージの画面にはもともと出ていないので、こちらでも足さない。
 */
import { MULTI_LIVE_SUSPENDED } from "../../../lib/liveSuspension";
import { OVERHEAD_SEC, SOLO_OVERHEAD_PROVISIONAL } from "../../../lib/overhead";
import { overheadFromRate, playsPerHour } from "./sessionPlanner";

export type LiveAssumption = "solo" | "multi";

/** エビ（独りんぼエンヴィー）の長さ。周回ペースは「エビを 1 時間に何回」で入れる（較正の基準曲）。 */
export const ENVY_LEN = 74.8;

/** みんなでライブの既定の周回ペース（エビ基準・回/時）。Nori の実測平均。 */
export const DEFAULT_RATE = 28;

/**
 * ひとりでライブの既定の周回ペース（エビ基準・回/時）。OVERHEAD_SEC.solo から出して、整数に丸めて見せる。
 * ★ ここに数字を書かない。Nori が OVERHEAD_SEC.solo を実測で直したら、ここも一緒に動く。
 */
export const SOLO_DEFAULT_RATE = Math.round(playsPerHour(ENVY_LEN, OVERHEAD_SEC.solo));

/** 画面に出す公式の名前。 */
export const LIVE_ASSUMPTION_LABEL: Record<LiveAssumption, string> = {
  solo: "ひとりでライブ",
  multi: "みんなでライブ",
};

/** 結果の横に出す札の文字（例「ひとりでライブ想定」）。 */
export function assumptionTag(live: LiveAssumption): string {
  return `${LIVE_ASSUMPTION_LABEL[live]}想定`;
}

/**
 * 開いたときの想定。みんなでライブが止まっている間はひとりでライブ。
 * ★ リフレッシュゲージは入力を保存しない（開くたびに既定から）ので、「古い保存値」はもともと無い。
 */
export function defaultLiveAssumption(suspended: boolean = MULTI_LIVE_SUSPENDED): LiveAssumption {
  return suspended ? "solo" : "multi";
}

/** 想定ごとの既定の周回ペース（エビ基準・回/時）。 */
export function defaultRateFor(live: LiveAssumption): number {
  return live === "solo" ? SOLO_DEFAULT_RATE : DEFAULT_RATE;
}

/** 入力欄の文字を周回ペースとして読む。空欄・0 以下・数字でないものは null。 */
function readRate(rateText: string): number | null {
  const r = Number(rateText);
  return r > 0 ? r : null;
}

/** 計算に使う周回ペース（エビ基準・回/時）。未入力なら想定の既定。 */
export function paceFor(live: LiveAssumption, rateText: string): number {
  return readRate(rateText) ?? defaultRateFor(live);
}

/**
 * 周回ペースの入力から、1 周のロス（秒）を出す。
 *
 * ★ ひとりでライブで既定のペースのまま（または未入力）なら、ロスは OVERHEAD_SEC.solo を**そのまま**使う。
 *   既定のペースは整数に丸めて見せているだけなので、そこから逆算すると丸めのぶんずれる
 *   （2026-11-18 の仮の値では 1 秒あまり長くなる）。効率曲ランキングの「ひとりで周回」と同じロスにそろえる。
 *   その代わり、既定と同じ数字を打ったときも OVERHEAD_SEC.solo になる（ペースからの逆算と最大 0.5 回/時ぶん違う）。
 * ★ みんなでライブは足す前と同じく、いつも 28 回/時（または入れた値）から逆算する。
 */
export function overheadForPace(live: LiveAssumption, rateText: string): number {
  const r = readRate(rateText);
  if (live === "solo") {
    return r == null || r === SOLO_DEFAULT_RATE ? OVERHEAD_SEC.solo : overheadFromRate(r, ENVY_LEN);
  }
  return overheadFromRate(r ?? DEFAULT_RATE, ENVY_LEN);
}

/**
 * 「入力について」に出す、ひとりでライブの周回ペースの説明（「周回ペース」の見出しのあとに続く文）。
 *
 * ★ ロスが仮の値だという断りは、ここ（閉じた段）に 1 回だけ書く。入力欄の下には書かない（design-system 7 節）。
 * ★ 「仮」と出すかは SOLO_OVERHEAD_PROVISIONAL だけで決める。Nori が実測して OVERHEAD_SEC.solo を直し、
 *   印を false にすると「仮」が消える（値が 33 のままでも、別の値でも、印に従う）。
 */
export function soloPaceNote(
  defaultRate: number,
  provisional: boolean = SOLO_OVERHEAD_PROVISIONAL,
): string {
  const loss = `既定${defaultRate}は1回あたりのロス${OVERHEAD_SEC.solo}秒から出した値${
    provisional ? "で、このロスはまだ実測していない仮の値です" : "です"
  }。`;
  return `: エビ基準の周回 回/時（ひとりでライブ: ロード・リザルトなど込み）。長い曲は自動で少なくなります。${loss}自分の環境に合わせて調整を。`;
}

/**
 * 画像に書き出す「ペース」の行。想定を渡さないとき（周回プランなど、想定を選ばない画面）は足す前と同じ文。
 */
export function paceMetaLine(ratePerHour: number, live?: LiveAssumption): string {
  const basis = live ? `エビ基準・${assumptionTag(live)}` : "エビ基準";
  return `ペース: ${ratePerHour}回/時（${basis}）`;
}
