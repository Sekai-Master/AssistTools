import { useMemo, useState } from "react";
import { ENVY_ID } from "../analyzer/lib/calculator";
import { getRefreshConstant } from "./lib/refreshConstant";
import {
  DEFAULT_RATE,
  type LiveAssumption,
  SOLO_DEFAULT_RATE,
  defaultLiveAssumption,
  defaultRateFor,
  overheadForPace,
  paceFor,
} from "./lib/liveAssumption";
import {
  DECAY_INTERVAL_MIN,
  decayProgressFromNextDecay,
  internalFromPercent,
  minutesToEmpty,
} from "./lib/gaugeModel";
import type { AnalyzerMusic } from "../analyzer/useAnalyzerMusics";

// エビの長さ（周回ペース較正の基準曲）と、みんなでライブの既定の周回ペース。正本は lib/liveAssumption.ts
export { DEFAULT_RATE, ENVY_LEN } from "./lib/liveAssumption";

export interface GaugeInputsOptions {
  /**
   * ライブの想定（ひとりでライブ／みんなでライブ）を選べるようにする。リフレッシュゲージと周回プランが渡す。
   * ★ 渡さないページ（必要稼働時間）は、足す前と同じくみんなでライブのペース 28 回/時で固定。
   * ★ 周回プランは inputs.rate を名前付きで保存している。想定も一緒に保存し、想定の無い旧いプランは
   *   みんなでライブとして呼び出す（旧いプランの周回ペースはみんなでライブの欄の値。PlanPage の loadPlan）。
   */
  liveChoice?: boolean;
}

/**
 * リフレッシュゲージ系ツール（ゲージ確認・周回プラン・必要稼働時間）で共有する入力状態。
 * 曲・現在ゲージ・周回ペース＋実測較正をまとめて持つ。
 */
export function useGaugeInputs(musics: AnalyzerMusic[], options: GaugeInputsOptions = {}) {
  const liveChoice = options.liveChoice ?? false;
  const [songId, setSongId] = useState(ENVY_ID);
  const [songModalOpen, setSongModalOpen] = useState(false);
  const [gauge, setGauge] = useState("0");
  /**
   * ゲーム内の「次の回復まで ○分」。空欄＝未入力。
   * ★ ゲージ%だけでは**タイマーがどこまで進んでいるか**が分からない。
   *   イベントの途中でツールを開くのが普通なので、ここが空だと最大30分ずれる。
   */
  const [nextDecay, setNextDecay] = useState("");
  /**
   * どちらのライブで回す想定か。選べないページはみんなでライブ固定。
   * ★ 保存しない（このページの入力はもともと開くたびに既定から）。止まっている間はひとりでライブで開く。
   */
  const [chosenLive, setLive] = useState<LiveAssumption>(() =>
    liveChoice ? defaultLiveAssumption() : "multi",
  );
  const live: LiveAssumption = liveChoice ? chosenLive : "multi";
  /**
   * 周回ペース（エビ基準・回/時）は想定ごとに別々に持つ。1 つにすると、切り替えのたびに入れた値が消えるか、
   * みんなでライブの 28 のままひとりでライブを計算してしまう。
   */
  const [multiRate, setMultiRate] = useState(String(DEFAULT_RATE));
  const [soloRate, setSoloRate] = useState(String(SOLO_DEFAULT_RATE));
  const rate = live === "solo" ? soloRate : multiRate;
  const setRate = live === "solo" ? setSoloRate : setMultiRate;
  /** 想定を指定して周回ペースを入れる（保存したプランの呼び出し用。setRate はいまの想定の欄に入れる）。 */
  const setRateFor = (target: LiveAssumption, value: string) =>
    (target === "solo" ? setSoloRate : setMultiRate)(value);
  const [calibPlays, setCalibPlays] = useState("");
  const [calibMin, setCalibMin] = useState("");

  const selectedSong = useMemo(() => musics.find((m) => m.id === songId), [musics, songId]);

  const calibRate = useMemo(() => {
    const p = Number(calibPlays);
    const m = Number(calibMin);
    return p > 0 && m > 0 ? Math.round((p * 60) / m) : null;
  }, [calibPlays, calibMin]);

  // みんなでライブは足す前と同じ式（28 回/時か入れた値から逆算）。ひとりでライブの既定は OVERHEAD_SEC.solo。
  const overhead = useMemo(() => overheadForPace(live, rate), [live, rate]);

  const rc = selectedSong ? getRefreshConstant(selectedSong.basePoint, selectedSong.id) : 0;
  const gaugePct = Math.max(0, Math.min(100, Number(gauge) || 0));
  const ratePerHour = paceFor(live, rate);

  /** 「次の回復まで」の分。未入力・不正値は null（＝従来どおり30分フルとして扱う）。 */
  const nextDecayMin = useMemo(() => {
    const raw = nextDecay.trim();
    if (raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(DECAY_INTERVAL_MIN, n);
  }, [nextDecay]);

  /** プラン開始時点で進んでいるタイマー（分）。未入力なら0＝「たった今止めた」。 */
  const startDecayProgress =
    nextDecayMin == null ? 0 : decayProgressFromNextDecay(nextDecayMin);

  /** いまのゲージが0%になるまでの分（＝全回復まで）。 */
  const emptyInMinutes = minutesToEmpty(
    internalFromPercent(gaugePct),
    nextDecayMin ?? DECAY_INTERVAL_MIN
  );

  return {
    songId,
    setSongId,
    songModalOpen,
    setSongModalOpen,
    gauge,
    setGauge,
    rate,
    setRate,
    setRateFor,
    /** 想定を選べるページか（リフレッシュゲージ・周回プランで true）。 */
    liveChoice,
    /** いまの想定。選べないページはいつも "multi"。 */
    live,
    setLive,
    /** いまの想定の既定の周回ペース（補足文に出す）。 */
    defaultRate: defaultRateFor(live),
    calibPlays,
    setCalibPlays,
    calibMin,
    setCalibMin,
    selectedSong,
    calibRate,
    overhead,
    rc,
    gaugePct,
    ratePerHour,
    nextDecay,
    setNextDecay,
    nextDecayMin,
    startDecayProgress,
    emptyInMinutes,
  };
}

export type GaugeInputs = ReturnType<typeof useGaugeInputs>;
