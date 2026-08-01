import { useMemo, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { MOTION_LABEL, MOTION_SETTINGS, type MotionSetting } from "../../motion/plan";
import { THEME_LABEL, THEMES, type Theme } from "../../lib/theme";

/**
 * この端末に保存しているもの。
 *
 * 全部ブラウザの localStorage に置いていて、サーバへは何も送っていない。
 * ツールごとにバラバラの場所へ溜まるので、**何が残っているか**と
 * **どこから消せるか**を1箇所で見せる。
 *
 * ★ 見せるのは中身の要約であってバイト数ではない。「2 文字」と言われても
 *   利用者には何の意味も無いし、空配列 `[]` が保存済みに見えてしまう
 *   （実際そうなっていた）。中身が実質空なら行ごと出さない。
 *
 * ★ キーは各ツールが持っている実体をそのまま並べている。命名が揃っていないのは
 *   歴史的経緯で、揃えると保存済みデータが読めなくなるため触っていない。
 */
interface StoredItem {
  key: string;
  label: string;
  note: string;
  /** 中身の要約。実質空なら null を返す（＝一覧に出さない）。 */
  summarize: (raw: string) => string | null;
}

/** 壊れた内容でも「消す」導線は出したいので、読めない場合は null にしない。 */
const BROKEN = "内容を読み取れませんでした";

/** 配列で持っているもの（プラン・履歴）。 */
const countEntries =
  (unit: string) =>
  (raw: string): string | null => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return BROKEN;
      return parsed.length === 0 ? null : `${parsed.length} ${unit}`;
    } catch {
      return BROKEN;
    }
  };

/** 選択肢のどれかを文字列で持っているもの（各種設定）。 */
const pickLabel =
  <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  (raw: string): string | null =>
    (values as readonly string[]).includes(raw) ? labels[raw as T] : BROKEN;

/**
 * ランキングの入力。保存時に必ずバージョン `v` が入るので、
 * それ以外のキーが1つも無ければ「まだ何も入力していない」とみなす。
 */
function summarizeRanking(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return BROKEN;
    const keys = Object.keys(parsed).filter((k) => k !== "v");
    return keys.length === 0 ? null : `${keys.length} 項目`;
  } catch {
    return BROKEN;
  }
}

const ITEMS: StoredItem[] = [
  {
    key: "sekaimaster:profiles:v1",
    label: "編成",
    note: "このページで登録した総合力・ボーナスなど",
    summarize: countEntries("件"),
  },
  {
    key: "sekaimaster:plans:v1",
    label: "周回プラン",
    note: "「周回プラン」で名前を付けて保存したもの",
    summarize: countEntries("件"),
  },
  {
    key: "tweetGenerator.history",
    label: "ついぼの入力履歴",
    note: "「ついぼジェネレーター」で保存した募集内容",
    summarize: countEntries("件"),
  },
  {
    key: "sekai-master:ranking-inputs",
    label: "ランキングの入力",
    note: "「効率曲ランキング」の総合力・イベントボーナスなど",
    summarize: summarizeRanking,
  },
  {
    key: "sekaimaster:motion:v1",
    label: "画面遷移の設定",
    note: "このページで選んだ段階",
    summarize: pickLabel<MotionSetting>(MOTION_SETTINGS, MOTION_LABEL),
  },
  {
    key: "sekaimaster:theme:v1",
    label: "配色の設定",
    note: "このページで選んだ配色",
    summarize: pickLabel<Theme>(THEMES, THEME_LABEL),
  },
];

interface Row extends StoredItem {
  summary: string;
}

function readRows(): Row[] {
  return ITEMS.flatMap((item) => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(item.key);
    } catch {
      // プライベートモード等。読めないなら「無い」と同じ扱いでよい。
    }
    if (raw === null) return [];
    const summary = item.summarize(raw);
    return summary === null ? [] : [{ ...item, summary }];
  });
}

export function StoredDataPanel() {
  // 消したあとに一覧を引き直すためだけのカウンタ。
  const [revision, setRevision] = useState(0);
  // 一度押しただけでは消さない。消えて困るものが混ざっているため。
  const [confirming, setConfirming] = useState<string | null>(null);

  const rows = useMemo(() => readRows(), [revision]);

  const remove = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // 消せなくても一覧は引き直す（残っていれば次の描画で分かる）。
    }
    setConfirming(null);
    setRevision((v) => v + 1);
    // 設定系のキーを消しても、画面に出ている値はここで戻さない。
    // 戻すと「消したのに残っている」ように見える。次に開いたときから既定になる。
  };

  return (
    <Panel title="この端末に保存しているもの">
      <p className="text-sm text-slate-500">
        すべてこのブラウザの中だけに保存しています（サーバへは送っていません）。
        ブラウザの履歴消去や別の端末では引き継がれません。
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">いまは何も保存されていません。</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-3 shadow-neu-inset"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-700">
                  {r.label}
                  <span className="ml-2 font-normal text-slate-500">{r.summary}</span>
                </span>
                <span className="block text-xs text-slate-500">{r.note}</span>
              </span>
              {confirming === r.key ? (
                <span className="flex items-center gap-2">
                  <NeuButton className="!px-3 !py-1 !text-rose-600" onClick={() => remove(r.key)}>
                    本当に消す
                  </NeuButton>
                  <NeuButton className="!px-3 !py-1" onClick={() => setConfirming(null)}>
                    やめる
                  </NeuButton>
                </span>
              ) : (
                <NeuButton className="!px-3 !py-1" onClick={() => setConfirming(r.key)}>
                  消す
                </NeuButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
