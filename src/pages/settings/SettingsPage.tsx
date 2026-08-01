import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  firstPaintMs,
  MOTION_LABEL,
  MOTION_NOTE,
  MOTION_SETTINGS,
  resolvePlan,
  totalMs,
  type MotionSetting,
} from "../../motion/plan";
import { setMotionSetting, useMotionSetting } from "../../motion/settingsStore";
import { useStage } from "../../motion/stageContext";
import { useReducedMotion, useTouchOnly } from "../../motion/environment";
import {
  resolveTheme,
  setTheme,
  THEME_LABEL,
  THEME_NOTE,
  THEMES,
  usePrefersDark,
  useTheme,
  type Theme,
} from "../../lib/theme";
import { ProfilePanel } from "./ProfilePanel";
import { StoredDataPanel } from "./StoredDataPanel";

const OPTIONS = MOTION_SETTINGS.map((v) => ({ value: v, label: MOTION_LABEL[v] }));
const THEME_OPTIONS = THEMES.map((v) => ({ value: v, label: THEME_LABEL[v] }));

const LEVEL_LABEL: Record<string, string> = {
  off: "オフ",
  subtle: "控えめ",
  rich: "リッチ",
};

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
  const touchOnly = useTouchOnly();
  const plan = resolvePlan(setting, { osReduce, touchOnly });
  const { preview } = useStage();
  const theme = useTheme();
  const deviceDark = usePrefersDark();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="unit-title text-xl font-bold">
        <span className="material-icons" aria-hidden>
          tune
        </span>
        <span>設定</span>
      </h1>

      <div className="mt-6 space-y-6">
        {/* 数値ツールの初期値になるので、見た目の設定より先に置く。 */}
        <ProfilePanel />

        <Panel title="配色">
          <p className="text-sm text-slate-500">
            明るい配色と暗い配色を切り替えます。素材の色と影の落差が入れ替わるだけで、
            造形（浮き沈み）と各ツールの色はそのままです。
          </p>

          <SegmentedControl<Theme>
            className="mt-4"
            options={THEME_OPTIONS}
            value={theme}
            onChange={setTheme}
          />

          <p className="mt-3 text-sm text-slate-600">{THEME_NOTE[theme]}</p>
          {/* 「自動」が何に解決されたかを必ず見せる（演出の設定と同じ作法）。 */}
          {theme === "auto" && (
            <p className="mt-1 text-xs text-slate-500">
              この端末では
              <strong className="font-bold">
                「{resolveTheme(theme, deviceDark) === "dark" ? "ダーク" : "ライト"}」
              </strong>
              で表示しています
            </p>
          )}
        </Panel>

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
          {/* 「自動」が何に解決されたかを必ず見せる。裏で勝手に決めない。 */}
          <p className="mt-1 text-xs text-slate-500">
            {setting === "auto" && (
              <>
                この端末では<strong className="font-bold">「{LEVEL_LABEL[plan.level]}」</strong>
                で動いています ／{" "}
              </>
            )}
            {/* 合計だけ出すと「1秒待たされる」に読めるが、実際に待つのは最初の
                ブロックが出るまで。2つ並べて意味が変わらないようにする。 */}
            次のページが出はじめるまで 約 {firstPaintMs(plan)} ミリ秒
            {plan.riseMs > 0 && <> ／ 出そろうまで 約 {totalMs(plan)} ミリ秒</>}
          </p>

          {plan.level === "rich" && touchOnly && (
            /* 端末クラスで勝手に降格はしない（設定 UI の意味が壊れる）。
               代わりに、選んだ本人に材料だけ渡す。 */
            <p className="mt-3 rounded-lg p-3 text-xs leading-relaxed text-slate-600 shadow-neu-inset">
              「リッチ」は影とぼかしを毎フレーム描き直すので、スマホ・タブレットでは
              コマ落ちすることがあります。重いと感じたら「控えめ」にしてください。
            </p>
          )}

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

        <StoredDataPanel />
      </div>
    </div>
  );
}
