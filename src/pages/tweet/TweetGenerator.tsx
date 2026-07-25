import { useEffect, useMemo, useState } from "react";
import { ToolPage } from "../../components/ui/ToolPage";
import { Panel } from "../../components/ui/Panel";
import { Field } from "../../components/ui/Field";
import { NeuInput } from "../../components/ui/NeuInput";
import { NeuTextarea } from "../../components/ui/NeuTextarea";
import { NeuButton } from "../../components/ui/NeuButton";
import { Switch } from "../../components/ui/Switch";
import { Segmented } from "../../components/ui/Segmented";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  DEFAULT_TWEET_STATE,
  buildTweetText,
  convertToHalfWidth,
  tweetIntentUrl,
  type TweetState,
} from "./tweetLogic";

const HISTORY_KEY = "tweetGenerator.history";
const HISTORY_MAX = 10;

// その他コメントのテンプレ（実募集文100件・WLイベント期間の最新分から頻度順抽出）。クリックで追記。
const COMMENT_TEMPLATES = [
  "集まるまで待てる方",
  "スタンプ他部屋と同じです",
  "条件違い解散",
  "主のおつさきで解散",
  "難易度自由",
  "火消し",
  "時短のため部屋主選曲します",
  "速度気になる場合は建て直します",
  "支援者います",
  "スキル見てます",
];

interface HistoryItem {
  id: string;
  state: TweetState;
  dateTime: string;
  favorite: boolean;
}

// 外部（localStorage）由来なので1件ずつ検証する。壊れた要素が混じっても
// 画面全体をクラッシュさせず、健全な履歴だけを残す。
function isValidHistory(h: unknown): h is HistoryItem {
  if (!h || typeof h !== "object") return false;
  const r = h as Record<string, unknown>;
  return (
    typeof r.state === "object" &&
    r.state !== null &&
    typeof (r.state as Record<string, unknown>).room === "string" &&
    typeof r.dateTime === "string"
  );
}

let historyIdSeq = 0;
function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidHistory).map((h) => ({
      ...h,
      // 旧スキーマ等でフィールドが欠けた state を既定値で補完し、再利用時に
      // buildTweetText（.trim() 等）がクラッシュしないよう全フィールドを保証する。
      state: { ...DEFAULT_TWEET_STATE, ...h.state },
      id: typeof h.id === "string" ? h.id : `h${historyIdSeq++}`,
      favorite: typeof h.favorite === "boolean" ? h.favorite : false,
    }));
  } catch {
    return [];
  }
}

function newHistoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `h${historyIdSeq++}-${Math.floor(performance.now())}`;
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
      [{ id: newHistoryId(), state: s, dateTime: new Date().toLocaleString(), favorite: false }, ...prev].slice(
        0,
        HISTORY_MAX
      )
    );

  const tweetHref = tweetIntentUrl(preview);

  return (
    <ToolPage wide unit="vs" title="ついぼジェネレーター" icon="campaign">
      {/* PC は 2カラム（左=入力／右=sticky なプレビュー＋アクション）。
          lg 未満は通常フローで縦積みし、アクションは画面下の固定バーが担う。 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:items-start">
        {/* 左カラム: 入力フォーム。スマホは下部固定バーに隠れないよう余白を足す。 */}
        <div className="space-y-6 pb-28 lg:pb-0">
      <Panel title="募集内容">
        <div className="space-y-4">
          <Field label="TL放流">
            <SegmentedControl
              options={[
                { value: "", label: "あり" },
                { value: "@No_TL", label: "なし" },
              ]}
              value={s.tlFlow}
              onChange={(v) => set("tlFlow", v)}
            />
          </Field>
          <Field label="ルーム">
            <SegmentedControl
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
              options={["🦐", "エビ", "ビバハピ", "ロスエン", "Sage", "おまかせ"].map((v) => ({
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
            <SegmentedControl
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
          <Switch
            checked={s.appendPercent}
            onChange={(b) => set("appendPercent", b)}
            label="スキル値に % を付ける"
          />
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
              <NeuTextarea
                rows={2}
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
              <NeuTextarea
                rows={2}
                value={s.recruitFreeDescription}
                onChange={(e) => set("recruitFreeDescription", e.target.value)}
                placeholder="自由記述を入力"
              />
            )}
          </div>
        </div>
      </Panel>

      <Panel title="その他コメント">
        <p className="mb-2 text-xs text-slate-500">テンプレ（クリックで追記）</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {COMMENT_TEMPLATES.map((tmpl) => (
            <NeuButton
              key={tmpl}
              className="!px-3 !py-1 !text-xs"
              onClick={() =>
                set("otherComments", s.otherComments ? `${s.otherComments}\n${tmpl}` : tmpl)
              }
            >
              ＋ {tmpl}
            </NeuButton>
          ))}
        </div>
        <NeuTextarea
          rows={3}
          value={s.otherComments}
          onChange={(e) => set("otherComments", e.target.value)}
          placeholder="任意（テンプレを押すと追記されます）"
        />
      </Panel>

      {history.length > 0 && (
        <Panel title="履歴">
          <ul className="space-y-2">
            {history.map((h, i) => (
              <li key={h.id} className="flex items-center gap-3">
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
                  <span className="ml-2 text-xs text-slate-500">{h.dateTime}</span>
                </span>
                <NeuButton className="!px-3 !py-1" onClick={() => setS(h.state)}>
                  再利用
                </NeuButton>
                <button
                  type="button"
                  aria-label="削除"
                  onClick={() => setHistory((prev) => prev.filter((_, j) => j !== i))}
                  className="text-slate-500 hover:text-slate-600"
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
        </div>

        {/* 右カラム（PCのみ）: プレビュー＋ルームID即編集＋アクション。
            スクロールに追従させ、履歴から再利用したあと一番上に戻らず
            ここでルームIDを直してそのままツイートできるようにする。 */}
        <div className="hidden lg:block lg:sticky lg:top-6">
          <Panel title="プレビュー">
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-neu p-4 shadow-neu-inset text-sm text-slate-700">
              {preview}
            </pre>
            <div className="mt-4 space-y-3">
              <Field label="ルームID" htmlFor="tg-roomid-side">
                <NeuInput
                  id="tg-roomid-side"
                  inputMode="numeric"
                  maxLength={5}
                  value={s.roomId}
                  onChange={(e) => set("roomId", digitsOnly(e.target.value))}
                  placeholder="ルームIDを入力"
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <a
                  href={tweetHref}
                  target="_blank"
                  rel="noreferrer"
                  className="neu-cta inline-block rounded-lg px-5 py-2.5 text-sm font-bold"
                >
                  ツイートする
                </a>
                <NeuButton onClick={saveHistory}>入力を保存</NeuButton>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* スマホ: 画面下に固定したアクションバー。
          ルームID→ツイートまで従来 1600px 超スクロールしていたのを、
          どこにいてもこのバーで完結できるようにする。 */}
      <MobileActionBar
        roomId={s.roomId}
        onRoomId={(v) => set("roomId", digitsOnly(v))}
        preview={preview}
        tweetHref={tweetHref}
        onSave={saveHistory}
      />
    </ToolPage>
  );
}

/** スマホ用の画面下固定アクションバー（lg 未満のみ表示）。 */
function MobileActionBar({
  roomId,
  onRoomId,
  preview,
  tweetHref,
  onSave,
}: {
  roomId: string;
  onRoomId: (v: string) => void;
  preview: string;
  tweetHref: string;
  onSave: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      {previewOpen && (
        <div className="mx-auto max-w-3xl px-3 pb-2">
          <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-neu p-3 text-xs text-slate-700 shadow-neu-inset">
            {preview}
          </pre>
        </div>
      )}
      <div className="border-t border-black/5 bg-neu/95 backdrop-blur px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            aria-label="プレビューを表示"
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((v) => !v)}
            className="material-icons shrink-0 rounded-lg px-2 py-2 text-slate-500 shadow-neu active:shadow-neu-inset"
          >
            {previewOpen ? "expand_more" : "expand_less"}
          </button>
          <NeuInput
            aria-label="ルームID"
            inputMode="numeric"
            maxLength={5}
            value={roomId}
            onChange={(e) => onRoomId(e.target.value)}
            placeholder="ルームID"
            className="flex-1 !min-w-0"
          />
          <NeuButton className="!px-3" onClick={onSave} aria-label="入力を保存">
            <span className="material-icons text-base">bookmark_add</span>
          </NeuButton>
          <a
            href={tweetHref}
            target="_blank"
            rel="noreferrer"
            className="neu-cta shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold"
          >
            ツイート
          </a>
        </div>
      </div>
    </div>
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
