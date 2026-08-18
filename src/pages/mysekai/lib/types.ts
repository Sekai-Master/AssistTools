/**
 * マイセカイ家具データの型と正規化。
 *
 * 配信ファイル（public/MysekaiDatas/fixtures.json）は転送量を優先して
 * キーを短く・空の項目を落としてある（生成は scripts/lib/deriveMysekaiData.mjs）。
 * 画面側でそれを毎回気にするのは事故のもとなので、読み込み時にここで正規化して
 * 「無ければ既定値」を1箇所に閉じ込める。
 *
 * ★ 外部由来のデータは1件ずつ検証する（配信物とはいえ、生成側の事故を黙って通さない）。
 *   既存フックと同じ作法（useRankingMusics.ts / useCardData.ts）。
 */

/**
 * 反応の種類。**キャラとの関係だけ**を並べる。
 * ★ 「キャラが使うモーションがある」は家具そのものの属性で、誰が動くかのデータを
 *   持たない。ここに混ぜると粒度が食い違うので入れない（FilterState.actionOnly を使う）。
 */
export type ReactionKind = "talk" | "like";

export interface MysekaiCharacter {
  id: number;
  name: string;
  /** 所属ユニット（マスタの unit。light_sound / piapro など）。選択肢の見出しに使う。 */
  unit: string;
  /** メンバーカラー（#rrggbb）。顔ぶれを名前で並べると溢れるので色で示す。 */
  color: string;
  /** 名前の1文字目。26人で重複しない。 */
  initial: string;
}

/**
 * マスタの unit → 表示名。
 * ★ src/lib/units.ts の UnitKey（vs/ln/…）とは別の語彙。あちらはページのテーマ色用で、
 *   こちらはマスタが持つ内部名。混ぜないこと。
 */
export const UNIT_NAME: Record<string, string> = {
  piapro: "VIRTUAL SINGER",
  light_sound: "Leo/need",
  idol: "MORE MORE JUMP!",
  street: "Vivid BAD SQUAD",
  theme_park: "ワンダーランズ×ショウタイム",
  school_refusal: "25時、ナイトコードで。",
};

/** 選択肢に出す並び。ゲーム内のユニット順に合わせる。 */
export const UNIT_ORDER = [
  "light_sound",
  "idol",
  "street",
  "theme_park",
  "school_refusal",
  "piapro",
];

export interface Genre {
  id: number;
  name: string;
}

export interface Fixture {
  id: number;
  name: string;
  /** 読み。名前と同じ場合は配信データに無いので、名前で埋める。 */
  reading: string;
  /** 家具種別（normal / system / plant など）。 */
  type: string;
  mainGenreId: number | null;
  /** 幅・奥行き・高さ。 */
  size: [number, number, number];
  /** 設置できる場所（room / home / any）。 */
  site: string;
  /** 設置の向き（floor / wall / rug など）。 */
  layout: string;
  cost: number | null;
  /** サムネイルのファイル名（拡張子なし）。URL の組み立ては lib/thumb.ts。 */
  image: string;
  /**
   * 模写できるか。**null は「設計図が存在しない家具」**で、false（模写不可）とは別物。
   * 他人のマイセカイへ取りに行けるかの判断に使うので、混ぜてはいけない。
   */
  sketch: boolean | null;
  /**
   * ゲーム内（キャラクターランクの家具一覧）の並び順。
   * これで並べると実機の画面と同じ順になり、回収の消し込みがそのまま照合になる。
   */
  seq: number | null;
  /**
   * A: この家具がキャラのアクション対象になりうる（`isGameCharacterAction`）。
   * ★ これは**家具の印**で、誰が使うかは持たない。誰が使うかは `actionChars`。
   *   実測で両者は一致しない（フラグ182件 / データ84件、食い違い120+22件）。
   */
  action: boolean;
  /**
   * A: その家具を実際に使うキャラ（会話を伴わないアクション）。
   * 会話を伴うアクション（座って喋る等）は `talkChars` 側に出るので、
   * 「誰が使うか」を出すときは両方を合わせる。
   */
  actionChars: number[];
  /** B: 固有会話に登場するキャラ（グループ会話の参加者も全員含む）。 */
  talkChars: number[];
  /** B: 家具全体の会話パターン数。キャラを選んでいる画面でこれを出すと実数の19倍になる。 */
  talkCount: number;
  /** B: キャラID → そのキャラが登場する会話の本数。 */
  talkCountBy: Map<number, number>;
  /**
   * B: キャラID → そのうち**ひとりで喋る**会話の本数。
   * 0 なら、その子ひとりを訪ねても何も起きない（誰かと一緒に居る必要がある）。
   * ユニットのソファなど16件は全員がこれに当たる。
   */
  talkSoloBy: Map<number, number>;
  /** B: その家具で会話する最大人数（2以上なら複数人で集まる会話がある）。 */
  maxParty: number;
  /**
   * B: 会話が発生する顔ぶれの組み合わせ。人数の少ない順。
   * 「司ひとり」と「司＋類」は別の条件なので、揃えないと始まらない組が分かる。
   */
  parties: number[][];
  /** C: この家具を特に好むキャラ（positive のみ。normal は持たない）。 */
  likeChars: number[];
  /** 何らかの反応を持つか（既定の絞り込みで使う）。 */
  reactive: boolean;
  /**
   * 絞り込み用。会話に出るか好むキャラ。
   * ★ **normal（無関心）を混ぜてはいけない。** 混ぜたら26人の結果がほぼ同一になった
   *   （実測 Jaccard 0.957・上位10件が全員一致）。生成側でも出力していない。
   */
  charSet: Set<number>;
}

export interface MysekaiData {
  generatedAt: string;
  characters: MysekaiCharacter[];
  /** 家具が実際に属するジャンルだけ（選んでも0件になる選択肢は生成側で落としてある）。 */
  mainGenres: Genre[];
  /**
   * 好みが複数ユニットぶんの定義から合成されたキャラ（charaId → 元の定義数）。
   * 実データではミクだけが該当し、5つのセカイぶんの好みが1つに混ざっている。
   */
  multiUnitLikes: Map<number, number>;
  /**
   * 中身が同じ会話を持つ (顔ぶれ × 家具) の組。片方を見たら他も見たことになる。
   * ★ **会話集合が完全に一致する組だけ**が入っている。共通会話を1つ持つだけの
   *   家具（ソファ類など）を混ぜると、見ていない固有会話まで既読になるため。
   */
  talkLinks: TalkLink[];
  fixtures: Fixture[];
}

/** 中身が同じ会話を共有する家具の組。 */
export interface TalkLink {
  /** 顔ぶれ（キャラIDの昇順）。 */
  party: number[];
  /** その顔ぶれで同じ会話が起きる家具のID。 */
  fixtures: number[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** キャラIDの配列。数値以外が混じっていたら落とす（絞り込みの取りこぼしより誤検出が困る）。 */
function charIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isNum);
}

function pickVocab(vocab: unknown, index: unknown): string {
  if (!Array.isArray(vocab) || !isNum(index)) return "";
  const word = vocab[index];
  return isStr(word) ? word : "";
}

function parseGenres(v: unknown): Genre[] {
  if (!Array.isArray(v)) return [];
  const out: Genre[] = [];
  for (const g of v) {
    if (!g || typeof g !== "object") continue;
    const { id, name } = g as { id?: unknown; name?: unknown };
    if (isNum(id) && isStr(name)) out.push({ id, name });
  }
  return out;
}

/**
 * 配信データを画面で使う形に直す。壊れた要素は捨て、読めた分だけ返す。
 * 家具が1件も読めなければ呼び出し側がエラーにする（0件表示で黙らせない）。
 */
export function normalize(raw: unknown): MysekaiData {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const vocabRoot = (root.vocab && typeof root.vocab === "object" ? root.vocab : {}) as Record<
    string,
    unknown
  >;
  const genresRoot = (root.genres && typeof root.genres === "object" ? root.genres : {}) as Record<
    string,
    unknown
  >;

  const characters: MysekaiCharacter[] = [];
  if (Array.isArray(root.characters)) {
    for (const c of root.characters) {
      if (!c || typeof c !== "object") continue;
      const { id, name, unit, color, initial } = c as Record<string, unknown>;
      if (isNum(id) && isStr(name)) {
        characters.push({
          id,
          name,
          unit: isStr(unit) ? unit : "",
          // 色が壊れていたら塗らない（不正な値を style に流し込まない）。
          color: isStr(color) && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "",
          initial: isStr(initial) ? initial.slice(0, 1) : name.slice(0, 1),
        });
      }
    }
  }

  const fixtures: Fixture[] = [];
  const seenIds = new Set<number>();
  if (Array.isArray(root.fixtures)) {
    for (const item of root.fixtures) {
      if (!item || typeof item !== "object") continue;
      const f = item as Record<string, unknown>;
      if (!isNum(f.id) || !isStr(f.name)) continue;
      // 同じ id が2度来ると React の key が衝突する。先に出た方を採る。
      if (seenIds.has(f.id)) continue;
      seenIds.add(f.id);

      const talkChars = charIds(f.tc);
      const likeChars = charIds(f.lc);
      const actionChars = charIds(f.aa);
      const talkCount = isNum(f.tn) ? f.tn : 0;
      const action = f.ac === 1 || f.ac === true;
      const size =
        Array.isArray(f.sz) && f.sz.length === 3 && f.sz.every(isNum)
          ? ([f.sz[0], f.sz[1], f.sz[2]] as [number, number, number])
          : ([0, 0, 0] as [number, number, number]);

      // tc と同じ並びで本数が入っている。欠けていたら 0 ではなく「不明」にせず、
      // 少なくとも1本はあるものとして 1 を置く（会話に登場している事実は tc が示している）。
      const counts = Array.isArray(f.tk) ? f.tk : [];
      const solos = Array.isArray(f.ts) ? f.ts : [];
      const talkCountBy = new Map<number, number>();
      const talkSoloBy = new Map<number, number>();
      talkChars.forEach((c, i) => {
        const n = counts[i];
        talkCountBy.set(c, isNum(n) && n > 0 ? n : 1);
        const s = solos[i];
        talkSoloBy.set(c, isNum(s) && s >= 0 ? s : 0);
      });

      fixtures.push({
        id: f.id,
        name: f.name,
        reading: isStr(f.pr) ? f.pr : f.name,
        type: pickVocab(vocabRoot.type, f.ty),
        mainGenreId: isNum(f.mg) ? f.mg : null,
        size,
        site: pickVocab(vocabRoot.site, f.st),
        layout: pickVocab(vocabRoot.layout, f.ly),
        cost: isNum(f.co) ? f.co : null,
        // 画像はファイル名だけ持ち、パスの組み立ては lib/thumb.ts に閉じる。
        image: isStr(f.im) ? f.im : "",
        sketch: typeof f.sk === "boolean" ? f.sk : null,
        seq: isNum(f.sq) ? f.sq : null,
        action,
        talkChars,
        actionChars,
        talkCount,
        talkCountBy,
        talkSoloBy,
        maxParty: isNum(f.tp) ? f.tp : 1,
        parties: Array.isArray(f.pt)
          ? f.pt.filter((p): p is number[] => Array.isArray(p) && p.length > 0 && p.every(isNum))
          : [],
        likeChars,
        reactive: talkCount > 0 || action || likeChars.length > 0 || actionChars.length > 0,
        // 絞り込み用。会話・お気に入り・アクションのいずれかで名前が出るキャラ。
        charSet: new Set([...talkChars, ...likeChars, ...actionChars]),
      });
    }
  }

  const multiUnitLikes = new Map<number, number>();
  if (root.multiUnitLikes && typeof root.multiUnitLikes === "object") {
    for (const [k, v] of Object.entries(root.multiUnitLikes as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && isNum(v)) multiUnitLikes.set(id, v);
    }
  }

  return {
    generatedAt: isStr(root.generatedAt) ? root.generatedAt : "",
    characters,
    mainGenres: parseGenres(genresRoot.main),
    multiUnitLikes,
    talkLinks: Array.isArray(root.talkLinks)
      ? (root.talkLinks as unknown[])
          .map((l) => {
            const o = l as { p?: unknown; f?: unknown };
            const party = Array.isArray(o.p) ? o.p.filter(isNum) : [];
            const fixtures = Array.isArray(o.f) ? o.f.filter(isNum) : [];
            // 家具が2件未満の組は連動のしようが無い（壊れた入力として捨てる）。
            return party.length > 0 && fixtures.length > 1 ? { party, fixtures } : null;
          })
          .filter((l): l is TalkLink => l !== null)
      : [],
    fixtures,
  };
}
