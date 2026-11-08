/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseMusics } from "./useBingoMusics";
import { buildRandomCard, type Cell } from "./bingoLogic";
import { buildOdaiCandidates, buildOdaiCard, createRng, type OdaiCell } from "./odaiLogic";
import { type KindedCard, cardCode, cardLink, decodeCardCode, extractCode, shareCard, shareText } from "./bingoShare";

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const ODAI: OdaiCell[] = buildOdaiCard(buildOdaiCandidates(MUSICS), createRng(1)).map((c, i) =>
  c === "FREE" ? c : { ...c, cleared: i % 3 === 0 }
);
const SONG: Cell[] = buildRandomCard(MUSICS, "free", null).map((c, i) =>
  c === "FREE" ? c : { ...c, cleared: i % 2 === 0 }
);

describe("カードのコードとリンク", () => {
  it("お題・曲名ともに、リンクにしてから読むと同じカード（埋めた状態も）に戻る", () => {
    const cards: KindedCard[] = [
      { kind: "odai", card: ODAI },
      { kind: "song", card: SONG },
    ];
    for (const kc of cards) {
      const kind = kc.kind;
      const code = cardCode(kc);
      const link = cardLink("https://sekaimaster.pages.dev/", code);
      expect(link.startsWith("https://sekaimaster.pages.dev/bingo?card=")).toBe(true);
      const back = decodeCardCode(extractCode(link), MUSICS);
      expect(back.kind).toBe(kind);
      expect(cardCode(back)).toBe(code);
    }
  });

  it("曲名ビンゴのコードは今までの 50 文字のシード値そのもの", () => {
    expect(cardCode({ kind: "song", card: SONG })).toHaveLength(50);
  });

  it("コードだけ・リンクまるごと・前後の空白、どれを貼っても読める", () => {
    const code = cardCode({ kind: "odai", card: ODAI });
    expect(extractCode(`  ${code} `)).toBe(code);
    expect(extractCode(cardLink("http://localhost:3010/", code))).toBe(code);
    expect(extractCode(`/bingo?card=${encodeURIComponent(code)}`)).toBe(code);
  });

  it("読めないコードは分かるエラー", () => {
    expect(() => decodeCardCode("", MUSICS)).toThrow(/コード/);
    expect(() => decodeCardCode("OD1:u1.u2", MUSICS)).toThrow();
    expect(() => decodeCardCode("abc", MUSICS)).toThrow();
  });
});

describe("共有の文", () => {
  it("種類と埋めたマスを短く。ハッシュタグは #プロセカ だけ", () => {
    const t = shareText("odai", { filled: 12, total: 24, reach: 1, bingo: true, lines: [0] });
    expect(t).toContain("お題ビンゴ");
    expect(t).toContain("12/24");
    expect(t).toContain("BINGO");
    expect(t.match(/#\S+/g)).toEqual(["#プロセカ"]);
    expect(shareText("song", { filled: 3, total: 24, reach: 2, bingo: false, lines: [] })).toContain("リーチ 2");
  });
});

describe("shareCard（端末に合わせて切り替える）", () => {
  const blob = new Blob(["png"], { type: "image/png" });
  const meta = { text: "お題ビンゴ #プロセカ", url: "https://x/bingo?card=a", fileName: "bingo.png" };

  it("画像を送れる端末では share に画像・文・リンクを渡す", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copyImage = vi.fn();
    const download = vi.fn();
    const r = await shareCard(blob, meta, { share, canShare: () => true, copyImage, download });
    expect(r).toBe("shared");
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.files?.[0].type).toBe("image/png");
    expect(data.text).toContain(meta.text);
    expect(data.text).toContain(meta.url);
    expect(copyImage).not.toHaveBeenCalled();
  });

  it("送る画面を閉じたら cancelled（ほかの方法に切り替えない）", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    const download = vi.fn();
    expect(await shareCard(blob, meta, { share, canShare: () => true, download })).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });

  it("share が無い・画像を送れない端末（PC など）では画像をクリップボードへ", async () => {
    const copyImage = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    expect(await shareCard(blob, meta, { copyImage, download })).toBe("copied");
    const share = vi.fn();
    expect(await shareCard(blob, meta, { share, canShare: () => false, copyImage, download })).toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });

  it("コピーもできなければ保存する", async () => {
    const copyImage = vi.fn().mockRejectedValue(new Error("denied"));
    const download = vi.fn();
    expect(await shareCard(blob, meta, { copyImage, download })).toBe("saved");
    expect(download).toHaveBeenCalledWith(blob, "bingo.png");
    expect(await shareCard(blob, meta, { download })).toBe("saved");
  });
});
