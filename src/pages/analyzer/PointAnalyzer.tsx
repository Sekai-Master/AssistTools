import { useEffect, useMemo, useRef, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { ActionButton } from "../../components/ui/ActionButton";
import { NeuButton } from "../../components/ui/NeuButton";
import { Switch } from "../../components/ui/Switch";
import { SongSearchModal } from "../../components/SongSearchModal";
import { useAnalyzerMusics } from "./useAnalyzerMusics";
import { calculatePlanV6, ENVY_ID, type CalculationResultV6 } from "./lib/calculator";
import { MAX_PT_VALUES_PER_PLAN } from "./lib/multiLiveAdjust";
import { calculateUnitBasePt } from "./lib/mySekai";
import { parseAmount, completeTargetSuffix } from "./lib/inputParsing";
import { byDistanceTo, recommendPlans } from "./lib/recommendPlans";
import type { UniversalPlan } from "./plan/types";
import { MySekaiStep } from "./steps/MySekaiStep";
import { LiveAdjustStep } from "./steps/LiveAdjustStep";
import { FinalRunStep } from "./steps/FinalRunStep";
import { onJacketError } from "../../lib/img";

const JACKET_BASE = `${import.meta.env.BASE_URL}MusicDatas/jacket/`;

export default function PointAnalyzer() {
  const { musics, aliases, loading, error: dataError } = useAnalyzerMusics();

  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [final, setFinal] = useState("");
  const [talent, setTalent] = useState("");
  const [bonus, setBonus] = useState("");
  const [hasWorldPass, setHasWorldPass] = useState(false);
  // マイセカイを使わない周回者向けモード。ONが従来挙動（既定）。
  const [useMySekai, setUseMySekai] = useState(true);
  // スコア上限（詳細設定）。文字列のまま持ち、数値化は計算時に行う。
  // 空欄・0以下・非数は undefined を渡し、lib 側の既定値（1,100,000）に正規化させる。
  const [maxScoreInput, setMaxScoreInput] = useState("");
  // ラストランの採択プラン（Step③の選択）。画像出力にも同じ選択を使うため親で保持する。
  const [finalPlan, setFinalPlan] = useState<UniversalPlan | null>(null);
  const [songId, setSongId] = useState(ENVY_ID);
  const [songModalOpen, setSongModalOpen] = useState(false);
  const [result, setResult] = useState<CalculationResultV6 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // 計算ボタン押下時だけ結果へスクロールする（Step3の曲変更での再計算では飛ばない）。
  const scrollOnResult = useRef(false);
  // 計算実行時に適用したオプションのスナップショット。
  // recalcWithSong（Step3の曲変更）が「いまの」state を読むと、計算後にトグルや
  // スコア上限を触ってから曲を変えた場合に、計算ボタンを押していないのに
  // モードごと結果が入れ替わってしまう（R3-4 LOW）。表示中の結果と同じ条件で
  // 再計算するため、handleCalc 時点の値を固定して使う。
  const appliedOptions = useRef<{ useMySekai: boolean; maxScore?: number }>({
    useMySekai: true,
  });
  // 計算実行時のボーナスのスナップショット（弱点1対応）。LiveAdjustStep/FinalRunStep は
  // これを受け取って、result.requiredPt（計算時ボーナスで導出済み）と同じ条件で
  // 独立探索（findSameBasePlans/planScoreZeroFinish）や表示用ソートを行う。
  // 計算後に入力欄のボーナスだけ書き換えてからトグルを押すと、表示中 result に対し
  // 別ボーナスで計算したプランを「厳密着地」として出してしまう事故（appliedOptions
  // と同じ穴のbonus版）をここで塞ぐ。appliedOptions（useMySekai/maxScore）と同じ
  // スナップショット方式に揃える。
  const appliedBonus = useRef(0);

  const bonusNum = parseAmount(bonus, true);

  useEffect(() => {
    if (!result || !scrollOnResult.current) return;
    scrollOnResult.current = false;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    resultRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [result]);

  // 入力中のマイセカイ単価ヒント
  const unitHint = useMemo(
    () => calculateUnitBasePt(parseAmount(talent), bonusNum, hasWorldPass),
    [talent, bonusNum, hasWorldPass]
  );

  // OFF時の複数回プラン結果（ON時は undefined）。NGバナーの理由別文言に使う。
  const resultMulti = result?.liveAdjustment.multi;

  // ラストランの採択プラン。Step③の選択をStep②の画像出力にも反映させるため親で持つ。
  // 未選択のときは推奨順の先頭＝画面で最初に薦めている案を実効値として使う。
  // 弱点1対応: ソートも appliedBonus（result計算時のボーナス）で行う。bonusNum
  // （入力欄のライブ値）のままだと、FinalRunStep内部の同種のソート（同じく
  // appliedBonus化済み）と選ぶ先頭案がずれる事故になる。appliedBonus.current は
  // handleCalc/recalcWithSong が result を差し替える直前に必ず同期更新するので、
  // このメモが再計算されるタイミング（result の変化）では常に対応済みの値になる。
  const finalRecommended = useMemo(
    () => (result ? recommendPlans(result.finalRunPlans, byDistanceTo(appliedBonus.current)) : []),
    [result]
  );
  const effectiveFinalPlan = finalPlan ?? finalRecommended[0];

  const selectedSong = musics.find((m) => m.id === songId);
  const musicList = useMemo(
    () => musics.map((m) => ({ id: m.id, basePoint: m.basePoint })),
    [musics]
  );

  const handleCalc = () => {
    if (musics.length === 0)
      return reject("楽曲データを読み込み中です。少し待ってから再度お試しください。");
    const c = parseAmount(current);
    const tv = parseAmount(target);
    const f = parseAmount(final);
    const tal = parseAmount(talent);
    const bon = parseAmount(bonus, true);
    if (tv <= c) return reject("目標ポイントは現在ポイントより大きくしてください。");
    if (!Number.isFinite(tal) || tal < 0) return reject("総合力は0以上で入力してください。");
    if (!Number.isFinite(bon) || bon < 0 || bon > 1000)
      return reject("イベントボーナスは0〜1000%で入力してください。");
    if (f > tv - c) return reject("最終獲得希望ポイントが差分を超えています。");
    setError(null);
    scrollOnResult.current = true;
    // 0以下・非数（parseAmount は 0 を返す）は undefined にして lib 側の既定値に委ねる。
    const ms = parseAmount(maxScoreInput);
    const options = { useMySekai, maxScore: ms > 0 ? ms : undefined };
    // Step3の曲変更再計算で同じ条件を使えるよう、適用オプションを固定する。
    appliedOptions.current = options;
    // 弱点1対応: この計算に実際使ったボーナスを固定する（appliedOptions と同じ理由）。
    appliedBonus.current = bon;
    // 前回の採択プランは新しい候補一覧に存在しない可能性があるので捨てる
    // （残すと画像に古い条件のラストランが載る）。
    setFinalPlan(null);
    setResult(calculatePlanV6(c, tv, f, tal, bon, hasWorldPass, songId, musicList, options));
  };

  // Step3で楽曲を変えたときの再計算（検証済み前提・スクロールはしない）。
  // オプションは「いまの」state ではなく handleCalc 時のスナップショットを使う。
  // state を読むと、計算後にトグルや上限を変更してから曲を変えた場合に
  // 表示中の結果と違う条件で黙って再計算されてしまうため（R3-4 LOW）。
  const recalcWithSong = (newId: string) => {
    setSongId(newId);
    if (!result) return;
    // 曲が変わると基礎点が変わり候補一覧も総入れ替えになるため、採択も破棄する。
    setFinalPlan(null);
    // このパスは bonus を「いまの」state（bonusNum）で再計算する既存仕様（R3-4）。
    // その代わり、実際に使ったボーナス値を appliedBonus に反映しておく
    // （弱点1対応: 子コンポーネントに渡す bonus は常に「result 計算に実際使った値」
    // であるという不変条件を、この再計算パスでも保つ）。
    appliedBonus.current = bonusNum;
    setResult(
      calculatePlanV6(
        parseAmount(current),
        parseAmount(target),
        parseAmount(final),
        parseAmount(talent),
        bonusNum,
        hasWorldPass,
        newId,
        musicList,
        appliedOptions.current
      )
    );
  };

  function reject(msg: string) {
    setResult(null);
    setError(msg);
  }

  const handleTargetBlur = () => {
    const completed = completeTargetSuffix(current, target);
    if (completed !== null) setTarget(completed);
  };

  return (
    <ToolPage unit="mmj" title="ポイント調整アナライザー" icon="analytics">
      {dataError && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {dataError}
        </div>
      )}
      <Panel title="ポイント設定">
        <div className="space-y-4">
          <Field label="現在ポイント" htmlFor="pa-current">
            <NeuInput
              id="pa-current"
              inputMode="numeric"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="例: 12,345,678"
            />
          </Field>
          <Field
            label="目標ポイント"
            htmlFor="pa-target"
            hint="下の桁だけ入力すると上の桁を自動補完（例: 311005 → 128,311,005）"
          >
            <NeuInput
              id="pa-target"
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={handleTargetBlur}
              placeholder="例: 13,000,000"
            />
          </Field>
          <Field label="最終獲得希望ポイント（任意）" htmlFor="pa-final">
            <NeuInput
              id="pa-final"
              inputMode="numeric"
              value={final}
              onChange={(e) => setFinal(e.target.value)}
              placeholder="例: 1005（無ければ0）"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="環境設定">
        <div className="space-y-4">
          <Field label="総合力" htmlFor="pa-talent">
            <NeuInput
              id="pa-talent"
              inputMode="numeric"
              value={talent}
              onChange={(e) => setTalent(e.target.value)}
              placeholder="例: 350,000"
            />
          </Field>
          <Field label="イベントボーナス (%)" htmlFor="pa-bonus">
            <NeuInput
              id="pa-bonus"
              inputMode="decimal"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              placeholder="例: 250.5"
            />
          </Field>
          <Field
            label="スコア上限（詳細設定）"
            htmlFor="pa-max-score"
            hint="調整・ラストランで狙えるスコアの上限。空欄で既定値（内部上限 3,000,000）"
          >
            <NeuInput
              id="pa-max-score"
              inputMode="numeric"
              value={maxScoreInput}
              onChange={(e) => setMaxScoreInput(e.target.value)}
              placeholder="既定 1,100,000"
            />
          </Field>
          <Switch checked={hasWorldPass} onChange={setHasWorldPass} label="ワールドパス 有効" />
          <Switch checked={useMySekai} onChange={setUseMySekai} label="マイセカイを利用する" />
          {/* OFF時は採取しないので単価表示は出さない（無関係な数字で混乱させないため）。 */}
          {useMySekai && (
            <div className="text-sm text-slate-500">
              <p>
                マイセカイ単価（自動算出）:{" "}
                <span className="font-bold" style={{ color: "var(--unit-color)" }}>
                  {unitHint} Pt/個
                </span>
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  β
                </span>
              </p>
              {/* 単価の根拠が揃っていない点を隠さない。詳細は docs/mysekai-unit-pt-open-questions.md */}
              <p className="mt-1 text-xs text-amber-700">
                マイセカイの単価は未確定要素があります。通常スタミナ（水色）とブーストスタミナ（オレンジ）で
                獲得ポイントが変わるという情報があり、現在の計算はこれを区別していません。
                ワールドパスの5倍も出典未確認です。参考値として扱ってください。
              </p>
            </div>
          )}
          <Field label="最終楽曲" hint={loading ? "楽曲データ読込中…" : `${musics.length}曲から選択`}>
            <div className="flex items-center gap-3">
              {selectedSong ? (
                <img
                  src={`${JACKET_BASE}${selectedSong.jacketLink}`}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover shadow-neu-sm shrink-0"
                  onError={onJacketError}
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-neu shadow-neu-inset shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate font-bold text-slate-700">
                  {selectedSong ? selectedSong.title : "未選択"}
                </p>
                {selectedSong && (
                  <p className="text-xs text-slate-500">
                    基礎点 {selectedSong.basePoint}
                    {selectedSong.basePointSource === "verified" && (
                      <span
                        className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: "var(--unit-color)" }}
                        title="実機計測で確定した基礎点（event_rate の系統誤差を補正）"
                      >
                        実測
                      </span>
                    )}
                  </p>
                )}
              </div>
              <NeuButton className="!px-3 !py-1.5 !text-xs shrink-0" onClick={() => setSongModalOpen(true)}>
                曲を選択
              </NeuButton>
            </div>
          </Field>
        </div>
      </Panel>

      <ActionButton onClick={handleCalc} disabled={loading} className="w-full text-base">
        {loading ? "楽曲データ読込中…" : "計算する"}
      </ActionButton>

      {error && (
        <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
          {error}
        </div>
      )}

      <div ref={resultRef} className="scroll-mt-20 space-y-6 empty:hidden">
        {result && (
          <>
            {!result.isVerified && result.targetPt - result.finalEstimatedPt > 0 && (
              <div className="neu-panel p-4 text-sm text-rose-600" role="alert">
                <p className="font-bold">この条件では目標ちょうどに着地できません</p>
                {/* マイセカイOFF時は複数回プラン（multi）のNG理由に沿って案内を出し分ける。
                    OVER_CAP: 回数上限超過。NO_EXACT: 厳密一致なし。それ以外はON時と同じ汎用文言。 */}
                {result.useMySekai === false && resultMulti?.reason === "OVER_CAP" ? (
                  <p className="mt-1 text-xs">
                    調整には最低 {(resultMulti.requiredLiveCount ?? 0).toLocaleString()}{" "}
                    回のライブが必要で、上限 {resultMulti.liveCountCap} 回を超えます。
                    マイセカイを利用する設定に切り替えるか、通常の周回で差分を縮めてから再計算してください。
                  </p>
                ) : result.useMySekai === false && resultMulti?.reason === "NO_EXACT" ? (
                  // 死角ケース（必要調整量が1回の最小獲得Ptを下回る）は「数ポイントずらす」では
                  // 絶対に抜けられないため、実際に必要なズラし幅を具体的な数値で案内する（R3-3）。
                  result.liveAdjustment.requiredPt > 0 &&
                  resultMulti.minPtPerLive > 0 &&
                  result.liveAdjustment.requiredPt < resultMulti.minPtPerLive ? (
                    <p className="mt-1 text-xs">
                      必要調整量 {result.liveAdjustment.requiredPt.toLocaleString()} Pt
                      は1回のライブの最小獲得 {resultMulti.minPtPerLive.toLocaleString()} Pt
                      を下回るため着地できません。 目標を{" "}
                      {result.liveAdjustment.requiredPt.toLocaleString()} Pt
                      下げて調整不要にするか、
                      {(
                        resultMulti.minPtPerLive - result.liveAdjustment.requiredPt
                      ).toLocaleString()}{" "}
                      Pt 以上引き上げてください。
                    </p>
                  ) : (
                    <p className="mt-1 text-xs">
                      探索範囲（最大{resultMulti.liveCountCap}回・Pt値{MAX_PT_VALUES_PER_PLAN}
                      種類の組合せ）では厳密一致が見つかりませんでした。
                      目標を見直して再計算するか、編成組み替え案（第2候補）を確認してください。
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-xs">
                    {(result.targetPt - result.finalEstimatedPt).toLocaleString()} Pt
                    の差が埋まりません。目標を数ポイントずらすか、ボーナスを調整してください。
                  </p>
                )}
              </div>
            )}
            <MySekaiStep result={result} />
            <LiveAdjustStep
              result={result}
              bonus={appliedBonus.current}
              musics={musics}
              aliases={aliases}
              finalSong={selectedSong}
              finalRunPlan={effectiveFinalPlan}
            />
            {result.finalRunPt > 0 && (
              <FinalRunStep
                result={result}
                musics={musics}
                aliases={aliases}
                jacketBase={JACKET_BASE}
                bonus={appliedBonus.current}
                selectedSong={selectedSong}
                onChangeSong={recalcWithSong}
                selectedPlan={finalPlan}
                onSelectPlan={setFinalPlan}
              />
            )}
          </>
        )}
      </div>

      {songModalOpen && (
        <SongSearchModal
          musics={musics}
          aliases={aliases}
          jacketBase={JACKET_BASE}
          title="最終楽曲を選択"
          meta={(m) => `基礎点 ${m.basePoint}`}
          onSelect={(m) => {
            setSongId(m.id);
            setSongModalOpen(false);
          }}
          onClose={() => setSongModalOpen(false)}
        />
      )}
    </ToolPage>
  );
}

