import { describe, expect, it } from "vitest";
import { derive, summarize } from "./deriveMysekaiData.mjs";

const NOW = Date.UTC(2026, 7, 17);

/**
 * 最小のフィクスチャ。
 *
 * キャラは3人（1=一歌 / 2=咲希 / 21=ミク）。
 * ★ ミクは VIRTUAL SINGER と Leo/need の2ユニットに属する（unit 101 と 102）。
 *   実マスタでも1人のキャラが複数の gameCharacterUnit を持つので、
 *   潰し忘れると同じ人が複数回出る。ここで固定する。
 */
const src = () => ({
  mysekaiFixtures: [
    {
      id: 1,
      name: "ソファ",
      pronunciation: "そふぁ",
      mysekaiFixtureType: "normal",
      gridSize: { width: 2, depth: 1, height: 4 },
      mysekaiFixtureMainGenreId: 2,
      mysekaiFixtureSubGenreId: 3,
      mysekaiSettableSiteType: "room",
      mysekaiSettableLayoutType: "floor",
      firstPutCost: 20,
      isGameCharacterAction: true,
    },
    {
      id: 2,
      name: "まど",
      // 読みが名前と同じなら持たない（サイズ削減）。
      pronunciation: "まど",
      mysekaiFixtureType: "normal",
      gridSize: { width: 1, depth: 1, height: 1 },
      mysekaiSettableSiteType: "room",
      mysekaiSettableLayoutType: "wall",
      firstPutCost: 5,
      isGameCharacterAction: false,
    },
    // 反応も設計図も持たない家具。空の項目がぶら下がらないことの確認用。
    { id: 3, name: "置物", mysekaiFixtureType: "normal", gridSize: { width: 1, depth: 1, height: 1 } },
  ],
  mysekaiFixtureMainGenres: [
    { id: 1, name: "すべて" },
    { id: 2, name: "一般" },
  ],
  mysekaiFixtureSubGenres: [
    { id: 1, name: "すべて" },
    { id: 3, name: "テーブル" },
  ],
  mysekaiBlueprints: [
    { id: 100, mysekaiCraftType: "mysekai_fixture", craftTargetId: 1, isEnableSketch: true },
    { id: 101, mysekaiCraftType: "mysekai_fixture", craftTargetId: 2, isEnableSketch: false },
    // 家具以外は無視する
    { id: 102, mysekaiCraftType: "mysekai_tool", craftTargetId: 1, isEnableSketch: true },
  ],
  mysekaiCharacterTalks: [
    // 家具1のソロ会話（一歌）
    { id: 1, mysekaiGameCharacterUnitGroupId: 1, mysekaiCharacterTalkConditionGroupId: 10 },
    // 家具1のグループ会話（一歌＋咲希）
    { id: 2, mysekaiGameCharacterUnitGroupId: 2, mysekaiCharacterTalkConditionGroupId: 10 },
    // 家具2の会話（ミク。unit が2つあるが1人として数える）
    { id: 3, mysekaiGameCharacterUnitGroupId: 3, mysekaiCharacterTalkConditionGroupId: 11 },
    // 家具条件を持たない会話（読了エピソード条件のみ）。どの家具にも紐付かない。
    { id: 4, mysekaiGameCharacterUnitGroupId: 1, mysekaiCharacterTalkConditionGroupId: 12 },
  ],
  mysekaiCharacterTalkConditions: [
    { id: 1000, mysekaiCharacterTalkConditionType: "mysekai_fixture_id", mysekaiCharacterTalkConditionTypeValue: 1 },
    { id: 1001, mysekaiCharacterTalkConditionType: "mysekai_fixture_id", mysekaiCharacterTalkConditionTypeValue: 2 },
    { id: 1002, mysekaiCharacterTalkConditionType: "read_event_story_episode_id", mysekaiCharacterTalkConditionTypeValue: 55 },
  ],
  mysekaiCharacterTalkConditionGroups: [
    { id: 1, groupId: 10, mysekaiCharacterTalkConditionId: 1000 },
    { id: 2, groupId: 11, mysekaiCharacterTalkConditionId: 1001 },
    { id: 3, groupId: 12, mysekaiCharacterTalkConditionId: 1002 },
  ],
  mysekaiGameCharacterUnitGroups: [
    { id: 1, gameCharacterUnitId1: 1 },
    { id: 2, gameCharacterUnitId1: 1, gameCharacterUnitId2: 2 },
    // ミクの2ユニットを同じグループに入れる（重複排除の確認）
    { id: 3, gameCharacterUnitId1: 101, gameCharacterUnitId2: 102 },
  ],
  mysekaiCharacterTalkFixtureCommons: [
    { id: 1, gameCharacterUnitId: 1, mysekaiCharacterTalkFixtureCommonType: "positive", mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroupId: 500 },
    { id: 2, gameCharacterUnitId: 2, mysekaiCharacterTalkFixtureCommonType: "normal", mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroupId: 500 },
  ],
  mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroups: [
    { id: 1, groupId: 500, mysekaiFixtureId: 1 },
  ],
  gameCharacterUnits: [
    { id: 1, gameCharacterId: 1, unit: "light_sound" },
    { id: 2, gameCharacterId: 2, unit: "light_sound" },
    { id: 101, gameCharacterId: 21, unit: "piapro" },
    { id: 102, gameCharacterId: 21, unit: "light_sound" },
  ],
  gameCharacters: [
    { id: 1, firstName: "星乃", givenName: "一歌" },
    { id: 2, firstName: "天馬", givenName: "咲希" },
    { id: 21, givenName: "初音ミク" },
    // 反応にまったく出てこないキャラは選択肢に載せない
    { id: 26, givenName: "KAITO" },
  ],
});

const byId = (out, id) => out.fixtures.find((f) => f.id === id);

describe("derive", () => {
  it("家具の基本情報を写す", () => {
    const f = byId(derive(src(), NOW), 1);
    expect(f.name).toBe("ソファ");
    expect(f.sz).toEqual([2, 1, 4]);
    expect(f.co).toBe(20);
    expect(f.mg).toBe(2);
    expect(f.sg).toBe(3);
  });

  it("読みが名前と同じなら持たない（違えば持つ）", () => {
    const out = derive(src(), NOW);
    expect(byId(out, 1).pr).toBe("そふぁ");
    expect(byId(out, 2)).not.toHaveProperty("pr");
  });

  it("設置場所・向き・種別は辞書の添字で持つ", () => {
    const out = derive(src(), NOW);
    expect(out.vocab.site[byId(out, 1).st]).toBe("room");
    expect(out.vocab.layout[byId(out, 1).ly]).toBe("floor");
    expect(out.vocab.layout[byId(out, 2).ly]).toBe("wall");
    expect(out.vocab.type[byId(out, 1).ty]).toBe("normal");
  });

  // ★ このテストが本体。グループ会話の参加者を全員展開しないと、
  //   「2人会話にしか出ないキャラ」がキャラ絞り込みから丸ごと漏れる。
  it("グループ会話の参加者を全員 talkChars に展開する", () => {
    const f = byId(derive(src(), NOW), 1);
    expect(f.tc).toEqual([1, 2]); // ソロ(一歌) + グループ(一歌+咲希)
    expect(f.tn).toBe(2); // 会話の本数は2本
  });

  it("同じキャラの複数ユニットを1人に潰す（ミクが重複しない）", () => {
    const f = byId(derive(src(), NOW), 2);
    expect(f.tc).toEqual([21]);
  });

  it("家具以外の条件しか持たない会話は、どの家具にも紐付けない", () => {
    const out = derive(src(), NOW);
    // 会話4は読了エピソード条件のみ。家具1の本数が増えていないことで確認する。
    expect(byId(out, 1).tn).toBe(2);
    expect(summarize(out).talks).toBe(3);
  });

  // ★ normal（無関心）は出力しない。キャラ絞り込みに混ぜたところ26人の結果が
  //   ほぼ同一になった（実測 Jaccard 0.957・上位10件が全員一致）ため。
  it("好み(positive)だけを出し、無関心(normal)は持たない", () => {
    const f = byId(derive(src(), NOW), 1);
    expect(f.lc).toEqual([1]);
    expect(f).not.toHaveProperty("nc");
  });

  // ★ 家具全体の会話数をキャラ選択中の画面に出すと実数の19倍になった。
  it("キャラごとの会話本数を tc と同じ並びで持つ", () => {
    const f = byId(derive(src(), NOW), 1);
    // 家具1: 一歌ソロ1本 + (一歌+咲希)1本 → 一歌2本 / 咲希1本
    expect(f.tc).toEqual([1, 2]);
    expect(f.tk).toEqual([2, 1]);
    expect(f.tn).toBe(2); // 家具全体では2本
  });

  // ★ ひとりで喋る会話と、誰かと居ないと始まらない会話は家具を置く動機がまるで違う。
  //   ユニットのソファ16件は「全員がソロ会話を持たない」＝ひとりで訪ねても何も起きない。
  it("ひとりで喋る会話の本数を分けて持つ", () => {
    const f = byId(derive(src(), NOW), 1);
    // 家具1: 一歌ソロ1本 + (一歌+咲希)1本
    expect(f.tc).toEqual([1, 2]);
    expect(f.tk).toEqual([2, 1]); // 総数: 一歌2 / 咲希1
    expect(f.ts).toEqual([1, 0]); // うちソロ: 一歌1 / 咲希0（咲希は一歌と居ないと喋らない）
    expect(f.tp).toBe(2); // 最大2人で会話する
  });

  it("ソロ会話しか無ければ最大人数を持たない", () => {
    const f = byId(derive(src(), NOW), 2); // ミクのソロ会話のみ
    expect(f.ts).toEqual([1]);
    expect(f).not.toHaveProperty("tp");
  });

  // ★ mysekai_canvas は家具IDの名前空間を共有している。弾くと壁掛けキャンバス6件が
  //   「設計図なし」と表示され、実際は模写できるのに模写フィルタから消える。
  it("キャンバスの設計図を家具として受け入れる", () => {
    const s = src();
    s.mysekaiFixtures.push({ id: 9, name: "壁掛けキャンバス", mysekaiFixtureType: "canvas", gridSize: {} });
    s.mysekaiBlueprints.push({
      id: 200,
      mysekaiCraftType: "mysekai_canvas",
      craftTargetId: 9,
      isEnableSketch: true,
    });
    expect(byId(derive(s, NOW), 9).sk).toBe(true);
  });

  // ★ 好みは gameCharacterUnit 単位で定義されている。ミクだけ5ユニットぶんの行を持ち、
  //   キャラ単位に潰すのは重複排除ではなく別プロファイルの合成になる。
  it("複数ユニットぶんの好みを合成したキャラを記録する", () => {
    const s = src();
    // ミク(21)の2つ目のユニット(102)にも好みを定義する
    s.mysekaiCharacterTalkFixtureCommons.push(
      { id: 3, gameCharacterUnitId: 101, mysekaiCharacterTalkFixtureCommonType: "positive", mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroupId: 500 },
      { id: 4, gameCharacterUnitId: 102, mysekaiCharacterTalkFixtureCommonType: "normal", mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroupId: 500 }
    );
    const out = derive(s, NOW);
    expect(out.multiUnitLikes[21]).toBe(2);
    // 一歌は1ユニットぶんしか無いので記録されない
    expect(out.multiUnitLikes[1]).toBeUndefined();
  });

  // 合成の結果、同じキャラが positive と normal の両方に入ることがある（実測128件）。
  // 両方に居ると画面が「お気に入り」と断言してしまうので、強い方を残す。
  it("positive と normal に二重登録されたら positive を優先する", () => {
    const s = src();
    s.mysekaiCharacterTalkFixtureCommons.push(
      { id: 3, gameCharacterUnitId: 101, mysekaiCharacterTalkFixtureCommonType: "positive", mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroupId: 500 },
      { id: 4, gameCharacterUnitId: 102, mysekaiCharacterTalkFixtureCommonType: "normal", mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroupId: 500 }
    );
    expect(byId(derive(s, NOW), 1).lc).toContain(21);
  });

  it("家具が1件も属さないジャンルは選択肢に出さない", () => {
    const out = derive(src(), NOW);
    // フィクスチャの家具が使うのは mainGenre 2 のみ。1(すべて)は落ちる。
    expect(out.genres.main.map((g) => g.id)).toEqual([2]);
  });

  it("模写可否を設計図から取り、設計図が無ければ項目ごと落とす", () => {
    const out = derive(src(), NOW);
    expect(byId(out, 1).sk).toBe(true);
    expect(byId(out, 2).sk).toBe(false); // 模写不可は false（「設計図なし」と区別する）
    expect(byId(out, 3)).not.toHaveProperty("sk");
  });

  it("家具以外の設計図（道具）を家具に紐付けない", () => {
    // craftTargetId=1 の mysekai_tool があるが、家具1の判定は mysekai_fixture 側で決まる
    const s = src();
    s.mysekaiBlueprints = [{ id: 102, mysekaiCraftType: "mysekai_tool", craftTargetId: 3, isEnableSketch: true }];
    expect(byId(derive(s, NOW), 3)).not.toHaveProperty("sk");
  });

  it("反応も設計図も無い家具は空の項目をぶら下げない", () => {
    const f = byId(derive(src(), NOW), 3);
    for (const k of ["tc", "tn", "lc", "nc", "ac", "sk"]) {
      expect(f, `${k} が残っている`).not.toHaveProperty(k);
    }
  });

  it("キャラアクションは true のときだけ持つ", () => {
    const out = derive(src(), NOW);
    expect(byId(out, 1).ac).toBe(1);
    expect(byId(out, 2)).not.toHaveProperty("ac");
  });

  it("反応に出てこないキャラは選択肢に載せない", () => {
    const out = derive(src(), NOW);
    expect(out.characters.map((c) => c.name)).toEqual(["星乃一歌", "天馬咲希", "初音ミク"]);
  });

  it("生成時刻を渡された now で固定する", () => {
    expect(derive(src(), NOW).generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("マスタが空でも落ちない", () => {
    const out = derive({}, NOW);
    expect(out.fixtures).toEqual([]);
    expect(out.characters).toEqual([]);
  });

  it("id が文字列で来ても数値として扱う（マスタの型揺れ対策）", () => {
    const s = src();
    s.mysekaiCharacterTalkConditions[0].mysekaiCharacterTalkConditionTypeValue = "1";
    expect(byId(derive(s, NOW), 1).tn).toBe(2);
  });
});

describe("summarize", () => {
  it("種別ごとの件数を数える", () => {
    const out = derive(src(), NOW);
    const s = summarize(out);
    expect(s.fixtures).toBe(3);
    expect(s.characters).toBe(3);
    expect(s.withTalk).toBe(2); // 家具1と2
    expect(s.withAction).toBe(1); // 家具1
    expect(s.withCommon).toBe(1); // 家具1
    expect(s.reactive).toBe(2); // 家具3は反応なし
    expect(s.sketchable).toBe(1); // 模写可は家具1のみ
  });
});
