/**
 * サイトそのものの事実を1か所に置く。
 *
 * 名前・窓口・URL は規約／ポリシー／フッター／404 と散らばる場所で使われる。
 * 各所に直書きすると、X のアカウントを変えたときに古い窓口が規約にだけ
 * 残る、という形で必ず食い違う。窓口が古いのは規約としては嘘なので、
 * 書く場所は1つに固定する。
 */

/** 正式名称。URL の「sekaimaster」やリポジトリ名「AssistTools」も同じサイトを指す（利用規約 第1条）。 */
export const SITE_NAME = "Sekai-Master";

export const SITE_URL = "https://sekaimaster.pages.dev";

/**
 * 運営者の名義。本名は出さない。
 *
 * ★ 「@」を付けない。ここは著作権表記に使う**名義**であって、ハンドル名ではない。
 *   @ を付けると読み手はアカウント名だと受け取るので、実在のハンドル
 *  （OWNER_X_HANDLE）と食い違ったまま出すと、それ自体が小さな嘘になる。
 */
export const OWNER_NAME = "Noritake";

/**
 * 運営者個人の X。**問い合わせ窓口ではない**。
 * 規約・ポリシーに載せるのは「誰が運営しているか」を辿れるようにするためだけ。
 * 連絡先は下の公式アカウントと GitHub Issues。
 */
export const OWNER_X_HANDLE = "@YesNoritake";
export const OWNER_X_URL = "https://x.com/YesNoritake";

/** 公式 X。問い合わせ窓口であり、更新の告知先でもある（docs/x-operations.md）。 */
export const X_HANDLE = "@pj_Sekai_master";
export const X_URL = "https://x.com/pj_Sekai_master";

export const REPO_URL = "https://github.com/Sekai-Master/AssistTools";
export const ISSUES_URL = `${REPO_URL}/issues`;

/** 著作権表記の開始年。旧版（vanilla HTML/CSS/JS）の公開年。 */
export const COPYRIGHT_SINCE = 2024;

/** 利用規約・プライバシーポリシーの施行日と最終改訂日。改訂したらここを更新する。 */
export const LEGAL_EFFECTIVE_DATE = "2026-08-04";
export const LEGAL_REVISED_DATE = "2026-08-04";
