# 移植仕様: Tweet Generator（ついぼジェネレーター）

> 現行 vanilla 実装のキャプチャ（2026-07-22 調査）。React+Vite への移植時の正本。

**目的**: プロセカの協力ライブ募集ツイート（通称「ついぼ」）の文面を、ボタン選択とテキスト入力から組み立ててリアルタイムプレビュー表示し、X（Twitter）投稿用インテントリンクを生成するツール。入力セットをlocalStorageに最大10件まで履歴保存・再利用できる。

## 挙動（再現すべき）

- 対象ファイル: tweet_generator.html(263行) / tg_script.js(527行) / tg_style.css(501行)。すべて C:\Users\masan\Documents\GitHub\AssistTools\Pages\01_Tweet_Generator\ 配下。file:line はこのパス基準。
- 「ボタン式選択」項目はsetupButtonGroup(tg_script.js:137-160)で6グループ実装: tlFlowButtons/roomButtons/songButtons/roundsButtons/remainingSlotsButtons/roomIdSymbolButtons。各グループは対応するhidden inputのvalueを保持し、クリックで.activeクラス付け替え＋updateTweetPreview()呼び出し。初期値はtg_script.js:129-134で設定: tlFlow='', room='ベテラン', song='🦐', rounds='高速周回', remainingSlots='1', roomIdSymbol='🔑'。
- setupButtonGroup内(tg_script.js:155-159)に到達不能のデッドコードあり（'showHostSkillButtons'等、実際にはHTML上に存在しないbuttonGroupIdを参照）。移植時は除外してよい。
- スキル値/内部値・自由記述の6ペア（showHostSkill/hostSkill, showHostInnerValue/hostInnerValue, showRequiredSkill/requiredSkill, showRequiredInnerValue/requiredInnerValue, showFreeDescription/freeDescription, showRecruitFreeDescription/recruitFreeDescription）はsetupInputVisibility(tg_script.js:118-126)でトグルスイッチのchangeに応じて対応inputへ.hiddenクラスを付け外しし、updateTweetPreview()を呼ぶ。初期状態: showHostSkill/showRequiredSkillのみHTML上でchecked（tweet_generator.html:102,162）、他はuncheckedかつ該当inputに最初からclass="hidden"（同116,131,142,153,176,226）。
- roomId入力(tweet_generator.html:94, maxlength=5)にはinputイベントリスナーが2つ登録されている: (1) validateNumericInput呼び出し(tg_script.js:26-28→15-24) (2) updateTweetPreview呼び出し(tg_script.js:514)。登録順どおり実行され、先にバリデーション、後にプレビュー更新となる。
- convertToHalfWidth(tg_script.js:9-13): 正規表現 /[！-～]/g で全角文字(U+FF01-FF5E)をcharCode-0xFEE0で半角化し、さらに全角スペース「　」(U+3000)を半角スペースに置換する。
- validateNumericInput(tg_script.js:15-24): 半角化後に /[^0-9]/ で数字以外が残っていればalert("数値は半角で入力してください")を出し、入力欄を空文字に全消去する（不正文字だけを除去するのではなく全消去。既定文字列を残す動作ではない点に注意）。数字のみなら半角化済みの値をセットする。
- プレビュー生成 updateTweetPreview()(tg_script.js:168-264) がツイート本文の唯一の生成ロジック。#tweetPreview のtextContentへ直接書き込む。DOMから毎回全項目を再読み込みする設計（内部状態を持たない）。
- generateTweetLink()(tg_script.js:266-283): まずupdateTweetPreview()を呼んで最新化し、`https://x.com/intent/tweet?text=${encodeURIComponent(tweetPreview.textContent)}` のURLで<a>タグ（class=tweet-button, target=_blank, テキスト'ツイートする'）を動的生成し#tweetLinkContainerへ挿入（毎回innerHTML=''でクリアしてから追加、複数リンクは蓄積しない）。
- 履歴保存 saveHistory()(tg_script.js:292-331): 全フォーム項目のスナップショット＋dateTime(`new Date().toLocaleString()`、ロケール/タイムゾーン依存で固定フォーマットではない)＋favorite:falseを1件のオブジェクトとして構築し、loadHistory()の配列先頭にunshift、`.slice(0,10)`で先頭10件に切り詰めてlocalStorageキー'history'へJSON.stringifyで上書き保存。favoriteはこの10件キャップに対して保護効果を持たない（お気に入りにしても11件目の保存で押し出されて消える）。
- displayHistory()(tg_script.js:340-376): historyList内に各履歴を<li>として再構築（毎回innerHTML=''でクリア後に再生成）。表示は`item.roomId ? item.roomIdSymbol + item.roomId : 'ルームIDなし'`、dateTime、★お気に入りボタン(active時金色 #ffd700)、再利用ボタン、削除ボタン。各ボタンのdata-indexは表示時点の配列インデックス（安定IDではない）。
- toggleFavorite/deleteHistory(tg_script.js:389-402)はindex指定で該当要素を書き換え/削除しlocalStorageへ再保存後、displayHistory()で再描画。お気に入りは配列の並び替え（先頭固定等）は一切行わない、単なる表示上のフラグ。
- reuseHistory(index)(tg_script.js:405-467): 履歴項目からボタン式選択(updateButtonGroup経由)・チェックボックス群・hidden切り替え・各inputのvalueを復元しupdateTweetPreview()を呼ぶ。tlFlow/room/song/rounds/remainingSlots/roomIdSymbol、showConditionOutside/conditionOutside、showSupporter/supporterCountの値代入は前半(410-422行)と後半(449-464行)で二重に行われている（実害はないが冗長）。値設定は.checked/.valueへの直接代入でchangeイベントは発火しないため、change専用リスナー（例: showLongSeasonなど tg_script.js:76-80）は動かないが、最後に明示的にupdateTweetPreview()を呼ぶため表示は正しく更新される。
- 全履歴削除ボタン(clearAllHistoryButton, tg_script.js:286-289)はlocalStorage.removeItem('history')してdisplayHistory()を呼ぶだけ（確認ダイアログなし）。
- 履歴欄の開閉(tg_script.js:379-386)はhistoryToggleチェックボックスのchangeイベントでhistoryContainerに.openクラスをトグルし、その都度displayHistory()を再実行（開くたびに再描画）。
- 募集主備考欄・募集備考欄の開閉(tg_script.js:42-61)は見出し(#hostRemarksHeader/#recruitRemarksHeader)クリックで対応コンテナに.openクラス、矢印スパンに.arrow-down/.arrow-upクラスをトグル。CSSのmax-height遷移で開閉アニメーション(tg_style.css:267-300)。
- プレビュー開閉ボタン(togglePreviewButton/closePreviewButton)には重複したイベントリスナーが仕込まれている: (A) window.load内のスコープ(tg_script.js:90-114)はwindow.innerWidth<768の場合のみpreviewArea.style.display（インラインスタイル）を'flex'/'none'でトグル。(B) モジュールトップレベル(tg_script.js:491-506)は幅を判定せずpreviewArea.classList.toggle('show'/'hidden')でトグル。両方とも同一クリックで発火し、ボタンtextContentも両方が独立に設定するが、実際の表示可否はインラインstyleがCSSクラスより優先されるため(A)が支配的で、(B)は視覚的には無効なほぼデッドコード（ただし両者が常に同じクリックタイミングで対になって動くため、テキストラベルの矛盾は実際には発生しない＝コード上は冗長だが観測される挙動としては壊れていない）。
- 初期表示バグ: previewエリア(class="preview")はHTML上でhiddenクラスを持たず、tg_script.js:108の初期非表示処理(`//previewArea.style.display = 'none';`)がコメントアウトされているため、モバイル幅でもページ読み込み時からプレビューがCSS既定(tg_style.css:379-399, display:flex)で画面下部に表示されてしまう。一方ボタンの初期テキストは「プレビューを表示」（隠れている前提の文言）でHTMLに固定（tweet_generator.html:240）。文言と実際の表示状態が食い違っている状態が初期状態として存在する。移植時に修正するか意図的に再現するか要判断。
- PC(≥768px)ではtogglePreviewButton自体がCSSで非表示(tg_style.css:459-462)になるため、上記の重複リスナー問題が顕在化するのは768px未満の表示のみ。

## ロジック・計算式・定数

- ツイート本文組み立て順序（tg_script.js:200-260、この順に文字列連結）: (1) tlFlow==='@No_TL'の場合のみ先頭に`${tlFlow}\n`（'あり'選択時は何も付かない＝'#No_TL'相当のタグは'なし'選択時のみ出る）。 (2) `${room} ${song}${rounds}　@${remainingSlots}\n【${roomIdSymbol}${roomIdDisplay}】\n\n`（@remainingSlotsの前は全角スペース「　」）。 (3) `主：${hostSkill}${hostInnerValue ? '/'+hostInnerValue : ''}` + (備考があれば`　${hostRemarksArray.join('・')} `、末尾は半角スペース) + `\n`。 (4) `募：${recruitSkillText}` + (備考があれば`　${recruitRemarksArray.join('・')} `) + `\n`。 (5) otherCommentsが非空なら`\n${otherComments.trim()}`。 (6) 最後に必ず`\n\n#プロセカ募集 #プロセカ協力`。
- roomIdDisplay算出(tg_script.js:195-198): 既定はroomIdそのまま。roomIdSymbol==='ルームID' かつ roomId が真値のときだけ`：${roomId}`（全角コロン）に置き換える。roomIdSymbol==='ルームID'でroomIdが空なら【ルームID】のみ（コロンなし）。roomIdSymbol==='🔑'のときは常に【🔑<roomId>】（記号とID間にコロンなし）。
- recruitSkillTextの'↑'付与ロジック(tg_script.js:231-232): まず`${requiredSkill}${requiredInnerValue?'/'+requiredInnerValue:''}`で結合文字列を作り、'/'でsplitして各要素に非空なら`${value}↑`、空なら''を付け、再度'/'でjoinする。requiredSkillのみ入力→'580'→'580↑'。両方入力→'580/1234000'→'580↑/1234000↑'。requiredSkillが空でrequiredInnerValueのみ入力（表示スイッチの組み合わせにより起こりうる）→初期文字列が'/1234000'→split→['','1234000']→['','1234000↑']→join→'/1234000↑'（先頭に孤立したスラッシュが残るエッジケース。要修正判断）。両方空→結果は空文字。
- 主（host）側の`主：`行にはrequired側のような'↑'付与ロジックは一切適用されない。hostSkill/hostInnerValueは生の値でそのまま`${hostSkill}${hostInnerValue?'/'+hostInnerValue:''}`として出力される（tg_script.js:211）。この非対称性（主は生値、募は'↑'付き）は仕様として意図的なので必ず踏襲する。
- hostRemarksArray結合順(tg_script.js:214-227): 条件外N（`条件外${conditionOutside}`）→支援者N人（`支援者${supporterCount}人`）→freeDescription（生テキスト）の順で配列に積み、非空なら'・'でjoinして前後に全角/半角スペースを付けて`主：`行の末尾に付加。
- recruitRemarksArray結合順(tg_script.js:234-249): ☆４→長時間できる方→判定強化✖→判定・回復✖→recruitFreeDescription（trim済み生テキスト）の順で固定文字列を積み、'・'でjoinして`募：`行の末尾に付加。
- showConditionOutside/showSupporter/showFreeDescription/showRecruitFreeDescriptionがoffのときは対応する値は空文字として扱われ（updateTweetPreview内で`checked ? value : ''`のパターン、tg_script.js:184-191）、hostRemarksArray/recruitRemarksArrayへは積まれない。

## データ依存

- MusicDatas/ 配下（transformedMusics.json等）への依存は一切なし。「楽曲」ボタン(songButtons)の選択肢はハードコードされたリテラル5種のみ: '🦐'（既定選択）, 'ビバハピ', 'ロスエン', 'Sage', 'おまかせ'（tweet_generator.html:47-51）。他ツール（Point-Analyzer等）のような楽曲マスタ参照は行っていない。
- localStorageキー'history'に履歴配列（最大10件）をJSON文字列として保存。リポジトリ内で'history'キーを使用しているのはこのファイルのみだが、localStorageはオリジン共有なので同一オリジンで配信される他ページが将来同名キーを使うと衝突しうる（現状は未使用で衝突なし）。移植時は'tweetGenerator.history'のようにスコープ付きキーにすることを推奨。

## 外部依存

- 共有CSS: ../../common.css（コンテナ/見出し/スイッチ等の共通スタイル、CSS変数 --unit-corlor 等の既定値やユニットカラー変数群を定義）
- 共有ヘッダー: ../Header/header.css, ../Header/header.js（defer属性、動的にヘッダー/ナビを挿入。/AssistTools/ 固定パス前提、GitHub Pages配信を想定した相対パス設計）
- Google Fonts: preconnect先 https://fonts.googleapis.com, https://fonts.gstatic.com、フォント https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c&display=swap（tweet_generator.html:11-13）
- favicon: ../../images/icon.jpeg（tweet_generator.html:15）
- X(Twitter)投稿インテントURL: https://x.com/intent/tweet?text=... （tg_script.js:270、外部サイトへのリンク生成のみ、API呼び出しなし）
- localStorage（ブラウザ組み込み、外部サーバー通信なし）。alert()によるネイティブブラウザダイアログ使用（tg_script.js:19）。
- tg_style.cssのCSS変数(--unit-corlor, --member-color-01〜04)はcommon.cssで定義された各ユニットカラーのエイリアスとして再定義されている（tg_style.css:1-7、Leo/needカラーにマッピング）が、tg_style.css自身の中ではどのセレクタからも参照されていない（common.css側の.title等が既定の--unit-corlor/--member-color-*を直接参照する形で間接的に効いている）。実質的にこの再定義ブロックは（このファイル単体では）デッドコードに近い。

## UXフロー

- 1. ページ読み込み: otherCommentsテキストエリアに初期文言「SF気にしません\n長時間大歓迎\nスタンプ他と同じ」をセットし高さを内容に合わせて自動調整(tg_script.js:31-36)。履歴を読み込み表示。各ボタン群・スイッチの初期状態を適用。updateTweetPreview()を実行しプレビューを初期表示。
- 2. ユーザーがTL放流有無/ルーム/楽曲/回数/残り枠/ルームID記号の各ボタン群から1つずつクリックして選択（クリックのたびに即updateTweetPreview()でプレビュー再生成）。
- 3. ルームID欄に数字を入力（全角数字も自動で半角変換、数字以外を含むと全消去されアラート表示）。
- 4. 主スキル値/主内部値/募集スキル値/募集内部値はデフォルトのトグルON状態のテキスト欄に直接入力（トグルOFFにすると該当欄が隠れ、その値はツイートに含まれなくなる）。
- 5. 「募集主備考」「募集備考」見出しをクリックして詳細欄を開閉し、条件外人数/支援者人数/自由記述、あるいは☆４/長時間可/判定強化✖/判定・回復✖/自由記述のスイッチ・テキストを設定（すべての入力/切替イベントでプレビューが即時更新）。
- 6. その他コメント欄を編集（任意）。
- 7. モバイル幅ではデフォルトでプレビューが画面下部に開いた状態で表示されており（前述の初期表示不整合）、右下の「プレビューを表示/を閉じる」ボタンで開閉トグル。PC幅ではプレビューは常時サイドに表示され、当該ボタンはCSSで非表示。
- 8. 「リンク生成」ボタンクリックでgenerateTweetLink()が実行され、直下に「ツイートする」リンクが1つ生成される（再クリックすると差し替え）。クリックでX投稿画面が新タブで開く（本文はプリフィル、実際の送信操作はユーザーがX側で行う）。
- 9. 「入力を保存する」ボタンで現在の全入力値を履歴に保存（先頭に追加、最大10件、超過分は末尾から自動削除）。
- 10. 「履歴」見出し横のスイッチで履歴一覧を開閉。各履歴行は「ルームID表示 / 保存日時 / ★お気に入り / 再利用 / 削除」の4要素を持つ。「再利用」クリックでその履歴の全項目をフォームに復元しプレビュー再生成。「★」でお気に入り表示切り替え（10件キャップからの保護効果はなし）。「削除」で個別削除。「全履歴削除」で一括消去（確認なし）。

## 移植時の注意

- グローバル変数・DOM直接操作への強依存: tweetPreview/previewAreaはモジュールトップレベルのconstとしてDOM要素を直接保持し、全関数がdocument.getElementById経由でDOMから値を読み書きする設計。Reactへの移植では、これら全項目をコンポーネントのstate（もしくはフォームの単一state object）に置き換え、updateTweetPreview相当をuseMemo/派生値として再実装するのが自然。
- history機能はlocalStorage直書き・JSON.parse/stringifyの手組み実装。件数上限10・favoriteの非保護・dateTimeがtoLocaleString()依存（環境ロケール依存で表示形式が揺れる）という現状の挙動をそのまま踏襲するか、この機会に仕様として直すか要合意（特にfavoriteが実質的に「見た目だけの星」でしかない点はユーザーの期待と乖離している可能性が高い）。
- convertToHalfWidth/validateNumericInputの「不正入力で全消去」という挙動はユーザー体験として厳しめ（1文字でも不正なら全部消える）。他ツール（Effective_Value_Calculator等）の同種バリデーションと横断的に統一するかも含め検討推奨。
- プレビュー開閉の二重イベントリスナー（tg_script.js:90-114 と 491-506）は移植時に一本化すべき。現行の「たまたま挙動が壊れて見えない」状態に頼らず、単一のshow/hidden state（ReactならuseState）に統一する。
- 初期表示バグ（モバイルでプレビューが最初から開いている＝ボタン文言と矛盾）は移植時に修正するか、意図的に「常に閉じた状態から開始」に倒すか、Noriに確認してから決めるのが安全（無断で仕様変更しない）。
- recruitSkillTextの「requiredSkill空・requiredInnerValueのみ入力」時に生じる先頭スラッシュ('/1234000↑')は実際のプロセカ運用上あまり起きない組み合わせ（内部値だけ見せてスキル値を隠すケース）だが、テストケースとして再現し、直すか踏襲するか要判断。
- setupButtonGroup内の到達不能デッドコード(tg_script.js:155-159)、tg_style.cssのCSS変数再定義ブロック(tg_style.css:1-7)は実質未使用なので移植時にそのまま持ち込む必要はない（ただし--unit-corlor等の値自体は他の共通コンポーネント経由でこのページの見た目に効いているため、Leo/needカラーをテーマ色として使うという意図は残す）。
- /AssistTools/ 固定の相対パス（../../common.css, ../Header/header.js等）とGitHub Pages配信前提の構成なので、Vite移植時はビルド後のパス解決・Header差し込み方式（現状はheader.jsによる実行時DOM挿入）をコンポーネント化するか検討要。
- roomId入力に対する2つのinputリスナー（バリデーション→プレビュー更新）の実行順序に依存した挙動（先に半角変換・不正値クリアが確定してからプレビューに反映される）は、Reactのcontrolled inputで単一のonChangeハンドラに統合する際も同じ順序（サニタイズ→state更新）を保つこと。
- reuseHistory内の値代入が一部二重処理になっている点（tlFlow等が前半と後半で2回セットされる）は実害はないが、移植時はstate一括セットに単純化してよい。
