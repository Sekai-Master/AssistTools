/**
 * マイセカイの家具と「キャラの反応」を結び直す純関数群。
 * 取得と書き出しは refresh-mysekai-data.mjs 側、判断はここ（deriveCardData.mjs と同じ分担）。
 *
 * ★★ この表には未公開判定に使える日付欄が無い。★★
 *   カード・イベントは publishedAt / startAt があるので `published = at <= now` で切れるが、
 *   mysekaiFixtures の列は26個すべて確認して**日付が1つも無い**（2026-08-17 実測）。
 *   mysekaiBlueprintTerms は期間限定配布の125件しか持たず、全1,462件の設計図を覆えない。
 *   したがって deriveCardData.mjs の auditLeaks() に相当する検算は**原理的に書けない**。
 *   Nori 判断（2026-08-17）で全件を出力するが、画面側は既定で「反応あり」に絞る。
 *   将来マスタに releaseAt 相当が入ったら、ここに published 判定を足すこと。
 *
 * 「反応」には別物が3種類ある。重なるが一致しない（実測 A∩B=143 / B∩C=258 / A∩C=99）。
 *   A. キャラアクション … 家具の isGameCharacterAction。キャラがその家具でモーションする
 *   B. 固有会話       … その家具を置くと発生する専用会話。条件テーブル経由で結ぶ
 *   C. 共通反応       … キャラごとの好み（positive / normal）。家具グループ単位
 */

/** 会話の発火条件のうち、家具を指すもの。他に読了エピソード・天候・訪問回数がある。 */
const FIXTURE_CONDITION = "mysekai_fixture_id";

/** mysekaiGameCharacterUnitGroups が持つキャラ枠。1〜5人のグループがある。 */
const UNIT_SLOTS = [
  "gameCharacterUnitId1",
  "gameCharacterUnitId2",
  "gameCharacterUnitId3",
  "gameCharacterUnitId4",
  "gameCharacterUnitId5",
];

/** 数値として使える id だけ通す（マスタの型揺れ・文字列混入を弾く）。 */
function toId(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isInteger(n) ? n : null;
}

function fullName(c) {
  return `${c.firstName ?? ""}${c.givenName ?? ""}`.trim();
}

/**
 * gameCharacterUnitId → gameCharacterId の対応。
 *
 * ★ 1人のキャラが複数の unit を持つ（ミクは VIRTUAL SINGER と各ユニットぶんの行がある）。
 *   反応を「キャラ単位」で見せたいので、ここで unit を潰してキャラに寄せる。
 *   潰さないとミクが6人に分裂して見える。
 */
function buildUnitToChara(gameCharacterUnits) {
  const map = new Map();
  for (const u of gameCharacterUnits ?? []) {
    const id = toId(u?.id);
    const chara = toId(u?.gameCharacterId);
    if (id != null && chara != null) map.set(id, chara);
  }
  return map;
}

/**
 * キャラID → メンバーカラー。
 * ★ 同じキャラは所属ユニットが違っても同じ色を持つ（実測で確認）。最初に出たものを採る。
 */
function buildCharaColor(gameCharacterUnits) {
  const map = new Map();
  for (const u of gameCharacterUnits ?? []) {
    const chara = toId(u?.gameCharacterId);
    if (chara == null || map.has(chara)) continue;
    if (typeof u.colorCode === "string" && u.colorCode) map.set(chara, u.colorCode);
  }
  return map;
}

/** unitGroupId → キャラIDの配列（重複排除済み）。 */
function buildGroupToCharas(unitGroups, unitToChara) {
  const map = new Map();
  for (const g of unitGroups ?? []) {
    const id = toId(g?.id);
    if (id == null) continue;
    const charas = new Set();
    for (const slot of UNIT_SLOTS) {
      const unitId = toId(g[slot]);
      if (unitId == null) continue;
      const chara = unitToChara.get(unitId);
      if (chara != null) charas.add(chara);
    }
    map.set(id, charas);
  }
  return map;
}

/**
 * 会話の conditionGroupId → その会話が要求する家具IDの配列。
 *
 * conditionGroups は (groupId, conditionId) の対応表で、1グループが複数条件を持つ（AND）。
 * 家具以外の条件（読了エピソード等）は無視し、家具条件だけ拾う。
 */
function buildConditionGroupToFixtures(talkConditions, talkConditionGroups) {
  const condType = new Map();
  for (const c of talkConditions ?? []) {
    const id = toId(c?.id);
    if (id == null) continue;
    condType.set(id, c);
  }

  const map = new Map();
  for (const row of talkConditionGroups ?? []) {
    const groupId = toId(row?.groupId);
    const condId = toId(row?.mysekaiCharacterTalkConditionId);
    if (groupId == null || condId == null) continue;
    const cond = condType.get(condId);
    if (!cond || cond.mysekaiCharacterTalkConditionType !== FIXTURE_CONDITION) continue;
    const fixtureId = toId(cond.mysekaiCharacterTalkConditionTypeValue);
    if (fixtureId == null) continue;
    if (!map.has(groupId)) map.set(groupId, []);
    map.get(groupId).push(fixtureId);
  }
  return map;
}

/**
 * 家具条件を2つ以上持つ条件グループの数。
 *
 * ★ 条件グループは **AND**（全部満たして初めて会話が出る）だが、collectTalks は
 *   家具ごとにばらして数える＝ OR として展開している。現在のマスタには
 *   家具条件を2つ以上持つグループが1件も無いので実害が出ていないだけ。
 *   「家具Aと家具Bの両方を置くと発生する会話」が入ったら、総数が水増しされ、
 *   AとBがそれぞれ単独で発生するように見える。増えたら気づけるように数える。
 */
function countMultiFixtureGroups(conditionGroupToFixtures) {
  let n = 0;
  for (const fixtureIds of conditionGroupToFixtures.values()) {
    if (fixtureIds.length > 1) n += 1;
  }
  return n;
}

/**
 * B: 固有会話を家具ごとに集計する。
 *
 * ★ 会話は1〜5人のグループで発生する（実測: 1人56 / 2人240 / 3人620 / 4人1065 / 5人1266）。
 *   グループ会話の参加者を**全員** talkChars に展開しないと、キャラ単体で絞ったときに
 *   「2人会話にしか出ないキャラ」が丸ごと漏れる。
 */
function collectTalks(talks, groupToCharas, conditionGroupToFixtures) {
  /** fixtureId → { perChara:Map<charaId,{total,solo}>, count:number, maxParty:number } */
  const byFixture = new Map();
  for (const t of talks ?? []) {
    const fixtureIds = conditionGroupToFixtures.get(toId(t?.mysekaiCharacterTalkConditionGroupId));
    if (!fixtureIds || fixtureIds.length === 0) continue;
    const charas = groupToCharas.get(toId(t?.mysekaiGameCharacterUnitGroupId)) ?? new Set();
    // ★ 会話は1〜5人のグループで発生する。**ひとりで喋る会話と、誰かと居ないと
    //   始まらない会話は別物**で、家具を置く動機がまるで違う（ソロが無い家具は
    //   その子ひとりを訪ねても何も起きない）。人数を持って区別できるようにする。
    const solo = charas.size === 1;
    for (const fid of fixtureIds) {
      let entry = byFixture.get(fid);
      if (!entry) {
        entry = { perChara: new Map(), count: 0, maxParty: 0, parties: new Set() };
        byFixture.set(fid, entry);
      }
      entry.count += 1;
      entry.maxParty = Math.max(entry.maxParty, charas.size);
      // ★ 「誰が居るときの会話か」を持つ。同じ家具でも「司ひとり」と「司＋類」は
      //   別の条件で、揃えないと始まらない組がある。構成は重複を除いて持つ
      //   （実測でユニーク5,251件・素朴なJSONで27KB なので、丸ごと持って構わない）。
      if (charas.size > 0) entry.parties.add(sortedIds(charas).join(","));
      // ★ **キャラごとの本数を持つ。** 家具単位の総数をキャラ選択中の画面に出すと、
      //   「フレンチスタイルのソファ 91本」のうち一歌のぶんは4〜6本しかないのに
      //   91と表示されてしまう（実測で総数は本人分の19倍になった）。
      for (const c of charas) {
        const cur = entry.perChara.get(c) ?? { total: 0, solo: 0 };
        cur.total += 1;
        if (solo) cur.solo += 1;
        entry.perChara.set(c, cur);
      }
    }
  }
  return byFixture;
}

/**
 * C: 共通反応（好み）を家具ごとに集計する。
 * キャラ×タイプ(positive/normal) が家具グループを指し、そのグループに属する家具すべてが対象。
 */
function collectCommons(fixtureCommons, fixtureCommonGroups, unitToChara) {
  const groupToFixtures = new Map();
  for (const row of fixtureCommonGroups ?? []) {
    const groupId = toId(row?.groupId);
    const fixtureId = toId(row?.mysekaiFixtureId);
    if (groupId == null || fixtureId == null) continue;
    if (!groupToFixtures.has(groupId)) groupToFixtures.set(groupId, []);
    groupToFixtures.get(groupId).push(fixtureId);
  }

  /** fixtureId → { like:Set, normal:Set } */
  const byFixture = new Map();
  /** 複数ユニットぶんの定義を持つキャラ（＝合成が起きたキャラ）。 */
  const multiUnit = new Map();
  const seenUnitsPerChara = new Map();

  for (const c of fixtureCommons ?? []) {
    const unitId = toId(c?.gameCharacterUnitId);
    const chara = unitToChara.get(unitId);
    if (chara == null) continue;

    // ★ 好みは **gameCharacterUnit 単位**で定義されている（会話とは粒度が違う）。
    //   ミクだけ5ユニットぶんの行を持ち、それぞれ別の家具グループを指す。
    //   キャラ単位に潰すのは重複排除ではなく**別プロファイルの合成**なので、
    //   合成が起きたキャラを記録して呼び出し側が注記できるようにする。
    if (!seenUnitsPerChara.has(chara)) seenUnitsPerChara.set(chara, new Set());
    const units = seenUnitsPerChara.get(chara);
    units.add(unitId);
    if (units.size > 1) multiUnit.set(chara, units.size);

    const fixtures = groupToFixtures.get(
      toId(c?.mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroupId)
    );
    if (!fixtures) continue;
    const positive = c.mysekaiCharacterTalkFixtureCommonType === "positive";
    for (const fid of fixtures) {
      let entry = byFixture.get(fid);
      if (!entry) {
        entry = { like: new Set(), normal: new Set() };
        byFixture.set(fid, entry);
      }
      (positive ? entry.like : entry.normal).add(chara);
    }
  }

  // ★ 合成の結果、同じキャラが positive と normal の両方に入る家具が出る
  //   （あるセカイのミクは好きで、別のセカイのミクは無関心）。実測で128件。
  //   両方に居ると画面が「お気に入り」と断言してしまうので、**強い方（positive）を残す**。
  for (const entry of byFixture.values()) {
    for (const chara of entry.like) entry.normal.delete(chara);
  }

  return { byFixture, multiUnit };
}

/**
 * craftTargetId（家具ID）→ 設計図。
 *
 * ★ `mysekai_canvas` も**家具IDの名前空間を共有している**（craftTargetId 439〜444 が
 *   家具表の type="canvas" の6件と完全一致）。これを弾くと壁掛けキャンバスが
 *   「設計図なし」と表示され、実際は模写できるのに模写フィルタから消える。
 *   一方 `mysekai_tool` の 1〜10 は**道具側の別の名前空間**で、家具の小さいIDと
 *   偶然ぶつかるだけなので必ず除外する。
 */
const FIXTURE_CRAFT_TYPES = new Set(["mysekai_fixture", "mysekai_canvas"]);

function buildBlueprints(blueprints) {
  const map = new Map();
  for (const b of blueprints ?? []) {
    if (!FIXTURE_CRAFT_TYPES.has(b?.mysekaiCraftType)) continue;
    const target = toId(b?.craftTargetId);
    if (target == null) continue;
    map.set(target, b);
  }
  return map;
}

/** id → name の一覧。UI のフィルタ表示に使う。 */
function genreList(rows) {
  const out = [];
  for (const g of rows ?? []) {
    const id = toId(g?.id);
    if (id == null || typeof g.name !== "string") continue;
    out.push({ id, name: g.name });
  }
  return out;
}

const sortedIds = (set) => [...set].sort((a, b) => a - b);

/**
 * 派生データを作る。
 *
 * @param {object} src 取得したマスタ（refresh-mysekai-data.mjs の SOURCES と同じキー）
 * @param {number} now 生成時刻（ミリ秒）。取得中に日をまたいでも揺れないよう呼び出し側で固定する
 */
export function derive(src, now) {
  const unitToChara = buildUnitToChara(src.gameCharacterUnits);
  const charaColor = buildCharaColor(src.gameCharacterUnits);
  const groupToCharas = buildGroupToCharas(src.mysekaiGameCharacterUnitGroups, unitToChara);
  const conditionGroupToFixtures = buildConditionGroupToFixtures(
    src.mysekaiCharacterTalkConditions,
    src.mysekaiCharacterTalkConditionGroups
  );
  const talkByFixture = collectTalks(
    src.mysekaiCharacterTalks,
    groupToCharas,
    conditionGroupToFixtures
  );
  const { byFixture: commonByFixture, multiUnit } = collectCommons(
    src.mysekaiCharacterTalkFixtureCommons,
    src.mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroups,
    unitToChara
  );
  const blueprintByFixture = buildBlueprints(src.mysekaiBlueprints);

  // 反応に登場するキャラだけを載せる（フィルタの選択肢になるので、出てこない人を並べない）。
  // ★ normal（無関心）は数えない。出力にも持たないので、選択肢の根拠にもしない。
  const usedCharas = new Set();
  for (const { perChara } of talkByFixture.values()) {
    for (const c of perChara.keys()) usedCharas.add(c);
  }
  for (const { like } of commonByFixture.values()) {
    for (const c of like) usedCharas.add(c);
  }

  const characters = [];
  for (const c of src.gameCharacters ?? []) {
    const id = toId(c?.id);
    if (id == null || !usedCharas.has(id)) continue;
    const name = fullName(c);
    // ★ 所属ユニットは gameCharacters の unit を使う（gameCharacterUnits ではない）。
    //   あちらは「そのキャラが出演しうるユニット」の一覧で、ミクは6つ持つ。
    //   選択肢をユニットで束ねたいので、ここでは本籍にあたる1つを取る。
    if (!name) continue;
    characters.push({
      id,
      name,
      unit: typeof c.unit === "string" ? c.unit : "",
      // 顔ぶれを名前で並べるとすぐ溢れるので、色と1文字で示す。
      // ★ メンバーカラーはキャラごとに1つで、所属ユニットでは変わらない（実測確認）。
      color: charaColor.get(id) ?? "",
      // givenName の1文字目。26人で重複しないことを確認済み。
      initial: typeof c.givenName === "string" && c.givenName ? c.givenName[0] : name[0],
    });
  }
  characters.sort((a, b) => a.id - b.id);

  // 設置場所・向き・種別は語彙が固定なので、文字列を毎行持たずに辞書の添字で持つ。
  // 1518行 × 3項目ぶんの文字列が消える（実測で 70KB → 20KB 弱）。
  const siteVocab = [];
  const layoutVocab = [];
  const typeVocab = [];
  const intern = (vocab, value) => {
    if (typeof value !== "string" || !value) return undefined;
    let i = vocab.indexOf(value);
    if (i < 0) i = vocab.push(value) - 1;
    return i;
  };

  const fixtures = [];
  for (const f of src.mysekaiFixtures ?? []) {
    const id = toId(f?.id);
    if (id == null || typeof f.name !== "string" || !f.name) continue;

    const talk = talkByFixture.get(id);
    const common = commonByFixture.get(id);
    const bp = blueprintByFixture.get(id);
    const size = f.gridSize ?? {};

    // ★ 空の項目は**キーごと落とす**（JSON.stringify は undefined を出力しない）。
    //   反応を持たない家具が1,062件あり、そこに空配列と 0 を並べると 1518行ぶんの
    //   無駄が乗る。読む側は「無ければ既定値」で扱うこと（types.ts の normalize が担当）。
    const entry = {
      id,
      name: f.name,
      // 読みは名前検索の補助。名前と同じなら持たない。
      pr: typeof f.pronunciation === "string" && f.pronunciation !== f.name ? f.pronunciation : undefined,
      ty: intern(typeVocab, f.mysekaiFixtureType),
      mg: toId(f.mysekaiFixtureMainGenreId) ?? undefined,
      sg: toId(f.mysekaiFixtureSubGenreId) ?? undefined,
      // 幅・奥行き・高さ。キー名を3つ持つより配列の方が軽い。
      sz: [toId(size.width) ?? 0, toId(size.depth) ?? 0, toId(size.height) ?? 0],
      st: intern(siteVocab, f.mysekaiSettableSiteType),
      ly: intern(layoutVocab, f.mysekaiSettableLayoutType),
      co: toId(f.firstPutCost) ?? undefined,
      /**
       * サムネイル画像のファイル名（拡張子なし）。
       * ★ 配信元のパスは家具種別で2系統に分かれる（sekai-viewer の mysekaiFixtureUtils.ts が正本）:
       *     通常          … mysekai/thumbnail/fixture/{ab}_1.webp
       *     surface_appearance … mysekai/thumbnail/surface_appearance/{ab}/tex_{ab}_{layout}_1.png
       *   画像は取得スクリプトが落として自前配信するので、画面はこの名前だけ見ればよい。
       */
      im: typeof f.assetbundleName === "string" && f.assetbundleName ? f.assetbundleName : undefined,
      // 設計図が無い家具（イベント配布の固定設置物など）は落とす。false（模写不可）とは別物。
      sk: bp ? Boolean(bp.isEnableSketch) : undefined,
      ac: f.isGameCharacterAction ? 1 : undefined,
      tc: talk && talk.perChara.size ? sortedIds(new Set(talk.perChara.keys())) : undefined,
      // tc と同じ並びで、そのキャラが登場する会話の本数。
      tk:
        talk && talk.perChara.size
          ? sortedIds(new Set(talk.perChara.keys())).map((c) => talk.perChara.get(c).total)
          : undefined,
      // 同じ並びで、そのうち**ひとりで喋る**会話の本数。
      // これが 0 なら、その子ひとりを訪ねても何も起きない（誰かと一緒に居る必要がある）。
      ts:
        talk && talk.perChara.size
          ? sortedIds(new Set(talk.perChara.keys())).map((c) => talk.perChara.get(c).solo)
          : undefined,
      tn: talk && talk.count ? talk.count : undefined,
      /** その家具で会話する最大人数（2以上なら複数人で集まる会話がある）。 */
      tp: talk && talk.maxParty > 1 ? talk.maxParty : undefined,
      /**
       * 会話が発生する顔ぶれの組み合わせ（キャラIDの配列の配列）。
       * 人数の少ない順・ID順に並べる（画面がソロから見せられるように）。
       */
      pt:
        talk && talk.parties.size
          ? [...talk.parties]
              .map((s) => s.split(",").map(Number))
              .sort((a, b) => a.length - b.length || a[0] - b[0])
          : undefined,
      lc: common && common.like.size ? sortedIds(common.like) : undefined,
      /**
       * ★ normal（無関心）は**出力しない**。
       *   当初は好みと一緒に持っていたが、キャラ絞り込みに混ぜたところ
       *   26人の結果集合がほぼ同一になった（実測 Jaccard 0.957・上位10件が全員一致）。
       *   normal は「特に好きでも嫌いでもない」という印で関心の証拠ではないため、
       *   一覧に出す価値が無いわりに絞り込みを壊す。持たないのが正しい。
       */
    };
    // undefined を入れただけではキーが残る（JSON には出ないが、オブジェクトには存在する）。
    // 読む側が Object.keys で数えたときに実態とずれるので、ここで消しておく。
    for (const k of Object.keys(entry)) {
      if (entry[k] === undefined) delete entry[k];
    }
    fixtures.push(entry);
  }

  // 家具が1件も属さないジャンルは選択肢に出しても必ず0件になるので落とす
  // （マスタは「バーチャル・シンガー」等のユニット名を含むが、家具は誰も参照していない）。
  const usedMainGenres = new Set(fixtures.map((f) => f.mg).filter((v) => v != null));
  const mainGenres = genreList(src.mysekaiFixtureMainGenres).filter((g) =>
    usedMainGenres.has(g.id)
  );

  return {
    generatedAt: new Date(now).toISOString(),
    characters,
    genres: { main: mainGenres },
    vocab: { site: siteVocab, layout: layoutVocab, type: typeVocab },
    /**
     * 好みが複数ユニットぶんの定義から合成されたキャラ（charaId → 元になった定義の数）。
     * 画面はこれを見て「セカイによって好みが違う」と注記する。実データではミクだけ。
     */
    multiUnitLikes: Object.fromEntries(multiUnit),
    /** AND 条件を OR として展開している件数（0 でないなら結合の見直しが要る）。 */
    multiFixtureConditionGroups: countMultiFixtureGroups(conditionGroupToFixtures),
    fixtures,
  };
}

/**
 * 出力の要約。件数が想定から大きくずれた回に気づくためのもの。
 *
 * ★ 未公開データの検算（deriveCardData.mjs の auditLeaks）はこの表では書けないので、
 *   代わりにこれをログへ出す。新家具が一度に大量に増えた回は、実装前のマスタが
 *   先行して入った可能性があるので目視で確かめる。
 */
export function summarize(out) {
  const hasLike = (f) => Boolean(f.lc?.length);
  const reactive = out.fixtures.filter((f) => f.tn || f.ac || hasLike(f));
  return {
    fixtures: out.fixtures.length,
    characters: out.characters.length,
    withTalk: out.fixtures.filter((f) => f.tn).length,
    withAction: out.fixtures.filter((f) => f.ac).length,
    withCommon: out.fixtures.filter(hasLike).length,
    reactive: reactive.length,
    talks: out.fixtures.reduce((a, f) => a + (f.tn ?? 0), 0),
    sketchable: out.fixtures.filter((f) => f.sk === true).length,
  };
}
