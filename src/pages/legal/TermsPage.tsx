import { ToolPage } from "../../components/ui/ToolPage";
import { DocIntro, DocLink, DocList, DocMeta, DocSection } from "./LegalDoc";
import {
  ISSUES_URL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_REVISED_DATE,
  OWNER_NAME,
  OWNER_X_HANDLE,
  OWNER_X_URL,
  REPO_URL,
  SITE_NAME,
  SITE_URL,
  X_HANDLE,
  X_URL,
} from "../../lib/site";

/**
 * 利用規約。
 *
 * ★ 書くときの原則: **できないことを約束しない**。
 *   個人が趣味で出しているサイトなので、可用性やデータの永続性を約束すると
 *   その時点で守れない規約になる。ここに書いてあるのは実際にやっていること
 *   （実測で確かめている・データは端末から出さない）と、やらないと決めたこと
 *   （個人情報を集めない）だけにしてある。
 *
 * ★ 裁判管轄はあえて書いていない。専属的合意管轄を書くと運営者の居住地が
 *   実質的に公開されるため。準拠法だけ定めれば個人サイトの規模では足りる。
 */
export default function TermsPage() {
  return (
    <ToolPage unit="vs" title="利用規約" icon="gavel">
      <DocMeta effective={LEGAL_EFFECTIVE_DATE} revised={LEGAL_REVISED_DATE} />

      <DocIntro>
        この利用規約は、{OWNER_NAME}（X: <DocLink href={OWNER_X_URL}>{OWNER_X_HANDLE}</DocLink>
        。以下「運営者」）が個人で運営する {SITE_NAME}
        （以下「本サイト」）の利用条件を定めるものです。本サイトを利用した時点で、この規約に同意したものとみなします。
      </DocIntro>

      <div className="space-y-6">
        <DocSection title="1. 本サイトについて">
          <p>
            本サイトは、スマートフォン向けゲーム「プロジェクトセカイ カラフルステージ！ feat.
            初音ミク」（以下「本ゲーム」）を遊ぶうえで役に立つ計算ツールを集めた、
            <strong>非公式のファンサイト</strong>です。
          </p>
          <p>
            株式会社セガ、Colorful Palette Inc.、クリプトン・フューチャー・メディア株式会社その他、
            本ゲームの権利者とは一切関係がありません。本サイトの内容について権利者へ問い合わせないでください。
          </p>
          <p>
            本サイトは <DocLink href={SITE_URL}>{SITE_URL.replace("https://", "")}</DocLink> で公開しています。
            「SekaiMaster」「AssistTools」といった表記も同じサイトを指します。
          </p>
        </DocSection>

        <DocSection title="2. 計算結果の正確さについて">
          <p>
            本サイトの計算は、公開されているマスターデータと運営者自身のゲーム内実測をもとに組み立てています。
            主要な計算については実測値と一致することを確認していますが、
            <strong>正確さ・完全性を保証するものではありません</strong>。
          </p>
          <p>
            本ゲームの仕様変更、データの取得元の変更、こちらの実装ミスなどにより、結果が実際と食い違うことがあります。
            計算結果をもとにした判断（イベントの走り方、時間や資源の使い方など）は、利用者ご自身の責任で行ってください。
          </p>
          <p>
            結果がおかしいと気づいたときは、下の「7. 問い合わせ」から教えてもらえると助かります。直します。
          </p>
        </DocSection>

        <DocSection title="3. 権利の帰属">
          <DocList>
            <li>
              本ゲームに関する名称・楽曲情報・カード情報・画像などの著作権その他の権利は、すべて各権利者に帰属します。
              本サイトはそれらを、本ゲームを遊ぶ人の便宜のために引用・表示しているにすぎません。
            </li>
            <li>
              本サイトが使うゲームデータは{" "}
              <DocLink href="https://github.com/Sekai-World/sekai-master-db-diff">
                Sekai-World/sekai-master-db-diff
              </DocLink>{" "}
              および <DocLink href="https://sekai.best/">sekai.best</DocLink> の公開データに由来します。
            </li>
            <li>
              本サイトのソースコードは{" "}
              <DocLink href={`${REPO_URL}/blob/main/LICENSE`}>MIT ライセンス</DocLink>{" "}
              で公開しています。ゲーム内のデータ・画像はこのライセンスの対象ではありません。
            </li>
            <li>
              権利者から削除・修正の申し入れがあった場合、運営者は本サイトの該当部分を速やかに取り下げます。
            </li>
          </DocList>
        </DocSection>

        <DocSection title="4. 利用にあたって">
          <p>本サイトは誰でも無料で使えます。会員登録は必要ありません。ただし、次のことはしないでください。</p>
          <DocList>
            <li>本サイトのサーバーに過度な負荷をかける行為（自動化された連続アクセスなど）</li>
            <li>本サイトを複製したものを、本サイトそのものであるかのように見せて公開する行為</li>
            <li>本サイトが本ゲームの公式サービスであるかのように見せかける行為、運営者になりすます行為</li>
            <li>本ゲームの利用規約に違反する目的で本サイトを使う行為</li>
            <li>法令に違反する行為、他の利用者や第三者に迷惑をかける行為</li>
          </DocList>
          <p>
            なお、ソースコードを MIT ライセンスにしたがって複製・改変・再配布することは自由です
            （上の2つ目は、それを別物として名乗らずに出すことを禁じる趣旨です）。
          </p>
          <p>
            一方で、<strong>本サイトで作ったものは自由に使ってかまいません</strong>。
            募集ツイートの文面、BINGO カード、調整プランの画像、編成の紹介カードなどを SNS
            や配信に載せるのに、許可もクレジットも要りません（クレジットを入れてもらえるのは嬉しいです）。
          </p>
        </DocSection>

        <DocSection title="5. 保存されるデータについて">
          <p>
            入力した内容や設定は、お使いのブラウザの中（ローカルストレージ）にだけ保存されます。運営者のサーバーには送られません。
            詳しくは <DocLink href="/privacy">プライバシーポリシー</DocLink> を参照してください。
          </p>
          <p>
            ブラウザの設定やデータ消去、プライベートモードでの利用、端末の変更などによって、保存した内容は失われることがあります。
            消えて困るものは、設定画面の「保存データの書き出し」でバックアップしてください。
            <strong>データの消失について運営者は責任を負いません。</strong>
          </p>
        </DocSection>

        <DocSection title="6. サービスの変更・停止と免責">
          <DocList>
            <li>
              運営者は、事前の予告なく本サイトの内容を変更し、また提供を停止・終了することがあります。
              重要な変更は <DocLink href="/changelog">更新履歴</DocLink> と公式 X（
              <DocLink href={X_URL}>{X_HANDLE}</DocLink>）でお知らせします。
            </li>
            <li>
              本サイトの利用によって利用者に生じた損害について、運営者は責任を負いません
              （運営者に故意または重過失がある場合を除きます）。
            </li>
            <li>本サイトは、常に利用できること・不具合が無いことを保証しません。</li>
          </DocList>
        </DocSection>

        <DocSection title="7. 問い合わせ">
          <p>不具合の報告・要望・その他の連絡は、次のどちらからでも受け付けています。</p>
          <DocList>
            <li>
              GitHub の <DocLink href={ISSUES_URL}>Issues</DocLink>（記録が残るので、不具合の報告はこちらが確実です）
            </li>
            <li>
              公式 X <DocLink href={X_URL}>{X_HANDLE}</DocLink> へのリプライまたは DM
            </li>
          </DocList>
          <p>
            {/* 運営者個人のアカウントを第1条に書いた以上、そちらに連絡が流れるのは避けたい。
                窓口はここだと明示しておく。 */}
            運営者個人のアカウント（{OWNER_X_HANDLE}）は窓口ではありません。本サイトについての連絡は上の2つへお願いします。
          </p>
        </DocSection>

        <DocSection title="8. 規約の変更">
          <p>
            運営者は、必要に応じてこの規約を変更することがあります。変更したときは本ページを更新し、
            <DocLink href="/changelog">更新履歴</DocLink>に記載します。変更後に本サイトを利用した時点で、変更後の規約に同意したものとみなします。
          </p>
        </DocSection>

        <DocSection title="9. 準拠法">
          <p>この規約は日本法に準拠し、日本法にしたがって解釈されます。</p>
        </DocSection>
      </div>
    </ToolPage>
  );
}
