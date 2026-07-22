import { describe, expect, it } from "vitest";
import {
  DEFAULT_TWEET_STATE,
  buildTweetText,
  convertToHalfWidth,
  recruitSkillWithArrow,
  type TweetState,
} from "./tweetLogic";

describe("convertToHalfWidth", () => {
  it("全角英数記号と全角スペースを半角化", () => {
    expect(convertToHalfWidth("１２３４５")).toBe("12345");
    expect(convertToHalfWidth("Ａ　Ｂ")).toBe("A B");
  });
});

describe("recruitSkillWithArrow", () => {
  it("スキル値のみ→↑付与", () => {
    expect(recruitSkillWithArrow("580", "")).toBe("580↑");
  });
  it("スキル値＋内部値→両方に↑", () => {
    expect(recruitSkillWithArrow("580", "1234000")).toBe("580↑/1234000↑");
  });
  it("両方空→空文字", () => {
    expect(recruitSkillWithArrow("", "")).toBe("");
  });
});

describe("buildTweetText", () => {
  it("既定状態の骨格（ルーム・楽曲・残り枠・ルームID・固定タグ）", () => {
    const t = buildTweetText(DEFAULT_TWEET_STATE);
    expect(t).toContain("ベテラン 🦐高速周回　@1");
    expect(t).toContain("【🔑】");
    expect(t.endsWith("#プロセカ募集 #プロセカ協力")).toBe(true);
  });

  it("TL放流なしのとき先頭に @No_TL", () => {
    const t = buildTweetText({ ...DEFAULT_TWEET_STATE, tlFlow: "@No_TL" });
    expect(t.startsWith("@No_TL\n")).toBe(true);
  });

  it("ルームID記号がルームIDのときは全角コロン区切り", () => {
    const t = buildTweetText({
      ...DEFAULT_TWEET_STATE,
      roomIdSymbol: "ルームID",
      roomId: "12345",
    });
    expect(t).toContain("【ルームID：12345】");
  });

  it("🔑記号はコロンなし", () => {
    const t = buildTweetText({ ...DEFAULT_TWEET_STATE, roomId: "12345" });
    expect(t).toContain("【🔑12345】");
  });

  it("主は生値・募は↑付き（非対称・%オフ時）", () => {
    const s: TweetState = {
      ...DEFAULT_TWEET_STATE,
      appendPercent: false,
      hostSkill: "150",
      requiredSkill: "580",
    };
    const t = buildTweetText(s);
    expect(t).toContain("主：150");
    expect(t).toContain("募：580↑");
  });

  it("%トグルON時はスキル値に%（内部値には付けない）", () => {
    const s: TweetState = {
      ...DEFAULT_TWEET_STATE,
      appendPercent: true,
      hostSkill: "272",
      showHostInnerValue: true,
      hostInnerValue: "585000",
      requiredSkill: "240",
    };
    const t = buildTweetText(s);
    expect(t).toContain("主：272%/585000");
    expect(t).toContain("募：240%↑");
  });

  it("備考は・区切りで前後にスペース", () => {
    const s: TweetState = {
      ...DEFAULT_TWEET_STATE,
      showStar4: true,
      showLongSession: true,
    };
    const t = buildTweetText(s);
    expect(t).toContain("募：　☆４・長時間できる方 ");
  });
});
