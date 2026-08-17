/**
 * 配信データ（public/MysekaiDatas/）そのものを検算する。
 *
 * ★ **これが無かったせいで、2周のレビューで出た致命傷が880件のテストを素通りした。**
 *   フィクスチャの自作自演では「実装が書いたとおりに動くこと」しか確かめられない。
 *   結合の壊れ・画像の取りこぼし・絞り込みの機能不全は、実データに当てないと出ない。
 *
 * 落ちたときは実装かマスタのどちらかが変わっている。件数の期待値は緩めに置き
 *（マスタは増えるので）、**構造の壊れ方**を捕まえることに集中する。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyFilter, DEFAULT_FILTER } from "./filter";
import { normalize } from "./types";

const ROOT = path.join(process.cwd(), "public/MysekaiDatas");
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures.json"), "utf8"));
const data = normalize(raw);

describe("配信データの構造", () => {
  it("家具とキャラが読める", () => {
    expect(data.fixtures.length).toBeGreaterThan(1400);
    expect(data.characters.length).toBe(26);
    // 26人ぶんの色と1文字が揃っている（顔ぶれ表示がこれに依存する）
    for (const c of data.characters) {
      expect(c.color, `${c.name} に色が無い`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.initial, `${c.name} に1文字が無い`).toHaveLength(1);
    }
  });

  it("名前の1文字目が26人で重複しない（顔ぶれチップの識別子になる）", () => {
    const initials = data.characters.map((c) => c.initial);
    expect(new Set(initials).size).toBe(initials.length);
  });

  // ★ 顔ぶれ(pt)と登場キャラ(tc)がズレると、モーダルの回収チェックと
  //   一覧のキャラ絞り込みが食い違う。
  it("顔ぶれに出るキャラの集合が talkChars と一致する", () => {
    const broken = data.fixtures.filter((f) => {
      if (f.parties.length === 0) return f.talkChars.length > 0;
      const inParties = new Set(f.parties.flat());
      return (
        inParties.size !== f.talkChars.length || f.talkChars.some((c) => !inParties.has(c))
      );
    });
    expect(broken.map((f) => f.name)).toEqual([]);
  });

  // ★ 回収の分母は顔ぶれ数。会話本数より多くなることは原理的に無い
  //   （同じ顔ぶれで複数の会話があるため、顔ぶれ ≤ 本数）。
  it("顔ぶれの通り数が会話本数を超えない", () => {
    const bad = data.fixtures.filter((f) => f.parties.length > f.talkCount);
    expect(bad.map((f) => `${f.name} ${f.parties.length}>${f.talkCount}`)).toEqual([]);
  });

  it("キャラ別の会話本数の合計が、家具の総本数と辻褄が合う", () => {
    for (const f of data.fixtures.slice(0, 200)) {
      for (const [charId, n] of f.talkCountBy) {
        expect(n, `${f.name} の ${charId}`).toBeGreaterThan(0);
        // 1人ぶんが全体を超えることは無い
        expect(n).toBeLessThanOrEqual(f.talkCount);
        // ソロは全体の内数
        expect(f.talkSoloBy.get(charId) ?? 0).toBeLessThanOrEqual(n);
      }
    }
  });

  it("模写可否は3値を保つ（true/false/null を潰さない）", () => {
    const vals = new Set(data.fixtures.map((f) => f.sketch));
    expect(vals.has(true)).toBe(true);
    expect(vals.has(false)).toBe(true);
    expect(vals.has(null)).toBe(true);
  });
});

describe("キャラ絞り込みが実際に効くか", () => {
  /**
   * ★ 1周目のレビューで、無関心(normal)を混ぜたせいで26人の結果がほぼ同一になっていた
   *   （平均 Jaccard 0.957・会話数順の上位10件が全員一致）。件数は全部正しかったのに、
   *   絞り込みという機能そのものが死んでいた。**件数ではなく差が出ることを縛る。**
   */
  const results = new Map<number, Set<number>>();
  for (const c of data.characters) {
    const list = applyFilter(data.fixtures, { ...DEFAULT_FILTER, charId: c.id });
    results.set(c.id, new Set(list.map((f) => f.id)));
  }

  it("キャラごとに結果集合が十分に違う（平均 Jaccard < 0.75）", () => {
    const ids = [...results.keys()];
    const scores: number[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = results.get(ids[i])!;
        const b = results.get(ids[j])!;
        const inter = [...a].filter((x) => b.has(x)).length;
        scores.push(inter / new Set([...a, ...b]).size);
      }
    }
    const avg = scores.reduce((x, y) => x + y, 0) / scores.length;
    expect(avg, `平均 Jaccard ${avg.toFixed(3)}`).toBeLessThan(0.75);
  });

  it("誰を選んでも結果が空にならない", () => {
    for (const [id, set] of results) {
      expect(set.size, `charaId ${id}`).toBeGreaterThan(50);
    }
  });

  /**
   * 1周目は会話数順の上位10件が**26人全員で完全一致**していた（heads.size === 1）。
   * ★ 逆に「全員バラバラ」も期待してはいけない。同じユニットのメンバーは同じ
   *   ユニット家具に出るので、上位が揃うのが正しい（実測: ワンダショ4人・Leo/need組など、
   *   26人が13パターンに収まる）。**ユニット単位で見て差が出ること**を縛る。
   */
  it("会話数で並べた先頭が全員同じにならない", () => {
    const heads = new Set<string>();
    for (const c of data.characters) {
      const list = applyFilter(data.fixtures, {
        ...DEFAULT_FILTER,
        charId: c.id,
        sort: "talks",
        desc: true,
      });
      heads.add(
        list
          .slice(0, 5)
          .map((f) => f.id)
          .join(",")
      );
    }
    /**
     * ★ ここは「バラバラであること」を期待してはいけない。
     *   同じユニットのメンバーは同じユニット家具に出るし、バーチャル・シンガーは
     *   各セカイに登場するのでそのユニットの人と揃う（KAITO はワンダショ組と、
     *   MEIKO は VBS 組と同じ並びになる）。**揃うのが正しい。**
     *   縛りたいのは「26人が1パターンに潰れる」＝絞り込みが死んだ状態の再発だけ。
     *   実測13パターン。半分の6を割ったら疑う。
     */
    expect(heads.size, `先頭5件のパターン数 ${heads.size}`).toBeGreaterThan(6);
  });
});

describe("サムネイル", () => {
  const thumbs = new Set(
    fs.existsSync(path.join(ROOT, "thumb"))
      ? fs.readdirSync(path.join(ROOT, "thumb")).map((f) => f.replace(/\.webp$/, ""))
      : []
  );

  // ★ 壁紙と床が同じ保存名になって上書きされる事故があった。参照と実体を両方向で見る。
  it("参照している画像がすべて存在する", () => {
    const missing = data.fixtures.filter((f) => f.image && !thumbs.has(f.image));
    expect(missing.map((f) => `${f.name} (${f.image})`)).toEqual([]);
  });

  it("使われていない画像が残っていない", () => {
    const used = new Set(data.fixtures.map((f) => f.image).filter(Boolean));
    const orphans = [...thumbs].filter((t) => !used.has(t));
    expect(orphans).toEqual([]);
  });

  it("すべての家具が画像を持つ", () => {
    expect(data.fixtures.filter((f) => !f.image).map((f) => f.name)).toEqual([]);
  });
});
