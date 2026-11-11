import { describe, expect, it } from "vitest";
import {
  CONTACT_BODY_MAX,
  CONTACT_KINDS,
  CONTACT_REPLY_MAX,
  bodyProblem,
  charCount,
  normalizeKind,
  normalizePage,
  normalizeVersion,
  replyLooksLikeAddress,
} from "./contactRules";

describe("字数の数え方（画面と関数で同じ）", () => {
  it("コードポイントで数える（絵文字・サロゲートペアも 1 字）", () => {
    expect(charCount("あいう")).toBe(3);
    expect(charCount("𠮷野家")).toBe(3);
    expect(charCount("a😀b")).toBe(3);
    // String.prototype.length（UTF-16）だと 4 になる
    expect("a😀b".length).toBe(4);
  });
});

describe("内容の検査（前後の空白を除いて 1〜2,000 字）", () => {
  it("空・空白だけは empty", () => {
    expect(bodyProblem("")).toBe("empty");
    expect(bodyProblem(" \n\t　")).toBe("empty");
  });

  it("2,000 字ちょうどは通り、2,001 字は too_long", () => {
    expect(bodyProblem("あ".repeat(CONTACT_BODY_MAX))).toBeNull();
    expect(bodyProblem("あ".repeat(CONTACT_BODY_MAX + 1))).toBe("too_long");
  });

  it("前後の空白は数えない", () => {
    expect(bodyProblem(`  ${"あ".repeat(CONTACT_BODY_MAX)}\n\n`)).toBeNull();
  });

  it("絵文字 2,000 個は 2,000 字として通す（UTF-16 なら 4,000）", () => {
    expect(bodyProblem("😀".repeat(CONTACT_BODY_MAX))).toBeNull();
  });
});

describe("種類（選択肢の外は「その他」に寄せる。400 にしない）", () => {
  it("選択肢は 5 つで、最後が「その他」", () => {
    expect(CONTACT_KINDS).toEqual([
      "不具合の報告",
      "ボーダー予測・データの誤り",
      "要望・感想",
      "権利者からのご連絡",
      "その他",
    ]);
  });

  it("選択肢の中ならそのまま、元の値は持たない", () => {
    for (const k of CONTACT_KINDS) expect(normalizeKind(k)).toEqual({ kind: k, original: null });
  });

  it("選択肢の外の文字列は「その他」にし、元の値を 40 字まで残す", () => {
    expect(normalizeKind("古い選択肢")).toEqual({ kind: "その他", original: "古い選択肢" });
    expect(normalizeKind("x".repeat(100)).original).toBe("x".repeat(40));
  });

  it("文字列でない・空なら「その他」で、元の値は無し", () => {
    for (const v of [undefined, null, 3, {}, [], "", "   "]) {
      expect(normalizeKind(v)).toEqual({ kind: "その他", original: null });
    }
  });
});

describe("ページ（入口の ?from=）", () => {
  it("/ で始まる英数字・-・/ の 100 字までは通す", () => {
    expect(normalizePage("/")).toBe("/");
    expect(normalizePage("/border/history")).toBe("/border/history");
    expect(normalizePage("/knowledge/skill-order")).toBe("/knowledge/skill-order");
    expect(normalizePage(`/${"a".repeat(99)}`)).toBe(`/${"a".repeat(99)}`);
  });

  it("形に合わなければ空（送信は止めない）", () => {
    for (const v of [`/${"a".repeat(100)}`, "border", "https://evil.example/", "/a?b=c", "/a b", "/あ", 1, null, undefined]) {
      expect(normalizePage(v), String(v)).toBe("");
    }
  });
});

describe("版", () => {
  it("x.y.z だけ通す", () => {
    expect(normalizeVersion("1.31.0")).toBe("1.31.0");
    for (const v of ["1.31", "v1.31.0", "1.31.0-beta", "", 1, null]) {
      expect(normalizeVersion(v), String(v)).toBe("");
    }
  });
});

describe("返信先の形（弾かず、注意だけ出すための判定）", () => {
  it("X の ID・メールアドレスの形なら true", () => {
    expect(replyLooksLikeAddress("@pj_Sekai_master")).toBe(true);
    expect(replyLooksLikeAddress("pj_Sekai_master")).toBe(true);
    expect(replyLooksLikeAddress("someone@example.com")).toBe(true);
  });

  it("どちらでもなければ false", () => {
    expect(replyLooksLikeAddress("電話してください")).toBe(false);
    expect(replyLooksLikeAddress("@too_long_handle_name_x")).toBe(false);
    expect(replyLooksLikeAddress("a@b")).toBe(false);
  });

  it("上限は 100 字", () => {
    expect(CONTACT_REPLY_MAX).toBe(100);
  });
});
