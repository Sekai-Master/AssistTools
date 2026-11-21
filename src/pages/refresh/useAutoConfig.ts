import { useMemo, useState } from "react";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { useRankingMusics } from "../ranking/useRankingMusics";
import { DIFFICULTY_LABEL, type Difficulty } from "../ranking/useRankingMusics";
import { DEFAULT_PARAMS, rankSongs } from "../ranking/lib/efficiency";
import { autoTaki, capAutoPlays, PASS_LIMITS, type PassCourse } from "../ranking/lib/lbRun";

/** 曲＋難易度の組を1つのキーで扱う（オートは難易度でスコアが変わる）。 */
export function autoSongKey(musicId: string, difficulty: string): string {
  return `${musicId}:${difficulty}`;
}

export interface AutoSongOption {
  key: string;
  label: string;
  /** 1回のイベントPt（焚き数込み） */
  eventPt: number;
  /** 1周期の秒（曲長＋オートのロス） */
  cycleSec: number;
}

/**
 * 休憩中オートの設定。
 *
 * ★ **曲・難易度・焚き数はプラン全体で1つ**にしている。実運用でオートの曲を
 *   休憩ごとに変える人はいないし、ブロックごとに持たせると同じ値を何度も打つことになる。
 *   ブロック側が持つのは「何回回すか」だけ。
 *
 * ★ 楽曲の難易度別データ（428KB）は**オートを使うときだけ**読む。
 *   プロフィールを軽い受け口に留める方針（lib/profiles.ts）を崩さないため。
 */
export function useAutoConfig({
  enabled,
  power,
  bonus,
}: {
  enabled: boolean;
  power: number;
  bonus: number;
}) {
  const [course, setCourseRaw] = useState<PassCourse>("none");
  const [usedTodayRaw, setUsedToday] = useState("0");
  const [takiRaw, setTaki] = useState(10);
  const dailyCap = PASS_LIMITS[course].autoPlays;
  /**
   * ★ オートは0焚きができない（下限1。Nori 指摘 2026-11-21）。保存したプランに0が残っていても1として扱う。
   */
  const taki = autoTaki(takiRaw);
  /**
   * 今日すでに回した回数。★ 1日の上限（パスで決まる）を超えた値は上限で扱う。
   * ★ 入れたときに切らず、読むときに収める。プランの呼び出しはパスと回数を同じ描画の中で入れるので、
   *   入れたときに切ると古いパスの上限で切ってしまう（PRECIOUS の 50 回が 10 回になる）。
   */
  const usedToday = capAutoPlays(usedTodayRaw, dailyCap);
  /** パスを変えたら、新しい上限を超える回数を上限に収める（下げたときに超えたまま残さない）。 */
  const setCourse = (next: PassCourse) => {
    setCourseRaw(next);
    setUsedToday((cur) => capAutoPlays(cur, PASS_LIMITS[next].autoPlays));
  };
  const [songKey, setSongKey] = useState("");
  const [skillLeader, setSkillLeader] = useState("");
  const [skillTotal, setSkillTotal] = useState("");
  const [ptOverride, setPtOverride] = useState("");
  /** 1周期の秒の上書き。楽曲データが読めないときはここだけで計算できる。 */
  const [cycleOverride, setCycleOverride] = useState("");

  /**
   * ★ 読み込み中は useRankingMusics の loading をそのまま使う。オートを付けた後の読み込みの間も true になるのは
   *   #251（hook の直し）が前提。こちらで推し量る回避は二重になるので入れない（#246 の検分、2026-11-12）。
   */
  const { entries, loading, error } = useRankingMusics(enabled);

  const params = useMemo(
    () => ({
      power: power > 0 ? power : DEFAULT_PARAMS.power,
      bonus: bonus > 0 ? bonus : DEFAULT_PARAMS.bonus,
      taki,
      skillLeader: Number(skillLeader) > 0 ? Number(skillLeader) : DEFAULT_PARAMS.skillLeader,
      skillTotal: Number(skillTotal) > 0 ? Number(skillTotal) : DEFAULT_PARAMS.skillTotal,
      overheadSec: OVERHEAD_SEC.auto,
    }),
    [power, bonus, taki, skillLeader, skillTotal],
  );

  /** オート効率の高い順。選択肢に出すのは上位だけ（3660譜面を並べても選べない）。 */
  const options = useMemo<AutoSongOption[]>(() => {
    if (!enabled || entries.length === 0) return [];
    const ranked = rankSongs(entries, params, "auto").map((e) => ({
      key: autoSongKey(e.musicId, e.difficulty),
      label: `${e.title}　${DIFFICULTY_LABEL[e.difficulty as Difficulty] ?? e.difficulty}`,
      eventPt: e.eventPt,
      cycleSec: (e.musicTime ?? 0) + OVERHEAD_SEC.auto,
    }));
    const top = ranked.slice(0, 40);
    /**
     * ★ 選んでいる曲が上位40から外れても、**候補から消さない**。
     *   消すと選択が黙って1位に戻り、計画のポイントが理由の分からないまま変わる
     *   （焚き数や総合力を触ると順位は動く）。
     */
    if (songKey && !top.some((o) => o.key === songKey)) {
      const picked = ranked.find((o) => o.key === songKey);
      if (picked) top.push(picked);
    }
    return top;
  }, [enabled, entries, params, songKey]);

  /** 未選択なら効率1位を使う（開いた瞬間に妥当な値が出ている状態にする）。 */
  const selected = useMemo(
    () => options.find((o) => o.key === songKey) ?? options[0],
    [options, songKey],
  );

  const overridePt = Number(ptOverride.replace(/,/g, ""));
  const hasOverride = ptOverride.trim() !== "" && Number.isFinite(overridePt) && overridePt >= 0;
  const overrideCycle = Number(cycleOverride);
  const hasCycleOverride =
    cycleOverride.trim() !== "" && Number.isFinite(overrideCycle) && overrideCycle > 0;

  /** 使う値。**毎レンダーで作り直すと計画の再計算が走る**ので固定する。 */
  const runtime = useMemo(
    () => ({
      cycleSec: hasCycleOverride ? overrideCycle : (selected?.cycleSec ?? 0),
      ptPerPlay: hasOverride ? overridePt : (selected?.eventPt ?? 0),
      taki,
      dailyCap,
      usedToday: Math.max(0, Number(usedToday) || 0),
    }),
    [selected, hasOverride, overridePt, hasCycleOverride, overrideCycle, taki, dailyCap, usedToday],
  );

  return {
    /** 休憩にオートを積んでいるか（false なら楽曲データを読まず、候補も出さない）。 */
    enabled,
    course,
    setCourse,
    usedToday,
    setUsedToday,
    taki,
    setTaki,
    songKey: selected?.key ?? "",
    setSongKey,
    skillLeader,
    setSkillLeader,
    skillTotal,
    setSkillTotal,
    ptOverride,
    setPtOverride,
    hasOverride,
    cycleOverride,
    setCycleOverride,
    hasCycleOverride,
    options,
    selected,
    loading,
    error,
    /** 使う値。曲データが読めていなくても、単価を手入力すれば計算できる。 */
    runtime,
  };
}

export type AutoConfig = ReturnType<typeof useAutoConfig>;
