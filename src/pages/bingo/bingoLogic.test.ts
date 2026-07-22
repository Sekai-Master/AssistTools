import { describe, expect, it } from "vitest";
import {
  type BingoMusic,
  type Cell,
  buildRandomCard,
  decodeSeed,
  encodeSeed,
  filterForGeneration,
} from "./bingoLogic";

function music(id: string, over: Partial<BingoMusic> = {}): BingoMusic {
  return {
    id,
    title: `曲${id}`,
    default: Number(id),
    Unit: "0_VS",
    categories: ["mv_3d"],
    isNewlyWrittenMusic: false,
    jacketLink: `jacket_s_${id}.webp`,
    ...over,
  };
}

const POOL = Array.from({ length: 30 }, (_, i) => music(String(i + 1).padStart(3, "0")));

describe("encodeSeed / decodeSeed", () => {
  it("往復で同じカードに戻る（FREE・cleared込み）", () => {
    const card: Cell[] = POOL.slice(0, 25).map((m, i) =>
      i === 12 ? "FREE" : { ...m, cleared: i % 3 === 0 }
    );
    const seed = encodeSeed(card);
    expect(seed).toHaveLength(50);
    const decoded = decodeSeed(seed, POOL);
    expect(decoded[12]).toBe("FREE");
    decoded.forEach((cell, i) => {
      if (cell === "FREE") {
        expect(card[i]).toBe("FREE");
      } else {
        const orig = card[i] as Exclude<Cell, "FREE">;
        expect(cell.id).toBe(orig.id);
        expect(cell.cleared).toBe(orig.cleared);
      }
    });
  });

  it("不正な長さ・文字は例外", () => {
    expect(() => decodeSeed("AA", POOL)).toThrow();
    expect(() => decodeSeed("*".repeat(50), POOL)).toThrow();
  });

  it("未知idは例外", () => {
    const card: Cell[] = POOL.slice(0, 25).map((m, i) => (i === 12 ? "FREE" : { ...m, cleared: false }));
    const seed = encodeSeed(card);
    expect(() => decodeSeed(seed, [])).toThrow();
  });
});

describe("filterForGeneration", () => {
  it("ユニット・カテゴリ・曲種で絞る", () => {
    const musics = [
      music("001", { Unit: "0_VS", categories: ["mv_3d"], isNewlyWrittenMusic: false }),
      music("002", { Unit: "1_L/n", categories: ["original"], isNewlyWrittenMusic: true }),
    ];
    const got = filterForGeneration(
      musics,
      new Set(["0_VS"]),
      new Set(["mv_3d"]),
      new Set([false])
    );
    expect(got.map((m) => m.id)).toEqual(["001"]);
  });
});

describe("buildRandomCard", () => {
  it("free中央は index12 が FREE、他24マスは曲", () => {
    const card = buildRandomCard(POOL, "free", null);
    expect(card).toHaveLength(25);
    expect(card[12]).toBe("FREE");
    expect(card.filter((c) => c !== "FREE")).toHaveLength(24);
  });

  it("曲不足なら例外", () => {
    expect(() => buildRandomCard(POOL.slice(0, 10), "random", null)).toThrow();
  });

  it("中央マス指定なのに曲未選択なら例外", () => {
    expect(() => buildRandomCard(POOL, "specified", null)).toThrow(/中央マス/);
  });

  it("中央マス指定は index12 が指定曲、その曲は他マスに出ない", () => {
    const center = POOL[0];
    const card = buildRandomCard(POOL, "specified", center);
    expect(card).toHaveLength(25);
    const c12 = card[12] as Exclude<Cell, "FREE">;
    expect(c12.id).toBe(center.id);
    const others = card.filter((_, i) => i !== 12) as Exclude<Cell, "FREE">[];
    expect(others.some((m) => m.id === center.id)).toBe(false);
  });
});
