import { describe, expect, it } from "vitest";
import {
  type BingoMusic,
  type Cell,
  buildRandomCard,
  buildSongCard,
  decodeSeed,
  encodeSeed,
  filterForGeneration,
  songCardNeeds,
} from "./bingoLogic";
import { createRng } from "./odaiLogic";

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

describe("filterForGeneration の歌う人（曲名ビンゴのランダムの条件）", () => {
  const musics = [
    music("001", { singers: [20, 21] }),
    music("002", { singers: [21] }),
    music("003"),
  ];
  const all = [new Set(["0_VS"]), new Set(["mv_3d"]), new Set([false])] as const;

  it("歌う人を選ぶと、その人が歌う曲だけになる。singers の無い曲は入らない", () => {
    expect(filterForGeneration(musics, ...all, 20).map((m) => m.id)).toEqual(["001"]);
    expect(filterForGeneration(musics, ...all, 21).map((m) => m.id)).toEqual(["001", "002"]);
  });

  it("null（すべて）なら歌う人では絞らない。省略しても同じ", () => {
    expect(filterForGeneration(musics, ...all, null)).toHaveLength(3);
    expect(filterForGeneration(musics, ...all)).toHaveLength(3);
  });
});

/** カードの曲の id（FREE を除く、マスの順）。 */
const songIds = (card: Cell[]) => card.flatMap((c) => (c === "FREE" ? [] : [c.id]));

describe("buildSongCard（入れたい曲と、残りを条件からランダム）", () => {
  const OUTSIDE = Array.from({ length: 30 }, (_, i) => music(String(i + 101)));

  it("入れたい曲は全部入り、残りは条件の曲から。重複は無く、中央は FREE", () => {
    const pins = [OUTSIDE[0], OUTSIDE[1], POOL[2]];
    const card = buildSongCard(POOL, pins, "free", null, createRng(1));
    const ids = songIds(card);
    expect(card[12]).toBe("FREE");
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    for (const p of pins) expect(ids).toContain(p.id);
    // 入れたい曲以外は条件の曲
    const poolIds = new Set(POOL.map((m) => m.id));
    expect(ids.filter((id) => !pins.some((p) => p.id === id)).every((id) => poolIds.has(id))).toBe(true);
  });

  it("入れたい曲は条件の外でも入る", () => {
    const card = buildSongCard(POOL, [OUTSIDE[5]], "free", null, createRng(2));
    expect(songIds(card)).toContain(OUTSIDE[5].id);
  });

  it("入れたい曲の重複は 1 回にする", () => {
    const card = buildSongCard(POOL, [OUTSIDE[0], OUTSIDE[0]], "free", null, createRng(3));
    expect(songIds(card).filter((id) => id === OUTSIDE[0].id)).toHaveLength(1);
  });

  it("24 曲を入れて中央が FREE なら、条件の曲は使わない（条件の曲が 0 でも作れる）", () => {
    const pins = OUTSIDE.slice(0, 24);
    const card = buildSongCard([], pins, "free", null, createRng(4));
    expect(new Set(songIds(card))).toEqual(new Set(pins.map((m) => m.id)));
  });

  it("中央がランダムなら 25 曲。入れたい曲が中央に来てもよい", () => {
    const pins = OUTSIDE.slice(0, 24);
    const card = buildSongCard(POOL, pins, "random", null, createRng(5));
    const ids = songIds(card);
    expect(ids).toHaveLength(25);
    for (const p of pins) expect(ids).toContain(p.id);
  });

  it("中央の指定曲が入れたい曲にもあれば、中央の 1 回だけにする", () => {
    const center = OUTSIDE[0];
    const card = buildSongCard(POOL, [center, OUTSIDE[1]], "specified", center, createRng(6));
    expect((card[12] as Exclude<Cell, "FREE">).id).toBe(center.id);
    expect(songIds(card).filter((id) => id === center.id)).toHaveLength(1);
    expect(songIds(card)).toContain(OUTSIDE[1].id);
  });

  it("条件の曲が足りなければ、足りない数と選べる数を入れた文で例外", () => {
    expect(() => buildSongCard(POOL.slice(0, 10), [OUTSIDE[0]], "free", null)).toThrow(
      "条件に合う曲が足りません（あと 23 曲・選べる曲 10 曲）"
    );
  });

  it("同じ乱数なら同じカード", () => {
    const a = buildSongCard(POOL, [OUTSIDE[0]], "free", null, createRng(7));
    const b = buildSongCard(POOL, [OUTSIDE[0]], "free", null, createRng(7));
    expect(encodeSeed(a)).toBe(encodeSeed(b));
  });

  it("入れたい曲の数・中央の形をまぜた 200 通りで、入れたい曲が全部入り、重複が無い", () => {
    const rng = createRng(42);
    const modes = ["free", "random", "specified"] as const;
    for (let t = 0; t < 200; t++) {
      const mode = modes[t % 3];
      const n = Math.floor(rng() * 25);
      const pins = [...OUTSIDE, ...POOL].sort(() => rng() - 0.5).slice(0, n);
      const center = mode === "specified" ? POOL[Math.floor(rng() * POOL.length)] : null;
      const card = buildSongCard([...POOL, ...OUTSIDE], pins, mode, center, rng);
      const ids = songIds(card);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(mode === "free" ? 24 : 25);
      for (const p of pins) expect(ids).toContain(p.id);
      if (center) expect((card[12] as Exclude<Cell, "FREE">).id).toBe(center.id);
      else if (mode === "free") expect(card[12]).toBe("FREE");
    }
  });
});

describe("songCardNeeds（足りるかを作る前に数える）", () => {
  it("残りのマスと、選べる条件の曲の数（入れたい曲と中央の曲は除く）", () => {
    expect(songCardNeeds(POOL, [], "free", null)).toEqual({ need: 24, available: 30 });
    expect(songCardNeeds(POOL, [POOL[0], POOL[1]], "free", null)).toEqual({ need: 22, available: 28 });
    expect(songCardNeeds(POOL, [POOL[0]], "random", null)).toEqual({ need: 24, available: 29 });
    expect(songCardNeeds(POOL, [POOL[0]], "specified", POOL[0])).toEqual({ need: 24, available: 29 });
  });

  it("中央が指定で曲が未選択でも数えられる（除く曲が無いだけ）", () => {
    expect(songCardNeeds(POOL, [], "specified", null)).toEqual({ need: 24, available: 30 });
  });
});

describe("今のコードの互換（固定の文字列）", () => {
  // 2026-11-10 の版で作った曲名ビンゴのコード（id 001〜025、中央 FREE、001 と 014 を埋めた）
  const CODE = "gBACADAEAFAGAHAIAJAKALAMAAgOAPAQARASATAUAVAWAXAYAZ";
  const IDS = Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(3, "0"));
  const MUSICS = IDS.map((id) => music(id));

  it("変更後も同じカードに開ける", () => {
    const card = decodeSeed(CODE, MUSICS);
    expect(card[12]).toBe("FREE");
    expect((card[0] as Exclude<Cell, "FREE">).cleared).toBe(true);
    expect((card[13] as Exclude<Cell, "FREE">).cleared).toBe(true);
    expect(encodeSeed(card)).toBe(CODE);
  });
});
