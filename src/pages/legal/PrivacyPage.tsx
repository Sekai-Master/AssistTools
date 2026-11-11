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
  contactHref,
} from "../../lib/site";

const TURNSTILE_PRIVACY_URL = "https://www.cloudflare.com/turnstile-privacy-policy/";
const ANTHROPIC_PRIVACY_URL = "https://www.anthropic.com/legal/privacy";

/**
 * プライバシーポリシー。
 *
 * ★ 保存する項目の一覧は **StoredItems の台帳から生成している**（手で並べない）。
 *   保存キーを増やしたときに設定画面には出るがポリシーには出ない、という
 *   食い違いが起きると、ポリシーが嘘になる。台帳を正本にすれば構造的に起きない。
 *
 * ★ 事実だけ書く。「大切に扱います」のような態度表明は、検証できないので入れない。
 *
 * ★ 問い合わせのページ（2026-11 追加）で送った内容だけは運営者に届く。その扱いは第10項に集め、
 *   ほかの項は「問い合わせを除き」の形にしてある。項を足して番号をずらさない
 *  （規約・運用文書・コードのコメントが「第5項」などと番号で指している）。
 */
export default function PrivacyPage() {
  return (
    <ToolPage unit="vs" title="プライバシーポリシー" icon="lock">
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
            {/* 太字だけを拾い読みすると「何も保存しない」と読めるので、例外も同じ太さで並べる */}
            <strong>例外は問い合わせのページから送った内容で、これは運営者の Google のアカウントに保存します（第10項）。</strong>
          </p>
          <p>
            したがって、問い合わせのページから送った内容を除き、氏名・メールアドレス・ゲーム内 ID
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
          {/* ★ 本物の鍵ではまだ測っていない。何で確かめたかを書き、詳しくは Cloudflare の説明に任せる（第6項も同じ） */}
          <p>
            問い合わせのページで確認の部品（Cloudflare Turnstile、第5項）を読み込んだときに何が保存されるかは、Cloudflare
            の説明（<DocLink href={TURNSTILE_PRIVACY_URL}>Turnstile Privacy Addendum</DocLink>）のとおりです。2026年11月に運営者が試験用の設定で確かめたときは、Cloudflare
            の領域（challenges.cloudflare.com）のローカルストレージに値が1つ置かれました。これは上の一覧と設定の画面には出ず、ブラウザのデータ消去で消えます。
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
          <p>
            問い合わせのページでは、種類・内容・返信先の欄に初めて触れたとき（キーボードで移ったときを含みます）に、迷惑な送信を防ぐ確認の部品（
            <strong>Cloudflare Turnstile</strong>）を Cloudflare（challenges.cloudflare.com）から読み込みます。
            ページを開いただけでは読み込みません。Turnstile は、人の操作かを確かめるため、IP
            アドレス・ブラウザの情報などを Cloudflare に送ります。Cloudflare はこの情報を Turnstile
            の改良にも使います（<DocLink href={TURNSTILE_PRIVACY_URL}>Turnstile Privacy Addendum</DocLink>）。
          </p>
        </DocSection>

        <DocSection title="6. Cookie">
          <p>本サイト自身は Cookie を使用していません。広告も掲載していないため、広告目的の追跡もありません。</p>
          <p>
            問い合わせのページで読み込む確認の部品（Cloudflare Turnstile、第5項）が端末に何を保存するかは、Cloudflare
            の説明（<DocLink href={TURNSTILE_PRIVACY_URL}>Turnstile Privacy Addendum</DocLink>）のとおりです。2026年11月に運営者が試験用の設定で確かめたときは、Cookie
            は使われず、Cloudflare の領域（challenges.cloudflare.com）のローカルストレージに値が1つ置かれました。
          </p>
        </DocSection>

        <DocSection title="7. 第三者への提供">
          <p>
            問い合わせのページから送った内容を除き、運営者は利用者の情報を取得していないため、第三者へ提供することはありません。
            法令にもとづく開示請求があった場合も、問い合わせの内容のほかに提供できる情報を保有していません。
          </p>
          <p>問い合わせのページから送った内容は、保存・確認・知らせ・要約のために、次の事業者のサービスを使います（何に使うかは第10項）。</p>
          <DocList>
            <li>Google（保存。運営者の Google のアカウントのフォームとスプレッドシート）</li>
            <li>Cloudflare（確認。Turnstile による迷惑な送信の確認。送った内容は、本サイトを配信する Cloudflare を通って Google に届きます）</li>
            <li>Discord（知らせ。届いたことと種類だけ）</li>
            <li>Anthropic（要約。運営者が使う AI のアシスタント Claude）</li>
          </DocList>
          <p>これ以外には渡しません。法令にもとづく場合を除きます。</p>
        </DocSection>

        <DocSection title="8. 年齢について">
          <p>
            本サイトは年齢を問わず利用できます。個人情報の入力を求める箇所は、問い合わせのページの返信先（任意）だけです。書かなくても送れます。
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
            この方針についての質問を含め、本サイトへの連絡は{" "}
            <DocLink href={contactHref("/privacy")}>問い合わせのページ</DocLink> から送れます。GitHub の{" "}
            <DocLink href={ISSUES_URL}>Issues</DocLink> と公式 X <DocLink href={X_URL}>{X_HANDLE}</DocLink>{" "}
            でも受け付けています。
          </p>
          <p>問い合わせのページから送ったときの扱いは次のとおりです。</p>
          <DocList>
            <li>
              送った内容（種類・内容・返信先・どのページから来たか・本サイトの版）は、運営者の Google
              のアカウントのフォームとスプレッドシートに保存されます。送った内容に含まれるものは、すべて運営者に届きます（氏名やメールアドレスを内容の欄に書いた場合も同じです）。
            </li>
            <li>送るときに、迷惑な送信を防ぐため Cloudflare Turnstile が人の操作かを確かめます（第5項）。</li>
            <li>届いたことを運営者に知らせるため、種類だけを運営者の Discord に送ります。内容・返信先は送りません。</li>
            <li>
              届いた内容は、運営者と、運営者が使う AI のアシスタント（Anthropic 社の Claude）が読み、要約と振り分けに使います。AI
              のサービスに渡った分は <DocLink href={ANTHROPIC_PRIVACY_URL}>Anthropic のプライバシーポリシー</DocLink>{" "}
              に従います。
            </li>
            <li>返信先を書いてもらったときは、こちらから連絡することがあります。</li>
            <li>
              対応が済んだものは、受け付けから 1 年以内に、Google
              のフォーム・スプレッドシートと運営者のメールの下書きから消します。消してほしいときは、問い合わせのページから連絡してください。
            </li>
          </DocList>
        </DocSection>
      </div>
    </ToolPage>
  );
}
