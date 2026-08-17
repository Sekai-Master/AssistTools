/**
 * この端末に保存しているものの台帳。
 *
 * ★ **保存キーを新設したらここに足す。** 一覧・削除（StoredDataPanel）と
 *   書き出し・取り込み（BackupPanel）が両方ここを見ている。足し忘れると
 *   「保存されているのに設定画面から見えない・移せない」データができる。
 *
 * ★ キーは各ツールが持っている実体をそのまま並べている。命名が揃っていないのは
 *   歴史的経緯で、揃えると保存済みデータが読めなくなるため触っていない。
 *
 * ★ label / note は **プライバシーポリシーの「ブラウザに保存される情報」の表**にも
 *   そのまま出る（src/pages/legal/PrivacyPage.tsx）。設定画面だけを見て
 *  「このページで〜」と書くと、ポリシー側で別のページを指してしまう。
 *   note は置かれる場所に依存しない書き方にすること。
 */
import { MOTION_LABEL, MOTION_SETTINGS, type MotionSetting } from "../../../motion/plan";
import { THEME_LABEL, THEMES, type Theme } from "../../../lib/theme";

export interface StoredItem {
  key: string;
  label: string;
  note: string;
  /** 中身の要約。実質空なら null を返す（＝一覧に出さない）。 */
  summarize: (raw: string) => string | null;
}

/** 壊れた内容でも「消す」導線は出したいので、読めない場合は null にしない。 */
export const BROKEN = "内容を読み取れませんでした";

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

/** オブジェクトで持っているもの（カードごと・キャラごとの設定）。 */
const countKeys =
  (unit: string) =>
  (raw: string): string | null => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return BROKEN;
      const n = Object.keys(parsed).length;
      return n === 0 ? null : `${n} ${unit}`;
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

/**
 * マイセカイ図鑑の絞り込み。**既定から変えた項目だけ**数える。
 * 保存形はキー数が固定なので、素直に Object.keys を数えると常に同じ数が出て、
 * 何も設定していない人の画面にも項目が並んでしまう。
 */
function summarizeMysekaiFilters(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return BROKEN;
    const s = parsed as Record<string, unknown>;
    let n = 0;
    if (typeof s.charId === "number") n++;
    if (Array.isArray(s.kinds) && s.kinds.length > 0) n++;
    if (typeof s.mainGenreId === "number") n++;
    // 既定と違うものだけ数える（DEFAULT_FILTER: reactiveOnly=true / 他は false）。
    if (s.reactiveOnly === false) n++;
    if (s.sketchableOnly === true) n++;
    if (s.actionOnly === true) n++;
    if (s.owned === "owned" || s.owned === "unowned") n++;
    if (typeof s.sort === "string" && s.sort !== "name") n++;
    if (s.desc === true) n++;
    return n === 0 ? null : `${n} 項目`;
  } catch {
    return BROKEN;
  }
}

export const STORED_ITEMS: StoredItem[] = [
  {
    key: "sekaimaster:profiles:v1",
    label: "編成",
    note: "設定画面で登録した総合力・ボーナスなど",
    summarize: countEntries("件"),
  },
  {
    key: "sekaimaster:plans:v1",
    label: "周回プラン",
    note: "「周回プラン」で名前を付けて保存したもの",
    summarize: countEntries("件"),
  },
  {
    // 「編成ビルダー」の保存キー（src/pages/deck/lib/deckStore.ts の DECK_STORAGE_KEYS）。
    key: "sekaimaster:deck:decks:v1",
    label: "編成ビルダーの編成",
    note: "「編成ビルダー」で名前を付けて保存したカード5枚の組み合わせ",
    summarize: countEntries("件"),
  },
  {
    key: "sekaimaster:deck:cards:v1",
    label: "カードの育成状態",
    note: "レベル・特訓・マスターランク・サイドストーリーなど（カードごと）",
    summarize: countKeys("枚"),
  },
  {
    key: "sekaimaster:deck:player:v1",
    label: "プレイヤー設定（編成ビルダー）",
    note: "エリアアイテム効果・キャラクターランク・ゲート・家具・称号",
    summarize: countKeys("項目"),
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
    key: "sekaimaster:mysekai:filters:v1",
    label: "マイセカイ図鑑の絞り込み",
    note: "「マイセカイ リアクション図鑑」で選んだキャラ・絞り込み・並び順",
    // ★ countKeys は使えない。保存形が常に同じキー数なので「8 項目」から動かず、
    //   何も設定していない状態でも一覧に出てしまう。既定から変えた数を数える。
    summarize: summarizeMysekaiFilters,
  },
  {
    key: "sekaimaster:mysekai:owned:v1",
    label: "マイセカイ図鑑の進み具合",
    note: "「マイセカイ リアクション図鑑」で印を付けた、持っている家具と見た会話",
    summarize: (raw) => {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return BROKEN;
        const { ids, seen } = parsed as { ids?: unknown; seen?: unknown };
        // 家具と会話は別々に数える（片方だけ付けている状態が普通にある）。
        const n = Array.isArray(ids) ? ids.length : 0;
        const m = Array.isArray(seen) ? seen.length : 0;
        if (!Array.isArray(ids) && !Array.isArray(seen)) return BROKEN;
        if (n === 0 && m === 0) return null;
        return [n > 0 ? `家具 ${n} 件` : null, m > 0 ? `会話 ${m} 件` : null]
          .filter(Boolean)
          .join(" / ");
      } catch {
        return BROKEN;
      }
    },
  },
  {
    key: "sekaimaster:motion:v1",
    label: "画面遷移の設定",
    note: "設定画面で選んだ段階",
    summarize: pickLabel<MotionSetting>(MOTION_SETTINGS, MOTION_LABEL),
  },
  {
    key: "sekaimaster:theme:v1",
    label: "配色の設定",
    note: "設定画面で選んだ配色",
    summarize: pickLabel<Theme>(THEMES, THEME_LABEL),
  },
];

export const STORED_ITEM_BY_KEY = new Map(STORED_ITEMS.map((i) => [i.key, i]));
