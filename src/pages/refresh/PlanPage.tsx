import { useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { TakiInput } from "../../components/ui/TakiInput";
import { Switch } from "../../components/ui/Switch";
import { ProfileBar, SaveToProfile } from "../../components/ui/ProfileBar";
import { MoreSettings } from "../../components/ui/MoreSettings";
import { countChanged } from "../../lib/countChanged";
import { calculateUnitBasePt } from "../analyzer/lib/mySekai";
import { parseAmount } from "../analyzer/lib/inputParsing";
import { RateCalibrator } from "./RateCalibrator";
import { useAnalyzerMusics } from "../analyzer/useAnalyzerMusics";
import { useGaugeInputs } from "./useGaugeInputs";
import { GaugeInputsPanel } from "./GaugeInputsPanel";
import { PlanTimeline } from "./PlanTimeline";
import { AutoPanel } from "./AutoPanel";
import { useAutoConfig } from "./useAutoConfig";
import { nearestRoundTime } from "./lib/format";
import type { Segment } from "./lib/timeline";
import {
  type SavedPlan,
  deletePlan,
  listPlans,
  savePlan,
} from "./lib/planStorage";

const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");

/**
 * 周回プラン（全部入り）。曲・現在ゲージ・周回ペースに加えて、点数時速・焚き数を設定し、
 * タイムラインに 曲プレイ／休憩／マイセカイ を積んで「各時点の時刻・ゲージ・累積到達ポイント」を出す。
 * ゲージが100%に達したブロックはムダ時間ぶんが加点されない（ゲージと点数が連動）。
 * 組んだプランは名前付きでローカル保存（呼び出し・削除）できる。
 */
export default function PlanPage() {
  const { musics, aliases, loading, error: dataError } = useAnalyzerMusics();
  const inputs = useGaugeInputs(musics);
  const { selectedSong, overhead, gaugePct, ratePerHour } = inputs;

  const [currentPt, setCurrentPt] = useState("");
  const [hourlyRate, setHourlyRate] = useState("500000");
  const [refTaki, setRefTaki] = useState(5);
  // マイセカイの単価を出すための編成。周回の点数時速（実測）とは出どころが違い、
  // こちらは総合力とボーナスから計算で出る。
  const [talent, setTalent] = useState("");
  const [bonus, setBonus] = useState("");
  const [hasWorldPass, setHasWorldPass] = useState(false);

  // タイムライン本体（保存対象なので親で保持）
  const [segments, setSegments] = useState<Segment[]>([]);
  const [startTime, setStartTime] = useState(nearestRoundTime);

  // 保存プラン
  const [saved, setSaved] = useState<SavedPlan[]>(() => listPlans());
  const [planName, setPlanName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  /** 休憩にオートを積んでいるときだけ、難易度別データ（428KB）を読む。 */
  const usesAuto = useMemo(
    () => segments.some((g) => g.kind === "rest" && g.auto),
    [segments],
  );
  const autoConfig = useAutoConfig({
    enabled: usesAuto,
    power: parseAmount(talent),
    bonus: parseAmount(bonus, true),
  });

  /**
   * 「詳しく計算する」の中で、既定値から変えている項目の数（見出しに出す）。
   * 既定値は各 useState の初期値（useAutoConfig を含む）。オートの曲は「未選択なら効率 1 位」なので数えない。
   */
  const advancedChanged = countChanged([
    [refTaki, 5],
    [talent, ""],
    [bonus, ""],
    [hasWorldPass, false],
    [autoConfig.course, "none"],
    [autoConfig.usedToday, "0"],
    [autoConfig.taki, 10],
    [autoConfig.ptOverride, ""],
    [autoConfig.cycleOverride, ""],
    [autoConfig.skillLeader, ""],
    [autoConfig.skillTotal, ""],
  ]);

  /** マイセカイ 1メモリあたりのPt。総合力かボーナスが未入力なら0＝計上しない。 */
  const mySekaiUnitPt = useMemo(() => {
    const power = parseAmount(talent);
    const bonusPct = parseAmount(bonus, true);
    // ★ 片方だけ入れた状態で計算すると、ボーナス0%の低い単価が黙って出る。
    //   両方揃うまでは0（＝計上しない）にして、入力を促す方が安全。
    if (!(power > 0) || !(bonusPct > 0)) return 0;
    return calculateUnitBasePt(power, bonusPct, hasWorldPass);
  }, [talent, bonus, hasWorldPass]);

  const points = useMemo(
    () => ({
      startPoints: Number(currentPt) || 0,
      hourlyRate: Number(hourlyRate) || 0,
      refTaki,
      mySekaiUnitPt,
    }),
    [currentPt, hourlyRate, refTaki, mySekaiUnitPt],
  );

  const doSave = () => {
    const name = planName.trim();
    if (!name) {
      setNotice("プラン名を入れてください。");
      return;
    }
    const plan: SavedPlan = {
      name,
      savedAt: Date.now(),
      startTime,
      segments,
      inputs: {
        songId: inputs.songId,
        gauge: inputs.gauge,
        nextDecay: inputs.nextDecay,
        rate: inputs.rate,
        currentPt,
        hourlyRate,
        refTaki,
        talent,
        bonus,
        hasWorldPass,
        auto: {
          course: autoConfig.course,
          usedToday: autoConfig.usedToday,
          taki: autoConfig.taki,
          songKey: autoConfig.songKey,
          skillLeader: autoConfig.skillLeader,
          skillTotal: autoConfig.skillTotal,
          ptOverride: autoConfig.ptOverride,
          cycleOverride: autoConfig.cycleOverride,
        },
      },
    };
    setSaved(savePlan(plan));
    setNotice(`「${name}」を保存しました。`);
  };

  const loadPlan = (plan: SavedPlan) => {
    setSegments(plan.segments);
    setStartTime(plan.startTime);
    inputs.setSongId(plan.inputs.songId);
    inputs.setGauge(plan.inputs.gauge);
    // 旧データには無いので、欠けていたら空欄（＝30分フル扱い）に戻す。
    inputs.setNextDecay(plan.inputs.nextDecay ?? "");
    inputs.setRate(plan.inputs.rate);
    setCurrentPt(plan.inputs.currentPt);
    setHourlyRate(plan.inputs.hourlyRate);
    setRefTaki(plan.inputs.refTaki);
    setTalent(plan.inputs.talent ?? "");
    setBonus(plan.inputs.bonus ?? "");
    setHasWorldPass(plan.inputs.hasWorldPass ?? false);
    const a = plan.inputs.auto;
    if (a) {
      autoConfig.setCourse(a.course);
      autoConfig.setUsedToday(a.usedToday);
      autoConfig.setTaki(a.taki);
      autoConfig.setSongKey(a.songKey);
      autoConfig.setSkillLeader(a.skillLeader);
      autoConfig.setSkillTotal(a.skillTotal);
      autoConfig.setPtOverride(a.ptOverride);
      autoConfig.setCycleOverride(a.cycleOverride ?? "");
    }
    setPlanName(plan.name);
    setNotice(`「${plan.name}」を呼び出しました。`);
  };

  const removePlan = (name: string) => {
    setSaved(deletePlan(name));
    setNotice(`「${name}」を削除しました。`);
  };

  return (
    <ToolPage morphKey="tool:plan" title="周回プラン" icon="event_note">
      {/* ★ このページは編成の値を4か所（点数時速・焚き数・マイセカイ単価・オートのスコア）で
          使う。反映ボタンを1つのパネルの中に隠すと、他のパネルの値が手打ちのまま残る
          （実際そうなっていた）。ページの前提なので一番上に置く。 */}
      <ProfileBar
        apply={(p) => {
          if (p.hourlyRate != null) setHourlyRate(String(p.hourlyRate));
          if (p.taki != null) setRefTaki(p.taki);
          if (p.power != null) setTalent(String(p.power));
          if (p.bonus != null) setBonus(String(p.bonus));
          // オートのスコアはスキルの内部値で変わる。ここを入れないと
          // 既定値（150/650）のまま「編成から計算した」顔をする。
          if (p.skillLeader != null) autoConfig.setSkillLeader(String(p.skillLeader));
          if (p.skillTotal != null) autoConfig.setSkillTotal(String(p.skillTotal));
        }}
      />
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}

      <GaugeInputsPanel
        inputs={inputs}
        musics={musics}
        aliases={aliases}
        loading={loading}
      />

      <Panel title="ポイント設定">
        {/* 時速・基準焚き数は稼働時間計算と同じ値。片方だけ編成から呼べると、
            もう片方で打ち直すことになるので両方に置く。 */}
        {/* 保存は**その値を打っている場所の隣**に置く（何が保存されるか分かるように）。 */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <SaveToProfile
            collect={() => ({
              hourlyRate: Number(hourlyRate) || undefined,
              taki: refTaki,
            })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="現在ポイント"
            htmlFor="pl-cur"
            hint="ここを起点に加算します"
          >
            <NeuInput
              id="pl-cur"
              inputMode="numeric"
              value={currentPt}
              onChange={(e) => setCurrentPt(onlyDigits(e.target.value))}
              placeholder="例: 128311005"
              className="max-w-44"
            />
          </Field>
          <Field
            label="点数時速"
            htmlFor="pl-rate"
            hint="この焚き数での実測 pt/時"
          >
            <div className="flex items-center gap-1">
              <NeuInput
                id="pl-rate"
                inputMode="numeric"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(onlyDigits(e.target.value))}
                className="max-w-44"
              />
              <span className="text-sm text-slate-500">pt/時</span>
            </div>
          </Field>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          「上の曲」を選んで下の「＋稼働」で枠を積むと、各枠の焚き数・獲得ptと累積到達ptが出ます。
          ゲージが100%に達すると、そのぶんは加点されません（休憩・マイセカイで回復を）。
        </p>
      </Panel>

      {/**
       * ★ 任意の入力は「詳しく計算する」に畳む（UX 監査 2026-11-12、指示書の共通の型 1、PR-6）。
       *   前は入力 16 個が開いたまま並び、結果（タイムライン）は 3 画面目の下だった。主な入力は
       *   曲・現在のゲージ（・次の回復まで・周回ペース）・現在ポイント・点数時速。ここに入れるのは、既定値のままでも
       *   計算が出るもの（基準焚き数と較正・編成・オート・プランの保存）。畳んだ中の値も計算に使うので、
       *   既定値から変えた数と、オートを使っているかを見出しに出す。
       */}
      <MoreSettings
        variant="section"
        contents="基準焚き数・編成・オート・プランの保存"
        changed={advancedChanged}
        note={usesAuto ? "オートを使用中" : undefined}
      >
        <Panel title="時速の前提">
          <Field label="基準焚き数" hint="上の時速を出した焚き数">
            <TakiInput value={refTaki} onChange={setRefTaki} />
          </Field>
          <RateCalibrator
            hourlyRate={hourlyRate}
            setHourlyRate={setHourlyRate}
            refTaki={refTaki}
            setRefTaki={setRefTaki}
            pace={inputs.rate}
            setPace={inputs.setRate}
          />
        </Panel>

        <Panel title="編成（マイセカイ・オートの計算に使う）">
          {/* 点数時速は実測値だが、マイセカイの単価とオートのスコアは総合力とボーナスから
              計算で出る。入れておくと採取ブロックとオートが点数として積み上がる。 */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="総合力" htmlFor="pl-talent">
              <NeuInput
                id="pl-talent"
                inputMode="numeric"
                value={talent}
                onChange={(e) => setTalent(e.target.value)}
                placeholder="例: 336,000"
              />
            </Field>
            <Field label="イベントボーナス (%)" htmlFor="pl-bonus">
              <NeuInput
                id="pl-bonus"
                inputMode="decimal"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                placeholder="例: 821"
              />
            </Field>
            <Field label="ワールドパス">
              <Switch
                checked={hasWorldPass}
                onChange={setHasWorldPass}
                label="ワールドパス 有効"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <SaveToProfile
              collect={() => ({
                power: parseAmount(talent) || undefined,
                bonus: parseAmount(bonus, true) || undefined,
              })}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {mySekaiUnitPt > 0 ? (
              <>
                1メモリあたり{" "}
                <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                  {mySekaiUnitPt.toLocaleString()} pt
                </span>
                。全回収1回（約89.5メモリ）で約{" "}
                {Math.floor(mySekaiUnitPt * 89.5).toLocaleString()} pt です。
              </>
            ) : (
              "総合力とイベントボーナスを入れると、マイセカイ採取のポイントも積み上がります（未入力のあいだは0のまま）。"
            )}
          </p>
        </Panel>

        <AutoPanel config={autoConfig} />

        <Panel title="プランの保存・呼び出し">
          <div className="flex flex-wrap items-center gap-2">
            <NeuInput
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="プラン名（例: 後半戦フル稼働）"
              className="max-w-64"
              aria-label="プラン名"
            />
            <NeuButton
              onClick={doSave}
              className="!py-1.5"
              disabled={segments.length === 0}
            >
              この内容を保存
            </NeuButton>
            {notice && <span className="text-xs text-slate-500">{notice}</span>}
          </div>

          {saved.length === 0 ? (
            <p className="mt-3 text-xs text-slate-400">
              保存したプランはこの端末（ブラウザ）に残ります。まずタイムラインを組んで名前を付けて保存。
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {saved.map((p) => (
                <li
                  key={p.name}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 p-3 text-sm"
                >
                  <span className="font-bold text-slate-700">{p.name}</span>
                  <span className="text-xs text-slate-400">
                    {p.segments.length}ブロック
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <NeuButton
                      onClick={() => loadPlan(p)}
                      className="!py-1 !text-xs"
                    >
                      呼び出し
                    </NeuButton>
                    <button
                      type="button"
                      aria-label="削除"
                      onClick={() => removePlan(p.name)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </MoreSettings>

      <PlanTimeline
        toolId="plan"
        points={points}
        selectedSong={selectedSong}
        overhead={overhead}
        startPercent={gaugePct}
        startDecayProgress={inputs.startDecayProgress}
        ratePerHour={ratePerHour}
        auto={autoConfig.runtime}
        segments={segments}
        setSegments={setSegments}
        startTime={startTime}
        setStartTime={setStartTime}
      />
    </ToolPage>
  );
}
