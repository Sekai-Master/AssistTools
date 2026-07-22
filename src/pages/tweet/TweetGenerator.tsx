import { useEffect, useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuButton } from "../../components/ui/NeuButton";
import { Switch } from "../../components/ui/Switch";
import { Segmented } from "../../components/ui/Segmented";
import {
  DEFAULT_TWEET_STATE,
  buildTweetText,
  convertToHalfWidth,
  tweetIntentUrl,
  type TweetState,
} from "./tweetLogic";

const HISTORY_KEY = "tweetGenerator.history";
const HISTORY_MAX = 10;

interface HistoryItem {
  state: TweetState;
  dateTime: string;
  favorite: boolean;
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

/** 半角数字のみ残す（現行の「非数値で全消去」より穏当に）。 */
const digitsOnly = (v: string) => convertToHalfWidth(v).replace(/[^0-9]/g, "");

export default function TweetGenerator() {
  const [s, setS] = useState<TweetState>(DEFAULT_TWEET_STATE);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  const set = <K extends keyof TweetState>(key: K, value: TweetState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const preview = useMemo(() => buildTweetText(s), [s]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* 保存に失敗しても致命ではない */
    }
  }, [history]);

  const saveHistory = () =>
    setHistory((prev) =>
      [{ state: s, dateTime: new Date().toLocaleString(), favorite: false }, ...prev].slice(
        0,
        HISTORY_MAX
      )
    );

  return (
    <ToolPage unit="vs" title="ついぼジェネレーター" icon="campaign">
      <Panel title="募集内容">
        <div className="space-y-4">
          <Field label="TL放流">
            <Segmented
              options={[
                { value: "", label: "あり" },
                { value: "@No_TL", label: "なし" },
              ]}
              value={s.tlFlow}
              onChange={(v) => set("tlFlow", v)}
            />
          </Field>
          <Field label="ルーム">
            <Segmented
              options={[
                { value: "ベテラン", label: "ベテラン" },
                { value: "フリー", label: "フリー" },
              ]}
              value={s.room}
              onChange={(v) => set("room", v)}
            />
          </Field>
          <Field label="楽曲">
            <Segmented
              options={["🦐", "ビバハピ", "ロスエン", "Sage", "おまかせ"].map((v) => ({
                value: v,
                label: v,
              }))}
              value={s.song}
              onChange={(v) => set("song", v)}
            />
          </Field>
          <Field label="回数">
            <Segmented
              options={[
                "高速周回",
                "周回",
                "2回",
                "3回",
                "4回",
                "5回",
                "6回",
                "7回",
                "8回",
              ].map((v) => ({ value: v, label: v }))}
              value={s.rounds}
              onChange={(v) => set("rounds", v)}
            />
          </Field>
          <Field label="残り枠">
            <Segmented
              options={["1", "2", "3", "4"].map((v) => ({ value: v, label: `@${v}` }))}
              value={s.remainingSlots}
              onChange={(v) => set("remainingSlots", v)}
            />
          </Field>
          <Field label="ルームID記号">
            <Segmented
              options={[
                { value: "🔑", label: "🔑" },
                { value: "ルームID", label: "ルームID" },
              ]}
              value={s.roomIdSymbol}
              onChange={(v) => set("roomIdSymbol", v)}
            />
          </Field>
          <Field label="ルームID" htmlFor="tg-roomid">
            <NeuInput
              id="tg-roomid"
              inputMode="numeric"
              maxLength={5}
              value={s.roomId}
              onChange={(e) => set("roomId", digitsOnly(e.target.value))}
              placeholder="ルームIDを入力"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="主（募集主）">
        <div className="space-y-4">
          <SkillRow
            label="主スキル値"
            show={s.showHostSkill}
            onShow={(b) => set("showHostSkill", b)}
            value={s.hostSkill}
            onValue={(v) => set("hostSkill", digitsOnly(v))}
            maxLength={3}
          />
          <SkillRow
            label="主内部値"
            show={s.showHostInnerValue}
            onShow={(b) => set("showHostInnerValue", b)}
            value={s.hostInnerValue}
            onValue={(v) => set("hostInnerValue", digitsOnly(v))}
            maxLength={6}
          />
          <SkillRow
            label="条件外人数"
            show={s.showConditionOutside}
            onShow={(b) => set("showConditionOutside", b)}
            value={s.conditionOutside}
            onValue={(v) => set("conditionOutside", digitsOnly(v))}
            maxLength={2}
          />
          <SkillRow
            label="支援者人数"
            show={s.showSupporter}
            onShow={(b) => set("showSupporter", b)}
            value={s.supporterCount}
            onValue={(v) => set("supporterCount", digitsOnly(v))}
            maxLength={2}
          />
          <div className="space-y-2">
            <Switch
              checked={s.showFreeDescription}
              onChange={(b) => set("showFreeDescription", b)}
              label="自由記述"
            />
            {s.showFreeDescription && (
              <NeuInput
                value={s.freeDescription}
                onChange={(e) => set("freeDescription", e.target.value)}
                placeholder="自由記述を入力"
              />
            )}
          </div>
        </div>
      </Panel>

      <Panel title="募（募集）">
        <div className="space-y-4">
          <SkillRow
            label="募集スキル値"
            show={s.showRequiredSkill}
            onShow={(b) => set("showRequiredSkill", b)}
            value={s.requiredSkill}
            onValue={(v) => set("requiredSkill", digitsOnly(v))}
            maxLength={3}
          />
          <SkillRow
            label="募集内部値"
            show={s.showRequiredInnerValue}
            onShow={(b) => set("showRequiredInnerValue", b)}
            value={s.requiredInnerValue}
            onValue={(v) => set("requiredInnerValue", digitsOnly(v))}
            maxLength={6}
          />
          <div className="flex flex-wrap gap-4">
            <Switch checked={s.showStar4} onChange={(b) => set("showStar4", b)} label="☆４" />
            <Switch
              checked={s.showLongSession}
              onChange={(b) => set("showLongSession", b)}
              label="長時間できる方"
            />
            <Switch
              checked={s.showSfcNoCare}
              onChange={(b) => set("showSfcNoCare", b)}
              label="SFC気にしません"
            />
            <Switch
              checked={s.showMidLeaveOk}
              onChange={(b) => set("showMidLeaveOk", b)}
              label="途中抜けOK"
            />
            <Switch
              checked={s.showJudgementStrengthenDisabled}
              onChange={(b) => set("showJudgementStrengthenDisabled", b)}
              label="判定強化✖"
            />
            <Switch
              checked={s.showJudgementAndRecoveryDisabled}
              onChange={(b) => set("showJudgementAndRecoveryDisabled", b)}
              label="判定・回復✖"
            />
          </div>
          <div className="space-y-2">
            <Switch
              checked={s.showRecruitFreeDescription}
              onChange={(b) => set("showRecruitFreeDescription", b)}
              label="自由記述"
            />
            {s.showRecruitFreeDescription && (
              <NeuInput
                value={s.recruitFreeDescription}
                onChange={(e) => set("recruitFreeDescription", e.target.value)}
                placeholder="自由記述を入力"
              />
            )}
          </div>
        </div>
      </Panel>

      <Panel title="その他コメント">
        <NeuInput
          value={s.otherComments}
          onChange={(e) => set("otherComments", e.target.value)}
          placeholder="任意"
        />
      </Panel>

      <Panel title="プレビュー">
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-neu p-4 shadow-neu-inset text-sm text-slate-700">
          {preview}
        </pre>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={tweetIntentUrl(preview)}
            target="_blank"
            rel="noreferrer"
            className="neu-tactile rounded-lg px-5 py-2.5 text-sm font-bold text-white shadow-neu-sm"
            style={{ backgroundColor: "var(--unit-color)" }}
          >
            ツイートする
          </a>
          <NeuButton onClick={saveHistory}>入力を保存</NeuButton>
        </div>
      </Panel>

      {history.length > 0 && (
        <Panel title="履歴">
          <ul className="space-y-2">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={h.favorite ? "お気に入り解除" : "お気に入り"}
                  onClick={() =>
                    setHistory((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, favorite: !x.favorite } : x))
                    )
                  }
                  className={h.favorite ? "text-amber-400" : "text-slate-300"}
                >
                  ★
                </button>
                <span className="flex-1 truncate text-sm text-slate-600">
                  {h.state.roomId ? `${h.state.roomIdSymbol}${h.state.roomId}` : "ルームIDなし"}
                  <span className="ml-2 text-xs text-slate-400">{h.dateTime}</span>
                </span>
                <NeuButton className="!px-3 !py-1" onClick={() => setS(h.state)}>
                  再利用
                </NeuButton>
                <button
                  type="button"
                  aria-label="削除"
                  onClick={() => setHistory((prev) => prev.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <NeuButton className="!px-3 !py-1" onClick={() => setHistory([])}>
              全履歴削除
            </NeuButton>
          </div>
        </Panel>
      )}
    </ToolPage>
  );
}

/** トグル＋（ONのとき）数値入力の1行。 */
function SkillRow({
  label,
  show,
  onShow,
  value,
  onValue,
  maxLength,
}: {
  label: string;
  show: boolean;
  onShow: (b: boolean) => void;
  value: string;
  onValue: (v: string) => void;
  maxLength: number;
}) {
  return (
    <div className="space-y-2">
      <Switch checked={show} onChange={onShow} label={label} />
      {show && (
        <NeuInput
          inputMode="numeric"
          maxLength={maxLength}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder={`${label}を入力`}
        />
      )}
    </div>
  );
}
