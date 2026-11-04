/**
 * 検索エンジンと SNS のカードに見せる、ページごとのタイトル・説明文。
 *
 * このサイトは SPA なので、何もしなければ最初に返る HTML はどのページも同じ
 * （タイトルは全部「Sekai-Master」）。中身は JavaScript が描くので、JavaScript を
 * 動かさない読み手（X のカード・Google 以外の検索エンジン）には全ページがトップに見える。
 * そこでビルドのあと、ここの定義から**ページごとの HTML を書き出す**
 * （scripts/seo/write-pages.ts。2026-11-03 Nori「SEO対策して検索に出せるようにしない？」）。
 *
 * ★ ルートを足したら、ここにも足す。seo.test.ts が App.tsx のルートと突き合わせる。
 * ★ 公開前のデータ（新しいカード・家具・イベント）はここに書かない。HTML に焼き込まれ、
 *   アプリを開かなくても読める状態になる（docs/deck-builder.md の「公式公開前は出さない」）。
 * ★ 検索語（2026-11-03 Nori 指定）: プロセカ ボーダー予測／編成／ついぼ／ポ調／
 *   ポイント調整／基礎点／ボーダー。言葉を詰め込まず、説明として自然に入る所にだけ入れる。
 */
import { SITE_ALT_NAMES, SITE_NAME, SITE_NAME_KANA, SITE_URL } from "./lib/site.ts";

export interface PageMeta {
  /** <title>。サイト名は付けない（renderHead が付ける）。 */
  title: string;
  description: string;
  /** 検索結果に出さない（設定・404）。 */
  noindex?: boolean;
}

/** パス → タイトル・説明文。並びはハブ（tools.ts）の順。 */
export const PAGES: Record<string, PageMeta> = {
  "/": {
    title: "プロセカのイベラン支援ツール集",
    description:
      "プロセカ（プロジェクトセカイ）のイベントランを支えるツール集。ボーダー予測、ポイント調整（ポ調）、編成ビルダー、効率曲ランキング、協力ライブ募集のついぼ作成など。",
  },
  "/deck": {
    title: "編成ビルダー｜プロセカのイベントボーナスと総合力",
    description:
      "プロセカのカード5枚のイベントボーナスと総合力を出します。ボーナスを落として総合力を盛った方が勝つ場合があるので、編成を並べて最終ポイントで比べられます。",
  },
  "/compare": {
    title: "編成かんたん比較｜プロセカの編成ごとのイベントポイント",
    description:
      "総合力・イベントボーナス・スキル（リーダーと内部値）を入れるだけで、プロセカの編成ごとの1回のイベントポイントを比べます。カードを組まずに、ゲームの画面の数字だけで比べられます。",
  },
  "/evc": {
    title: "スキル実効値計算機｜プロセカ",
    description: "プロセカの編成のスキル効果の実効値を計算できます。",
  },
  "/plan": {
    title: "周回プラン｜プロセカのイベントの到達ポイントと時刻",
    description:
      "プロセカのイベントで、現在ポイントを起点に焚き数×時間の稼働枠を積み、累積の到達ポイントと到達時刻を見積もります。",
  },
  "/worktime": {
    title: "必要稼働時間計算｜プロセカのイベントポイント逆算",
    description:
      "焚き数・稼働時間・編成ボーナスから、プロセカのイベントの到達ポイントを計算します。目標ポイントからの逆算と必要なライボも出します。",
  },
  "/refresh": {
    title: "リフレッシュゲージ計算機｜プロセカ",
    description:
      "プロセカのリフレッシュゲージが100%になるまで何分か、いまのペースで持つかを確認します。プレイ・休憩・マイセカイを積んで推移も計画できます。",
  },
  "/border": {
    title: "ボーダー予測｜プロセカのイベントの最終ボーダー",
    description:
      "プロセカの開催中のイベントの50〜2000位の最終ボーダーを、過去のイベントの伸び方から予測します。8割の確率で収まる幅と、終わったあとの答え合わせも載せています。",
  },
  "/ranking": {
    title: "効率曲ランキング｜プロセカのイベント周回の効率曲",
    description:
      "プロセカの効率曲を、手動周回・オート周回・チャレンジライブの3つで順位表示します。総合力とボーナスを入れると自分用の順位になります。",
  },
  "/lap": {
    title: "周回ラップ計測｜プロセカの1周の秒数と周/時",
    description:
      "プロセカの周回で1周終わるたびに押すだけで、実際のラップ・オーバーヘッド・周/時を測ります。休憩や部屋落ちは中断ボタンで平均から外れます。",
  },
  "/analyzer": {
    title: "ポイント調整アナライザー（ポ調）｜プロセカ",
    description:
      "プロセカのイベントで目標のポイントにぴったり着地させる、ポイント調整（ポ調）の方法を探します。曲の基礎点とイベントボーナスから、叩く曲と回数の組み合わせを出します。",
  },
  "/bingo": {
    title: "BINGOカードジェネレーター｜プロセカのチアフルカーニバル",
    description: "プロセカのチアフルカーニバル用のBINGOカードを生成できます。",
  },
  "/border/history": {
    title: "歴代ボーダー｜プロセカの過去イベントの最終ボーダー",
    description:
      "プロセカの終わったイベントの最終ボーダーを全部の回と比べます。終値・1日あたり（日速）・同じ長さの回の3つの並べ方で、その回が歴代何位だったかが分かります。",
  },
  "/tweet": {
    title: "ついぼジェネレーター｜プロセカの協力ライブ募集ツイート",
    description:
      "プロセカの協力ライブの募集ツイート（ついぼ）を簡単に作れます。",
  },
  "/mysekai": {
    title: "マイセカイ リアクション図鑑｜プロセカ",
    description:
      "プロセカのマイセカイで、キャラが反応する家具をキャラ別に一覧できます。まだ設計図を持っていない家具や、他人のセカイへ模写しに行く候補も探せます。",
  },
  "/knowledge": {
    title: "知見ノート｜プロセカの計算式・仕様",
    description:
      "プロセカの計算式・仕様・通例のうち、公式にもゲーム内にも書かれていないものを、どこまで確かめられているかと一緒に置いています。",
  },
  "/changelog": {
    title: "更新履歴",
    description: `${SITE_NAME} の更新履歴。`,
  },
  "/terms": {
    title: "利用規約",
    description: `${SITE_NAME} の利用規約。`,
  },
  "/privacy": {
    title: "プライバシーポリシー",
    description: `${SITE_NAME} のプライバシーポリシー。`,
  },
  "/settings": {
    title: "設定",
    description: `${SITE_NAME} の表示と演出の設定。`,
    noindex: true,
  },
};

/** 404 のページ。存在しない URL に Cloudflare Pages が 404 の状態で返す。 */
export const NOT_FOUND: PageMeta = {
  title: "ページが見つかりません",
  description: `${SITE_NAME} にこのページはありません。`,
  noindex: true,
};

/** ブラウザのタブに出す文字列。トップだけはサイト名を先に出す。 */
export function docTitle(path: string, meta: PageMeta): string {
  return path === "/" ? `${SITE_NAME}（${SITE_NAME_KANA}）｜${meta.title}` : `${meta.title}｜${SITE_NAME}`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * index.html の <head> を、そのページのものに差し替える。
 * 元の title・description・og:* は消してから足す（二重に残すと、どちらを使うかは読み手次第になる）。
 */
export function renderHead(html: string, path: string, meta: PageMeta): string {
  const url = SITE_URL + (path === "/" ? "/" : path);
  const title = escapeHtml(docTitle(path, meta));
  const desc = escapeHtml(meta.description);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    meta.noindex ? `<meta name="robots" content="noindex" />` : `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:url" content="${url}" />`,
    // X のカードは相対パスの画像を読まない
    `<meta property="og:image" content="${SITE_URL}/images/icon.png" />`,
    `<meta name="twitter:card" content="summary" />`,
    // サイト名。無いと Google は pages.dev のサイト名（Cloudflare）を代わりに出す（2026-11-04 の検索結果）。
    // Google はトップの WebSite 構造化データをいちばん重く見る（developers.google.com/search/docs/appearance/site-names）
    ...(path === "/" ? [`<script type="application/ld+json">${websiteJsonLd()}</script>`] : []),
  ].join("\n    ");
  if (!/<title>/.test(html) || !/<meta name="description"/.test(html) || !/<meta name="viewport"/.test(html)) {
    throw new Error("index.html の <head> を読めない（title・description・viewport が無い）");
  }
  // 同じ HTML に2回かけても重ならないよう、自分が足すものは全部消してから足す
  const stripped = html
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta name="(description|robots|twitter:[^"]+)"[^>]*>/g, "")
    .replace(/\s*<meta property="og:[^"]+"[^>]*>/g, "")
    .replace(/\s*<link rel="canonical"[^>]*>/g, "")
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
  // 関数で渡す（文字列だと説明文の「$&」などが置換の記号として化ける）
  return stripped.replace(/<meta name="viewport"[^>]*>/, (m) => `${m}\n    ${tags}`);
}

/** トップに置く WebSite の構造化データ。値に「<」は入らないので、JSON のまま埋めてよい */
export function websiteJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: [...SITE_ALT_NAMES],
    url: `${SITE_URL}/`,
  });
}

/** 知見ノート1本の、検索向けの情報。 */
export interface KnowledgeMeta {
  slug: string;
  title: string;
  description: string;
  /** 「最終更新」（YYYY-MM-DD）。読めなければ空。 */
  updated: string;
}

/** Markdown の行内の記法を外して、地の文にする。 */
function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 長い説明文は120字で切る（検索結果の抜粋はそれより短い）。 */
function clip(s: string, max = 120): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * docs/knowledge/*.md の1本から、タイトル・説明文・最終更新を取る。
 * 書式は src/pages/knowledge/lib/entry.ts と同じ（# タイトル → 見出しの箇条書き → 本文）。
 * 説明文は本文の最初の段落（見出し・表・箇条書きは飛ばす）。
 */
export function knowledgeMeta(slug: string, src: string): KnowledgeMeta {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const title = (lines.find((l) => /^#\s+/.test(l)) ?? "").replace(/^#\s+/, "").trim() || slug;
  const updated = /\*\*最終更新\*\*\s*[:：]\s*(\d{4}-\d{2}-\d{2})/.exec(src)?.[1] ?? "";
  const para: string[] = [];
  let inBody = false;
  for (const l of lines) {
    if (!inBody) {
      // 見出しの箇条書きのあと、最初の ## から本文
      if (/^##\s/.test(l)) inBody = true;
      continue;
    }
    if (/^\s*$/.test(l)) {
      if (para.length) break;
      continue;
    }
    // 箇条書きの印は「- 」「* 」（空白つき）。**太字** で始まる段落は本文として拾う
    if (/^(#|\||[-*+]\s|>|```|\d+\.\s)/.test(l.trim())) {
      if (para.length) break;
      continue;
    }
    para.push(l);
  }
  const description = clip(plainText(para.join(" ")) || title);
  return { slug, title, description, updated };
}

/** sitemap.xml。noindex のページは載せない。 */
export function renderSitemap(
  pages: Record<string, PageMeta>,
  notes: KnowledgeMeta[],
): string {
  const urls = [
    ...Object.entries(pages)
      .filter(([, m]) => !m.noindex)
      .map(([path]) => ({ loc: SITE_URL + path, lastmod: "" })),
    ...notes.map((n) => ({ loc: `${SITE_URL}/knowledge/${n.slug}`, lastmod: n.updated })),
  ];
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderRobots(): string {
  return `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

/**
 * dist に書くファイル名。/deck → deck.html、/border/history → border/history.html。
 * Cloudflare Pages は「パスと同じ名前の HTML があれば返す」（公式 Serving Pages）。
 * deck/index.html の形は /deck/ への転送が絡むので使わない。
 */
export function htmlFileOf(path: string): string {
  return path === "/" ? "index.html" : `${path.slice(1)}.html`;
}
