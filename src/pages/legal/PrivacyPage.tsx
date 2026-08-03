import { ToolPage } from "../../components/ui/ToolPage";
import { DocIntro, DocLink, DocList, DocMeta, DocSection } from "./LegalDoc";
import { STORED_ITEMS } from "../settings/lib/storedItems";
import {
  ISSUES_URL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_REVISED_DATE,
  OWNER_NAME,
  OWNER_X_HANDLE,
  OWNER_X_URL,
  SITE_NAME,
  X_HANDLE,
  X_URL,
} from "../../lib/site";

/**
 * プライバシーポリシー。
 *
 * ★ 保存する項目の一覧は **StoredItems の台帳から生成している**（手で並べない）。
 *   保存キーを増やしたときに設定画面には出るがポリシーには出ない、という
 *   食い違いが起きると、ポリシーが嘘になる。台帳を正本にすれば構造的に起きない。
 *
 * ★ 事実だけ書く。「大切に扱います」のような態度表明は、検証できないので入れない。
 */
export default function PrivacyPage() {
  return (
    <ToolPage unit="mmj" title="プライバシーポリシー" icon="lock">
      <DocMeta effective={LEGAL_EFFECTIVE_DATE} revised={LEGAL_REVISED_DATE} />

      <DocIntro>
        {OWNER_NAME}（X: <DocLink href={OWNER_X_URL}>{OWNER_X_HANDLE}</DocLink>
        。以下「運営者」）が個人で運営する {SITE_NAME}
        （以下「本サイト」）における、利用者の情報の取り扱いについて説明します。
      </DocIntro>

      <div className="space-y-6">
        <DocSection title="1. 基本方針">
          <p>
            <strong>本サイトは、利用者の情報を保存するサーバーを持っていません。</strong>
            すべての計算はお使いのブラウザの中だけで完結します。ツールに入力した数値・編成・募集文などが運営者に送られることはありません。
          </p>
          <p>
            したがって、氏名・メールアドレス・ゲーム内 ID
            といった個人を特定できる情報を、運営者が取得することはありません。
            ログイン機能も、そのための情報の入力欄もありません。
          </p>
        </DocSection>

        <DocSection title="2. ブラウザに保存される情報">
          <p>
            入力内容や設定を次に開いたときにも使えるよう、ブラウザのローカルストレージに保存しています。
            保存先はお使いの端末の中だけで、外部には送信されません。保存しているのは次の項目です。
          </p>
          {/* ★ 表にしない。項目名と説明の2列は、スマホ幅だと必ず横スクロールになる。
              読むためだけのページで横スクロールを出すのは、読ませる気が無いのと同じ。
              定義リストなら狭い画面では縦に積み、広い画面では2列に見える。 */}
          <dl className="border-y border-[color:var(--neu-edge)] divide-y divide-[color:var(--neu-edge)]/60">
            {STORED_ITEMS.map((item) => (
              <div key={item.key} className="grid gap-0.5 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="font-bold text-slate-700">{item.label}</dt>
                <dd className="text-slate-600">{item.note}</dd>
              </div>
            ))}
          </dl>
          <p>
            これらは <DocLink href="/settings">設定</DocLink>{" "}
            の画面からいつでも一覧・削除できます。同じ画面からファイルへ書き出して、別の端末へ移すこともできます。
            ブラウザのデータ消去でも同時に消えます。
          </p>
        </DocSection>

        <DocSection title="3. アクセス解析">
          <p>
            どのツールがどれくらい使われているかを把握するため、
            <strong>Cloudflare Web Analytics</strong> を使っています。
            どこを直すべきかの判断に使うためのもので、それ以外の用途では使いません。
          </p>
          <DocList>
            <li>
              Cookie を使わず、端末を横断して個人を追跡する識別子も作りません（Cloudflare
              がそのように設計・公表している方式です）。
            </li>
            <li>
              集めているのは、閲覧されたページ・リンク元・大まかな地域・ブラウザや OS
              の種類といった統計情報です。個人を特定できる形にはなりません。
            </li>
            <li>
              仕組みの詳細は{" "}
              <DocLink href="https://developers.cloudflare.com/web-analytics/">
                Cloudflare Web Analytics のドキュメント
              </DocLink>{" "}
              を参照してください。
            </li>
          </DocList>
        </DocSection>

        <DocSection title="4. アクセスログ">
          <p>
            本サイトは <DocLink href="https://pages.cloudflare.com/">Cloudflare Pages</DocLink>{" "}
            で配信しています。配信事業者である Cloudflare 社が、通信の処理・保護のために IP
            アドレスなどの接続情報を扱います。これは運営者が取得・閲覧しているものではなく、同社の
            プライバシーポリシーにしたがって扱われます。
          </p>
        </DocSection>

        <DocSection title="5. 外部サイトへの通信">
          <p>
            ページを開いただけで外部のサーバーに接続することはありません。フォント・アイコン・カード画像・楽曲データは、
            すべて本サイト自身から配信しています（第3項のアクセス解析を除きます）。
          </p>
          <p>次の場合にかぎり、利用者の操作をきっかけに外部へ移動します。</p>
          <DocList>
            <li>
              ついぼジェネレーターの投稿ボタンを押したとき。X（x.com）の投稿画面に、作成した文面を持って移動します。
              移動先での扱いは X 社のプライバシーポリシーによります。
            </li>
            <li>本サイト内のリンク（GitHub・公式 X・出典元など）を押したとき。</li>
          </DocList>
        </DocSection>

        <DocSection title="6. Cookie">
          <p>本サイトは Cookie を使用していません。広告も掲載していないため、広告目的の追跡もありません。</p>
        </DocSection>

        <DocSection title="7. 第三者への提供">
          <p>
            そもそも運営者が利用者の情報を取得していないため、第三者へ提供することはありません。
            法令にもとづく開示請求があった場合も、提供できる情報を保有していません。
          </p>
        </DocSection>

        <DocSection title="8. 年齢について">
          <p>
            本サイトは年齢を問わず利用できます。個人情報の入力を求める箇所はありませんが、
            保護者の方が内容を確認したうえで利用させることを妨げるものではありません。
          </p>
        </DocSection>

        <DocSection title="9. 本ポリシーの変更">
          <p>
            内容を変更したときは本ページを更新し、<DocLink href="/changelog">更新履歴</DocLink>
            に記載します。解析ツールの追加など、情報の扱いが変わる変更は、変更前または変更時にお知らせします。
          </p>
        </DocSection>

        <DocSection title="10. 問い合わせ">
          <p>
            この方針についての質問は、GitHub の <DocLink href={ISSUES_URL}>Issues</DocLink>{" "}
            または公式 X <DocLink href={X_URL}>{X_HANDLE}</DocLink> までお願いします。
          </p>
        </DocSection>
      </div>
    </ToolPage>
  );
}
