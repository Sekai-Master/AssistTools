import { describe, expect, it } from "vitest";
import { dialAngle, dialValueFromPoint } from "./dialMath";

/** 真上 0°・時計回りの角度 deg の向きにある点（画面の座標なので下が +y）。 */
const at = (deg: number, r = 80) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
};

describe("dialAngle — 値から角度（0〜30 なら 1 分 10°）", () => {
  it("最小は左下 -150°、最大は右下 +150°、真ん中は真上", () => {
    expect(dialAngle(0, 0, 30)).toBe(-150);
    expect(dialAngle(15, 0, 30)).toBe(0);
    expect(dialAngle(30, 0, 30)).toBe(150);
    expect(dialAngle(12, 0, 30)).toBe(-30);
  });

  it("範囲の外は端に収める", () => {
    expect(dialAngle(-3, 0, 30)).toBe(-150);
    expect(dialAngle(45, 0, 30)).toBe(150);
  });
});

describe("dialValueFromPoint — 指の位置から値", () => {
  it("押した向きの近い整数", () => {
    expect(dialValueFromPoint(...at(0), 0, 30)).toBe(15);
    expect(dialValueFromPoint(...at(-150), 0, 30)).toBe(0);
    expect(dialValueFromPoint(...at(150), 0, 30)).toBe(30);
    expect(dialValueFromPoint(...at(-30), 0, 30)).toBe(12);
    expect(dialValueFromPoint(...at(-26), 0, 30)).toBe(12); // 12.4 → 12
    expect(dialValueFromPoint(...at(-24), 0, 30)).toBe(13); // 12.6 → 13
  });

  it("下の切れ目を押したら、角度の近い端", () => {
    expect(dialValueFromPoint(...at(170), 0, 30)).toBe(30);
    expect(dialValueFromPoint(...at(-170), 0, 30)).toBe(0);
  });

  it("回している途中に切れ目へ入ったら、ひとつ前の値に近い端で止まる", () => {
    expect(dialValueFromPoint(...at(-170), 0, 30, 29)).toBe(30);
    expect(dialValueFromPoint(...at(170), 0, 30, 1)).toBe(0);
  });

  it("最大を越えて回し続け、切れ目の向こう（最小の側）へ回り込んでも 30 のまま", () => {
    expect(dialValueFromPoint(...at(-145), 0, 30, 30)).toBe(30);
    expect(dialValueFromPoint(...at(145), 0, 30, 0)).toBe(0);
  });

  it("ふつうに回すぶんには、ひとつ前の値に縛られない", () => {
    expect(dialValueFromPoint(...at(10), 0, 30, 15)).toBe(16);
    expect(dialValueFromPoint(...at(-10), 0, 30, 15)).toBe(14);
  });
});
