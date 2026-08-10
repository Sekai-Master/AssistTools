/**
 * Cloudflare Web Analytics（RUM）の集計を読む。
 *
 *   npm run analytics          # 直近7日
 *   npm run analytics -- 30    # 直近30日
 *
 * ★ トークンは .env の CF_ANALYTICS_TOKEN から読む（gitignore 済み）。
 *   権限は「Account Analytics: 読み取り」だけでよい。作り方は docs/analytics.md。
 *   **このスクリプトはトークンを出力しない。** 表示するのは集計値だけ。
 *
 * ★ ビーコンのトークン（HTML に載っている site_tag）とは別物。あちらは
 *   送信専用で、読み出しには使えない。
 */
const ACCOUNT_ID = "1279ae61267ed337eb4e2cc00d07b3a2";

/**
 * ★ これは **ビーコンのトークンではない**。
 *   HTML の data-cf-beacon に載っている値（ce7867…）で絞り込むと 0 件しか返らない。
 *   GraphQL の siteTag は別の識別子で、集計結果の dimensions.siteTag から拾う。
 *   分からなくなったら、filter から siteTag を外して
 *   `dimensions { siteTag }` を取れば出てくる。
 */
const SITE_TAG = "a85d4c6ab1464efea693e3f1256ec803";
const DAYS = Number(process.argv[2] ?? 7);

const token = process.env.CF_ANALYTICS_TOKEN;
if (!token) {
  console.error(
    "CF_ANALYTICS_TOKEN が設定されていない。\n" +
      "  1. .env.example をコピーして .env を作る\n" +
      "  2. Cloudflare で「Account Analytics: 読み取り」だけのトークンを作って入れる\n" +
      "  手順は docs/analytics.md"
  );
  process.exit(1);
}

const since = new Date(Date.now() - DAYS * 86400000).toISOString();
const until = new Date().toISOString();
const filter = { siteTag: SITE_TAG, datetime_geq: since, datetime_leq: until, bot: 0 };

/** 同じ絞り込みで切り口だけ変えるので、問い合わせは組み立てて1回で送る。 */
const QUERY = `
query Stats($acc: String!, $filter: ZoneRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
  viewer {
    accounts(filter: { accountTag: $acc }) {
      total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $filter) {
        count
        sum { visits }
      }
      byDay: rumPageloadEventsAdaptiveGroups(limit: 60, filter: $filter, orderBy: [date_ASC]) {
        count
        sum { visits }
        dimensions { date }
      }
      byHour: rumPageloadEventsAdaptiveGroups(limit: 24, filter: $filter, orderBy: [count_DESC]) {
        count
        dimensions { datetimeHour }
      }
      byPath: rumPageloadEventsAdaptiveGroups(limit: 20, filter: $filter, orderBy: [count_DESC]) {
        count
        sum { visits }
        dimensions { requestPath }
      }
      byReferer: rumPageloadEventsAdaptiveGroups(limit: 12, filter: $filter, orderBy: [count_DESC]) {
        count
        dimensions { refererHost }
      }
      byDevice: rumPageloadEventsAdaptiveGroups(limit: 8, filter: $filter, orderBy: [count_DESC]) {
        count
        dimensions { deviceType }
      }
      byCountry: rumPageloadEventsAdaptiveGroups(limit: 8, filter: $filter, orderBy: [count_DESC]) {
        count
        dimensions { countryName }
      }
    }
  }
}`;

const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: QUERY, variables: { acc: ACCOUNT_ID, filter } }),
});

const json = await res.json().catch(() => null);
if (!res.ok || json?.errors) {
  const msg = JSON.stringify(json?.errors ?? { status: res.status });
  console.error(`取得に失敗した: ${msg}`);
  if (res.status === 401 || res.status === 403) {
    console.error("権限が足りない可能性が高い。トークンに「Account Analytics: 読み取り」があるか確認する。");
  }
  process.exit(1);
}

const a = json.data?.viewer?.accounts?.[0];
if (!a) {
  console.error("集計が返ってこなかった。アカウントIDかサイトの指定を確認する。");
  process.exit(1);
}

const n = (v) => (v ?? 0).toLocaleString("ja-JP");
const bar = (v, max, width = 28) => "█".repeat(Math.max(1, Math.round((v / (max || 1)) * width)));

console.log(`\n■ Sekai-Master アクセス集計（直近 ${DAYS} 日 / ボット除外）\n`);

const total = a.total?.[0];
console.log(`  ページビュー ${n(total?.count)} ／ 訪問 ${n(total?.sum?.visits)}\n`);

const section = (title, rows, label, value) => {
  if (!rows?.length) return;
  console.log(`── ${title} ──`);
  const max = Math.max(...rows.map(value));
  for (const r of rows) {
    const v = value(r);
    console.log(`  ${String(label(r)).padEnd(24).slice(0, 24)} ${String(n(v)).padStart(6)}  ${bar(v, max)}`);
  }
  console.log("");
};

section(
  "日別",
  a.byDay,
  (r) => r.dimensions.date,
  (r) => r.count
);
section(
  "時間帯（JST。告知の時刻を決める材料）",
  [...(a.byHour ?? [])].sort((x, y) => x.dimensions.datetimeHour.localeCompare(y.dimensions.datetimeHour)),
  (r) => new Date(r.dimensions.datetimeHour).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit" }),
  (r) => r.count
);
section(
  "ページ別",
  a.byPath,
  (r) => r.dimensions.requestPath,
  (r) => r.count
);
section(
  "リファラー（t.co があれば X の告知が効いている）",
  a.byReferer,
  (r) => r.dimensions.refererHost || "(直接)",
  (r) => r.count
);
section(
  "端末",
  a.byDevice,
  (r) => r.dimensions.deviceType || "(不明)",
  (r) => r.count
);
section(
  "国",
  a.byCountry,
  (r) => r.dimensions.countryName || "(不明)",
  (r) => r.count
);
