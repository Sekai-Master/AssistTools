/**
 * 書き出し・取り込みのテスト。
 *
 * ★ 取り込みは**外部から来たファイル**を読む経路。人が編集できるし、まったく
 *   別のファイルを掴んで渡すこともできる。「知らないキー」「文字列でない値」
 *   「壊れた中身」「巨大なファイル」で書き戻さないこと、そして**黙って捨てず
 *   理由を返すこと**をここで固定する。
 */
import { describe, expect, it } from "vitest";
import {
  applyBackup,
  backupFileName,
  buildBackup,
  parseBackup,
  BACKUP_APP,
  BACKUP_VERSION,
} from "./backup";

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    read: (k: string) => m.get(k) ?? null,
    write: (k: string, v: string) => void m.set(k, v),
    all: () => Object.fromEntries(m),
  };
};

const PROFILES = JSON.stringify([{ id: "p1", name: "編成1", order: 0, power: 236756 }]);
const CARDS = JSON.stringify({ 471: { level: 60 } });

describe("書き出し", () => {
  it("保存しているものを生の文字列のまま入れる", () => {
    const s = store({ "sekaimaster:profiles:v1": PROFILES, "sekaimaster:theme:v1": "dark" });
    const file = buildBackup(s.read, 1700000000000);
    expect(file.app).toBe(BACKUP_APP);
    expect(file.version).toBe(BACKUP_VERSION);
    // ★ JSON として解釈し直さない。"dark" のような値の引用符の有無が変わって壊れるため。
    expect(file.data["sekaimaster:theme:v1"]).toBe("dark");
    expect(file.data["sekaimaster:profiles:v1"]).toBe(PROFILES);
  });

  it("空の項目・知らないキーは入れない", () => {
    const s = store({
      "sekaimaster:profiles:v1": "[]", // 実質空
      "sekaimaster:plans:v1": "こわれてる",
      "何かよそのキー": "x",
    });
    const file = buildBackup(s.read, 0);
    expect(Object.keys(file.data)).toEqual(["sekaimaster:plans:v1"]); // 壊れていても持ち出す（消えるよりまし）
  });

  it("人が見るための要約が付く（取り込みでは使わない）", () => {
    const file = buildBackup(store({ "sekaimaster:profiles:v1": PROFILES }).read, 0);
    expect(file.summary).toEqual({ 編成: "1 件" });
  });

  it("ファイル名に日付が入る", () => {
    expect(backupFileName(new Date(2026, 7, 2))).toBe("sekai-master-20260802.json");
  });
});

describe("取り込み", () => {
  const fileText = (data: Record<string, unknown>, over: Record<string, unknown> = {}) =>
    JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: 1, data, ...over });

  it("往復して同じ中身が戻る", () => {
    const src = store({ "sekaimaster:profiles:v1": PROFILES, "sekaimaster:deck:cards:v1": CARDS });
    const text = JSON.stringify(buildBackup(src.read, 0));

    const dest = store();
    const parsed = parseBackup(text, dest.read);
    expect(parsed.problems).toEqual([]);
    expect(applyBackup(parsed.entries, dest.write)).toBe(2);
    expect(dest.all()).toEqual(src.all());
  });

  it("いま入っているものと、入ってくるものの両方を見せる", () => {
    const dest = store({ "sekaimaster:profiles:v1": "[]" });
    const [entry] = parseBackup(fileText({ "sekaimaster:profiles:v1": PROFILES }), dest.read).entries;
    expect(entry.summary).toBe("1 件");
    expect(entry.current).toBeNull(); // 空配列は「無い」扱い
  });

  it("知らないキーは書き戻さず、理由を返す", () => {
    const parsed = parseBackup(fileText({ "evil:key": "x" }), store().read);
    expect(parsed.entries).toEqual([]);
    expect(parsed.problems[0]).toContain("知らない項目");
  });

  it("文字列でない値は取り込まない（オブジェクトを直接ねじ込ませない）", () => {
    const parsed = parseBackup(fileText({ "sekaimaster:profiles:v1": [{ id: "x" }] }), store().read);
    expect(parsed.entries).toEqual([]);
    expect(parsed.problems[0]).toContain("文字列ではない");
  });

  it("中身が壊れている項目は取り込まない", () => {
    const parsed = parseBackup(fileText({ "sekaimaster:profiles:v1": "{こわれ" }), store().read);
    expect(parsed.entries).toEqual([]);
    expect(parsed.problems[0]).toContain("読み取れません");
  });

  it("大きすぎる項目は取り込まない", () => {
    const parsed = parseBackup(
      fileText({ "sekaimaster:profiles:v1": JSON.stringify(["x".repeat(2_000_001)]) }),
      store().read
    );
    expect(parsed.entries).toEqual([]);
    expect(parsed.problems[0]).toContain("大きすぎる");
  });

  it("別のファイル・壊れたファイルはその旨を返す（例外を投げない）", () => {
    expect(parseBackup("{", store().read).problems[0]).toContain("JSON として読めません");
    expect(parseBackup("[]", store().read).problems[0]).toContain("書き出したファイルではない");
    expect(parseBackup(JSON.stringify({ app: "other" }), store().read).problems[0]).toContain(
      "書き出したファイルではない"
    );
  });

  it("新しいバージョンのファイルは読めるふりをしない", () => {
    const parsed = parseBackup(fileText({}, { version: BACKUP_VERSION + 1 }), store().read);
    expect(parsed.problems[0]).toContain("新しいバージョン");
  });

  it("選ばれた項目だけ書き、ファイルに無いものには触らない", () => {
    const dest = store({ "sekaimaster:plans:v1": "[1]" });
    const parsed = parseBackup(fileText({ "sekaimaster:profiles:v1": PROFILES }), dest.read);
    applyBackup(parsed.entries, dest.write);
    // 既にあったプランはそのまま（「復元＝全消しして入れ直す」にしない）。
    expect(dest.read("sekaimaster:plans:v1")).toBe("[1]");
    expect(dest.read("sekaimaster:profiles:v1")).toBe(PROFILES);
  });

  it("書き込みに失敗しても落ちず、書けた件数を返す", () => {
    const parsed = parseBackup(fileText({ "sekaimaster:profiles:v1": PROFILES }), store().read);
    expect(
      applyBackup(parsed.entries, () => {
        throw new Error("QuotaExceeded");
      })
    ).toBe(0);
  });
});
