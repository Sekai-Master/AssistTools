import { describe, expect, it } from "vitest";
import { createScrollMemory } from "./scrollMemory";

describe("createScrollMemory", () => {
  it("保存した位置を取り出せる", () => {
    const m = createScrollMemory();
    m.save("a", 1200);
    expect(m.restore("a")).toBe(1200);
  });

  it("未知のキーは先頭(0)", () => {
    expect(createScrollMemory().restore("nope")).toBe(0);
  });

  it("同じキーの上書きで件数が増えない", () => {
    const m = createScrollMemory();
    m.save("a", 10);
    m.save("a", 20);
    expect(m.size()).toBe(1);
    expect(m.restore("a")).toBe(20);
  });

  it("上限を超えたら古いものから捨てる", () => {
    const m = createScrollMemory(3);
    m.save("a", 1);
    m.save("b", 2);
    m.save("c", 3);
    m.save("d", 4);
    expect(m.size()).toBe(3);
    expect(m.restore("a")).toBe(0); // 捨てられた
    expect(m.restore("d")).toBe(4);
  });

  it("再訪したキーは最新扱いになり、古い方が先に捨てられる", () => {
    const m = createScrollMemory(2);
    m.save("a", 1);
    m.save("b", 2);
    m.save("a", 3); // a を新しくする
    m.save("c", 4); // 捨てられるのは b
    expect(m.restore("a")).toBe(3);
    expect(m.restore("b")).toBe(0);
  });
});
