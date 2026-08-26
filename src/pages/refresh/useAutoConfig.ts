import { useMemo, useState } from "react";
import { OVERHEAD_SEC } from "../../lib/overhead";
import { useRankingMusics } from "../ranking/useRankingMusics";
import { DIFFICULTY_LABEL, type Difficulty } from "../ranking/useRankingMusics";
import { DEFAULT_PARAMS, rankSongs } from "../ranking/lib/efficiency";
import { PASS_LIMITS, type PassCourse } from "../ranking/lib/lbRun";

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
  const [course, setCourse] = useState<PassCourse>("none");
  const [usedToday, setUsedToday] = useState("0");
  const [taki, setTaki] = useState(10);
  const [songKey, setSongKey] = useState("");
  const [skillLeader, setSkillLeader] = useState("");
  const [skillTotal, setSkillTotal] = useState("");
  const [ptOverride, setPtOverride] = useState("");

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

  return {
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
    options,
    selected,
    loading,
    error,
    /** 使う値。曲データが読めていなくても、単価を手入力すれば計算できる。 */
    runtime: {
      cycleSec: selected?.cycleSec ?? 0,
      ptPerPlay: hasOverride ? overridePt : (selected?.eventPt ?? 0),
      taki,
      dailyCap: PASS_LIMITS[course].autoPlays,
      usedToday: Math.max(0, Number(usedToday) || 0),
    },
  };
}

export type AutoConfig = ReturnType<typeof useAutoConfig>;
