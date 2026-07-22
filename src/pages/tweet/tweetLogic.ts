/**
 * 協力ライブ募集ツイート（ついぼ）の本文組み立て（純関数）。
 * 現行 vanilla 版（legacy tg_script.js）の生成順・記号を忠実に移植。
 * 仕様は docs/porting/01-tweet.md 参照。
 */

export interface TweetState {
  tlFlow: string; // '' (あり) | '@No_TL' (なし)
  room: string;
  song: string;
  rounds: string;
  remainingSlots: string;
  roomIdSymbol: string; // '🔑' | 'ルームID'
  roomId: string;

  showHostSkill: boolean;
  hostSkill: string;
  showHostInnerValue: boolean;
  hostInnerValue: string;

  showConditionOutside: boolean;
  conditionOutside: string;
  showSupporter: boolean;
  supporterCount: string;
  showFreeDescription: boolean;
  freeDescription: string;

  /** スキル値に % を付けるか（実募集文の約6割が%付き）。 */
  appendPercent: boolean;

  showRequiredSkill: boolean;
  requiredSkill: string;
  showRequiredInnerValue: boolean;
  requiredInnerValue: string;

  showStar4: boolean;
  showLongSession: boolean;
  showSfcNoCare: boolean; // SFC気にしません（実募集文の約6割で使われる定番）
  showMidLeaveOk: boolean; // 途中抜けOK
  showJudgementStrengthenDisabled: boolean;
  showJudgementAndRecoveryDisabled: boolean;
  showRecruitFreeDescription: boolean;
  recruitFreeDescription: string;

  otherComments: string;
}

export const DEFAULT_TWEET_STATE: TweetState = {
  tlFlow: "",
  room: "ベテラン",
  song: "🦐",
  rounds: "高速周回",
  remainingSlots: "1",
  roomIdSymbol: "🔑",
  roomId: "",
  showHostSkill: true,
  hostSkill: "",
  showHostInnerValue: false,
  hostInnerValue: "",
  showConditionOutside: false,
  conditionOutside: "",
  showSupporter: false,
  supporterCount: "",
  showFreeDescription: false,
  freeDescription: "",
  appendPercent: true,
  showRequiredSkill: true,
  requiredSkill: "",
  showRequiredInnerValue: false,
  requiredInnerValue: "",
  showStar4: false,
  showLongSession: false,
  showSfcNoCare: false,
  showMidLeaveOk: false,
  showJudgementStrengthenDisabled: false,
  showJudgementAndRecoveryDisabled: false,
  showRecruitFreeDescription: false,
  recruitFreeDescription: "",
  otherComments: "",
};

/** 全角英数記号→半角、全角スペース→半角スペース。 */
export function convertToHalfWidth(str: string): string {
  return (str ?? "")
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/** 数字のみか（募集ID等のバリデーション用）。 */
export function isNumericOnly(str: string): boolean {
  return !/[^0-9]/.test(convertToHalfWidth(str));
}

/** ルームID表示部。記号とIDの間の区切りを記号種別で出し分ける。 */
function roomIdDisplay(symbol: string, roomId: string): string {
  if (symbol === "ルームID" && roomId) return `：${roomId}`;
  return roomId;
}

/**
 * 募集スキル値の '↑' 付与。'/'区切りの各非空要素に↑を付ける。
 * percent が true のときスキル値（内部値ではない先頭要素）に % を付ける。
 */
export function recruitSkillWithArrow(
  requiredSkill: string,
  requiredInnerValue: string,
  percent = false
): string {
  const skill = requiredSkill && percent ? `${requiredSkill}%` : requiredSkill;
  const base = `${skill}${requiredInnerValue ? "/" + requiredInnerValue : ""}`;
  return base
    .split("/")
    .map((v) => (v ? `${v}↑` : ""))
    .join("/");
}

/** 備考配列を「　a・b・c 」形（前に全角スペース、後ろに半角スペース）に整形。空なら''。 */
function joinRemarks(parts: string[]): string {
  const filtered = parts.filter((p) => p !== "");
  if (filtered.length === 0) return "";
  return `　${filtered.join("・")} `;
}

/** ツイート本文を組み立てる。 */
export function buildTweetText(s: TweetState): string {
  let text = "";

  // (1) TL放流なしのときだけ先頭にタグ
  if (s.tlFlow === "@No_TL") text += `${s.tlFlow}\n`;

  // (2) ルーム・楽曲・回数・残り枠・ルームID
  text += `${s.room} ${s.song}${s.rounds}　@${s.remainingSlots}\n`;
  text += `【${s.roomIdSymbol}${roomIdDisplay(s.roomIdSymbol, s.roomId)}】\n\n`;

  // (3) 主：行（スキル値に任意で%）
  const rawHostSkill = s.showHostSkill ? s.hostSkill : "";
  const hostSkill = rawHostSkill && s.appendPercent ? `${rawHostSkill}%` : rawHostSkill;
  const hostInner = s.showHostInnerValue ? s.hostInnerValue : "";
  const hostRemarks = joinRemarks([
    s.showConditionOutside && s.conditionOutside ? `条件外${s.conditionOutside}` : "",
    s.showSupporter && s.supporterCount ? `支援者${s.supporterCount}人` : "",
    s.showFreeDescription ? s.freeDescription : "",
  ]);
  text += `主：${hostSkill}${hostInner ? "/" + hostInner : ""}${hostRemarks}\n`;

  // (4) 募：行（募集スキルは↑付き・任意で%）
  const reqSkill = s.showRequiredSkill ? s.requiredSkill : "";
  const reqInner = s.showRequiredInnerValue ? s.requiredInnerValue : "";
  const recruitSkillText = recruitSkillWithArrow(reqSkill, reqInner, s.appendPercent);
  const recruitRemarks = joinRemarks([
    s.showStar4 ? "☆４" : "",
    s.showLongSession ? "長時間できる方" : "",
    s.showSfcNoCare ? "SFC気にしません" : "",
    s.showMidLeaveOk ? "途中抜けOK" : "",
    s.showJudgementStrengthenDisabled ? "判定強化✖" : "",
    s.showJudgementAndRecoveryDisabled ? "判定・回復✖" : "",
    s.showRecruitFreeDescription ? s.recruitFreeDescription.trim() : "",
  ]);
  text += `募：${recruitSkillText}${recruitRemarks}\n`;

  // (5) その他コメント
  if (s.otherComments.trim() !== "") text += `\n${s.otherComments.trim()}`;

  // (6) 固定ハッシュタグ
  text += `\n\n#プロセカ募集 #プロセカ協力`;

  return text;
}

/** X（Twitter）投稿インテントURL。 */
export function tweetIntentUrl(text: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
