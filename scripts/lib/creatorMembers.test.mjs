import { describe, expect, it } from "vitest";
import { newCreatorSuspects } from "./creatorMembers.mjs";

const song = (creatorArtistId, artistName, published = true) => ({ creatorArtistId, artistName, published });
const BEFORE = [song(29, "じん"), song(10, "Orangestar"), song(51, "まらしぃ")];

describe("作者の表に足す候補（newCreatorSuspects）", () => {
  it("前に無かった作者で、名前に連名の印（× & 、 feat. 括弧など）があるものを返す", () => {
    const current = [...BEFORE, song(400, "じん×まらしぃ"), song(401, "まらしぃ feat. 初音ミク"), song(402, "ryo  (supercell)")];
    expect(newCreatorSuspects(current, BEFORE, [])).toEqual([
      { id: 400, name: "じん×まらしぃ" },
      { id: 401, name: "まらしぃ feat. 初音ミク" },
      { id: 402, name: "ryo  (supercell)" },
    ]);
  });

  it("印が無くても、ほかの作者の名前を含む・含まれる新しい作者を返す（GigaReol のような形）", () => {
    const current = [...BEFORE, song(403, "OrangestarReol"), song(404, "Orange")];
    expect(newCreatorSuspects(current, BEFORE, []).map((c) => c.id)).toEqual([403, 404]);
  });

  it("前からいる作者・表に載った作者・ふつうの名前・2 字以下が含まれるだけの名前は返さない", () => {
    const current = [...BEFORE, song(405, "ナユタン星人"), song(406, "ge"), song(407, "A×B")];
    expect(newCreatorSuspects(current, BEFORE, [407])).toEqual([]);
  });

  it("公開されていない曲の作者は見ない", () => {
    expect(newCreatorSuspects([...BEFORE, song(408, "じん×まらしぃ", false)], BEFORE, [])).toEqual([]);
  });

  it("前の配信データが無ければ、全員が新しく見えるので何も返さない", () => {
    expect(newCreatorSuspects([...BEFORE, song(409, "じん×まらしぃ")], null, [])).toEqual([]);
  });
});
