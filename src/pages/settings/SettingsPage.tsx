import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  MOTION_LABEL,
  MOTION_NOTE,
  MOTION_SETTINGS,
  resolvePlan,
  totalMs,
  type MotionSetting,
} from "../../motion/plan";
import { setMotionSetting, useMotionSetting } from "../../motion/settingsStore";
import { useStage } from "../../motion/stageContext";
import { useReducedMotion } from "../../motion/useReducedMotion";

const OPTIONS = MOTION_SETTINGS.map((v) => ({ value: v, label: MOTION_LABEL[v] }));

/**
 * 設定画面。
 *
 * ツールではないので ToolPage を使わず、--unit-color も差し替えない。
 * :root 既定の #667 のままだとセグメントのつまみも見出しバナーもニュートラルな
 * グレーになる ＝「どのユニットにも属さないシステムの画面」であることを色で語る、
 * 意図的な区別。見出しは既存の .unit-title をそのまま使うので造形の連続性は保つ。
 */
export function SettingsPage() {
  const setting = useMotionSetting();
  const osReduce = useReducedMotion();
  const plan = resolvePlan(setting, osReduce);
  const { preview } = useStage();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="unit-title text-xl font-bold">
        <span className="material-icons" aria-hidden>
          tune
        </span>
        <span>設定</span>
      </h1>

      <div className="mt-6 space-y-6">
        <Panel title="画面遷移のアニメーション">
          <p className="text-sm text-slate-500">
            ページを切り替えるとき、影を沈めて画面をいったん無地の面に戻し、
            そこから影を育てて表面へ押し出します。端末が重いと感じるときは弱められます。
          </p>

          <SegmentedControl<MotionSetting>
            className="mt-4"
            options={OPTIONS}
            value={setting}
            onChange={setMotionSetting}
          />

          <p className="mt-3 text-sm text-slate-600">{MOTION_NOTE[setting]}</p>
          <p className="mt-1 text-xs text-slate-400">
            遷移にかかる時間: 約 {totalMs(plan)} ミリ秒
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <NeuButton onClick={preview} disabled={plan.riseMs === 0}>
              この設定で試す
            </NeuButton>
            <span className="text-xs text-slate-500">
              {plan.riseMs === 0
                ? "「オフ」では再生する演出がありません。"
                : "このページのまま、演出だけ1回再生します。"}
            </span>
          </div>

          {osReduce && (
            /* 黙って上書きしない。OS 側の意思表示があることを必ず見せる。 */
            <p className="mt-5 rounded-lg p-3 text-xs leading-relaxed text-slate-600 shadow-neu-inset">
              端末の「視差効果を減らす」がオンになっています。
              {setting === "auto"
                ? "「自動」のあいだは演出をオフにします。"
                : "ここでの選択が端末の設定より優先されます。"}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
