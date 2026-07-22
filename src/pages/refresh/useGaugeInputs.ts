import { useMemo, useState } from "react";
import { ENVY_ID } from "../analyzer/lib/calculator";
import { getRefreshConstant } from "./lib/refreshConstant";
import { overheadFromRate } from "./lib/sessionPlanner";
import type { AnalyzerMusic } from "../analyzer/useAnalyzerMusics";

export const ENVY_LEN = 74.8; // エビの長さ（周回ペース較正の基準曲）
export const DEFAULT_RATE = 28; // エビ基準の既定周回ペース(回/時)

/**
 * リフレッシュゲージ系ツール（ゲージ確認・周回プラン）で共有する入力状態。
 * 曲・現在ゲージ・周回ペース＋実測較正をまとめて持つ。
 */
export function useGaugeInputs(musics: AnalyzerMusic[]) {
  const [songId, setSongId] = useState(ENVY_ID);
  const [songModalOpen, setSongModalOpen] = useState(false);
  const [gauge, setGauge] = useState("0");
  const [rate, setRate] = useState(String(DEFAULT_RATE));
  const [calibPlays, setCalibPlays] = useState("");
  const [calibMin, setCalibMin] = useState("");

  const selectedSong = useMemo(() => musics.find((m) => m.id === songId), [musics, songId]);

  const calibRate = useMemo(() => {
    const p = Number(calibPlays);
    const m = Number(calibMin);
    return p > 0 && m > 0 ? Math.round((p * 60) / m) : null;
  }, [calibPlays, calibMin]);

  const overhead = useMemo(() => {
    const r = Number(rate);
    return overheadFromRate(r > 0 ? r : DEFAULT_RATE, ENVY_LEN);
  }, [rate]);

  const rc = selectedSong ? getRefreshConstant(selectedSong.basePoint, selectedSong.id) : 0;
  const gaugePct = Math.max(0, Math.min(100, Number(gauge) || 0));
  const ratePerHour = Number(rate) > 0 ? Number(rate) : DEFAULT_RATE;

  return {
    songId,
    setSongId,
    songModalOpen,
    setSongModalOpen,
    gauge,
    setGauge,
    rate,
    setRate,
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
  };
}

export type GaugeInputs = ReturnType<typeof useGaugeInputs>;
