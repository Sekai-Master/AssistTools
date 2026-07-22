# 移植仕様: スキル実効値計算機

> 現行 vanilla 実装のキャプチャ（2026-07-22 再取得）。React 移植の正本。

**目的**: プロセカ（プロジェクトセカイ）のイベント編成における「先頭スキル値」と「内部値（編成5枠のスキル値合計）」から「実効値」を算出する（またはその逆算をする）電卓。キャラクターランクやスキルレベル、バーチャルシンガーの編成ユニット構成、特訓前オリジナルキャラクターの個体差（内部値2〜5枠）など、ゲーム内の細かい仕様に応じて『発動スキル値』を自動計算し、実効値計算に流し込む一体型ツール（evc_script.js 全598行）。

## 挙動（再現すべき）

- モード切替スイッチ #mode-toggle（html:26-32）：オフ=『先頭/内部値→実効値』モード、オン=『実効値→先頭/内部値』モード。JS側 evc_script.js:47 でページロード時に modeToggle.checked=false を強制設定（HTML側は checked 属性付きだが上書きされる）。切替時 toggleMode()（script.js:302-319）が各 input-group の display を切り替える。
- 順方向モード：先頭スキル値プリセットボタン 150/140/130/120/110/100/ブルフェス（html:37-44, script.js:36,296-300,384-428）＋任意値の数値入力欄 #leader-skill（type=number, ▲▼で±5, script.js:538-547）。内部値は数値入力欄 #inner-value（▲▼±5, script.js:550-559）、または『スキル値を個別に入力する』トグル #detail-toggle オンで2〜5枠の個別スキル値入力（#inner-value-2〜5）から自動合算（script.js:322-356）。
- ブルフェス選択時は特訓前/特訓後 → （特訓後なら）キャラクターランク入力＋スキルレベルLv.1-4選択、（特訓前なら）キャラクタータイプ選択：バーチャルシンガー（編成ユニットボタン6種＋スキルレベル）またはオリジナルキャラクター（内部値2〜5枠強制表示＋スキルレベル）に分岐（html:55-138, script.js:430-497）。
- 逆方向モード：実効値の数値入力 #effective-value、任意で先頭スキル値を指定する #op_leader-skill（未入力=0なら6種の代表的な先頭スキル値[150,140,130,120,110,100,160]それぞれについて内部値を一括表示、指定ありならその値のみで逆算）script.js:194-254。
- 出力はすべて #result 内に動的生成されたHTML文字列（インラインstyleで背景色・角丸・太字装飾）で表示。順方向は『この編成の実効値は 〔値〕 です。』、逆方向は『内部値は 〔値〕 です。』（背景色 #FFAACC）。オリジナルキャラクター（特訓前・複数候補あり）の場合は『150 or 140(2)』のように候補を' or 'で連結し、平均値も併記（script.js:256-293）。
- 実効値・内部値とも 768px 幅を window.innerWidth で判定し、狭幅なら改行(<br>)、広幅ならスペース区切りに切替（script.js:210,214,217,258,291）。

## ロジック・計算式・定数

- 特訓後の基礎スキル値 getBaseSkillValue(skillLevel)：Lv1=90, Lv2=95, Lv3=100, Lv4=110（default=110） script.js:62-70。発動スキル値 = base + Math.floor(min(characterRank,100) / 2)（updateSkillValue, script.js:95-105）。characterRankは全角→半角変換後 parseInt、100でキャップ。
- バーチャルシンガー特訓前の基礎スキル値 getVSBaseSkillValue：Lv1=70, Lv2=75, Lv3=80, Lv4=90（default=90） script.js:73-81。発動スキル値 = base + 30 * min(選択中の非VirtualSinger編成ユニット数, 2)（updateVSSkillValue, script.js:108-118）。VirtualSingerボタン自体は常時active固定でカウント対象外。
- オリジナルキャラクター特訓前の基礎スキル値 getOCBaseSkillValue：Lv1=60, Lv2=65, Lv3=70, Lv4=80（default=80） script.js:84-92。スキル値上限 ocSkillValueLimits=[120,130,140,150]（skillLevel-1でindex）script.js:44。2〜5枠それぞれの入力内部値について 発動スキル値候補 = min(base + floor(innerValue/2), 上限) を計算し possibleSkillValues[] に格納、重複個数をカウントして『値(個数)』表記で ' or ' 連結表示（calculateOCSkillValue, script.js:120-161）。
- 順方向の実効値計算：leaderSkillInput.value を ' or ' で分割し各候補について effectiveValue = round( leaderSkill + (innerValue - leaderSkill) * 0.2 )（calculateEffectiveValue, script.js:164-191）。leaderSkillValuesのいずれかがNaN、またはinnerValueがNaNならエラーメッセージ表示。
- 逆算：innerValue = ((effectiveValue - skillLevel) / 0.2) + skillLevel （calculateFromEffectiveValue内、script.js:204,230 = 順方向式の代数的逆関数）。判定分岐：innerValue < skillLevel なら『実効値を再確認してください』（内部値が先頭スキル値未満はあり得ない）。innerValue > skillLevel+640 なら『該当内部値はありません』（他4枠の最大想定合計=160*4=640が上限という仮定）。skillLevel+600 < innerValue <= skillLevel+640 の範囲は『ブルフェスメンバーを含む編成です』の注記付きで表示（通常メンバーの上限150を超え、ブルフェス個体の160まで許容するレンジ）script.js:206-249。
- 個別スキル値入力（detail-toggle ON）時の内部値合算：leaderSkillInput.value を ' or ' 分割して(通常は候補が1つなので)reduceで合計 + inner-value-2 + inner-value-3 + inner-value-4 + inner-value-5 = 内部値（calculateInnerValueFromDetails, script.js:338-356）。つまり『内部値』＝先頭含む編成5枠のスキル値合計、という定義。
- OC(オリジナルキャラクター)かつブルフェス・特訓前の場合の追加処理 updateOCSkillValueIfNeeded（script.js:359-375）：calculateOCSkillValue()を再実行→possibleSkillValuesの最大値 maxSkillValueを取得→innerValueInput.value = (現在のinnerValueInput.value をparseFloatした値) + maxSkillValue という『加算』代入（上書きでなく累積）→displayResultForOC()で表示。
- displayResultForOC（script.js:266-293）：possibleSkillValues各要素について effectiveValue=round(skillValue + (innerValue-skillValue)*0.2) を計算し、重複カウント付きで ' or ' 連結表示、加えて4値の平均値 Math.round(平均) も併記。
- 全角数字→半角変換 toHalfWidth（script.js:55-59）を全ての数値入力パースの前段で通す（parseInt/parseFloatの直前）。

## データ依存

- 外部データファイルへの依存なし。定数（各スキルレベル基礎値・上限値・+30ボーナス・0.2係数・600/640レンジ）はすべて evc_script.js 内にハードコード（script.js:43-92, 113, 179, 200, 204, 209, 213, 235, 240）。
- 参考として C:\Users\masan\Documents\GitHub\sekai-master-db-diff\skills.json を確認したが、そこに格納されているのは『スキル効果タイプ別・レベル別のスコアアップ%等の生効果値』であり、本ツールが扱う『先頭スキル値／内部値』というコミュニティ由来の合成指標とは形が異なり、1対1で対応する項目は無い。すなわち本ツールのゲームバランス定数はマスタDBから動的取得しているのではなく、開発者がゲーム挙動から独自に割り出してスクリプトへ静的に埋め込んだ値である。

## 外部依存

- ../../common.css（html:7）：.mainLabel/.miniLabel/.input-group/.switch等の共通UIスタイルと --member-color-01〜04 / --unit-corlor CSS変数の定義元（実際の色は各ページのローカル:root上書きで決まる。evc_style.css:1-7で --unit-corlor=--more-more-jump, --member-color-01〜04 を特定メンバーカラーに束縛）。
- ../Header/header.css, ../Header/header.js（html:8,10）：header.jsはページロード時に fetch('/AssistTools/Pages/Header/header.html') で共通ヘッダーHTMLを取得し body 先頭に挿入、ハンバーガーメニュー・ドロップダウン・Advance Modeトグル（.advancedクラス要素の表示切替）をセットアップ（header.js:1-55）。本ツール自体には .advanced 要素は無いため Advance Mode の直接的な影響は無い。
- Google Fonts『Kaisei Tokumin』『M PLUS Rounded 1c』を preconnect + stylesheet で読み込み（html:11-13）。common.css:57で body の font-family に M PLUS Rounded 1c を指定。
- ../../images/icon.jpeg（favicon, html:14）、../../images/Team_Logo/*.png（編成ユニットボタンの6ロゴ画像、html:93-109）。各画像に onerror ハンドラがあり、読み込み失敗時は画像を消してユニット名テキストに差し替え（例: onerror="this.onerror=null; this.src=''; this.textContent='Virtual Singer';"）。
- localStorage等の永続化は未使用。ページリロードで全入力状態は消える。

## UXフロー

- 1. ページを開くと『先頭/内部値→実効値』モード（スイッチOFF）がデフォルト。先頭スキル値プリセットボタン（150〜100 or ブルフェス）か任意入力欄のどちらかで先頭スキル値を決める。
- 2A. 通常プリセット（150〜100）選択時：任意入力欄に値がセットされ即座に実効値計算（内部値が空でもNaNにならず0扱いで計算が進む点に注意 script.js:170,173）。
- 2B. 『ブルフェス』選択時：特訓前/特訓後を選ばせる。特訓後→キャラクターランク数値入力＋スキルレベルLv.1-4選択で発動スキル値を自動算出し先頭スキル値欄へ反映。特訓前→キャラクタータイプ（バーチャルシンガー／オリジナルキャラクター）を選ばせ、バーチャルシンガーなら編成ユニット複数選択（VS自体は固定）＋スキルレベルで自動算出、オリジナルキャラクターなら内部値2〜5枠入力欄が強制表示され、詳細トグルも強制ON、4候補のスキル値・実効値が同時算出される。
- 3. 内部値は直接入力するか、『スキル値を個別に入力する』トグルをONにして2〜5枠のスキル値を個別入力すると自動合算される（合算中は内部値欄が入力不可＝disabledになる）。
- 4. 実効値が #result にリアルタイム表示される（入力の度にイベント発火→再計算、送信ボタン等は無し）。
- 5. モードスイッチをONにすると『実効値→先頭/内部値』モードに切替わり、実効値入力欄と任意の先頭スキル値指定欄が表示される。先頭スキル値を指定しなければ代表的な6+1パターンそれぞれについて逆算結果が一覧表示され、指定すればそのパターンのみ1件表示される。

## 移植時の注意（現行バグ含む）

- モード初期化の不整合：HTML側 #mode-toggle には checked 属性がある（html:27）が、evc_script.js:47 でロード時に modeToggle.checked=false を強制上書きしており、その際 toggleMode() は呼ばれない。見た目の整合はHTML側の各グループのインラインstyle（leader/inner-value-groupは表示、effective/op_leader-skill-groupはdisplay:noneでhtml:179,184）にたまたま依存しており、Reactで再実装する際は初期状態を明示的な state（例: mode='forward'）として持たせ、スイッチの初期値とグループ表示ロジックを1箇所で一貫させること。
- #leader-skill は type="number"（html:48）だが、calculateOCSkillValue内(script.js:155) では leaderSkillInput.value に '150 or 140(2)' のような非数値文字列を代入している。ブラウザ仕様上 <input type=number> へ数値化不能な文字列を代入すると値は無条件に空文字にリセットされるため、この行は実質的に効果が無く、先頭スキル値の入力欄自体は空のまま表示される（別要素 #calculated-oc-skill-value span, script.js:154 が正しく候補テキストを表示するため、UI上は破綻が目立ちにくいだけ）。この結果、直後の calculateInnerValueFromDetails/calculateEffectiveValue（script.js:166-168, 341-343）が leaderSkillInput.value を再パースする箇所は '' → NaN → 0 を読むことになる。Reactへ移植する際は『先頭スキル値の表示用テキスト』と『実際に計算へ使う数値/数値配列 state』を最初から分離すること。
- updateOCSkillValueIfNeeded（script.js:359-375）内の `innerValueInput.value = (parseFloat(toHalfWidth(innerValueInput.value)) || 0) + maxSkillValue;`（370行目）は現在値への加算であり、上書きではない。2〜5枠のいずれかの入力欄に対するinputイベントの度にこの関数が呼ばれる（script.js:520-535）ため、キー入力の度に内部値がmaxSkillValue分だけ際限なく積み上がっていくバグがある。移植時はこの箇所を『現在のleaderSkill(最大候補)＋2〜5枠の入力値合計』を毎回ゼロから再計算する絶対値代入に修正することを推奨（意図を本人に確認した方が安全）。
- calculateInnerValueFromDetails（script.js:341-344）はleaderSkillInput.valueを' or 'で分割後reduceで全合算している。本来は候補のうち1つを使うべき場面でも合算してしまう実装になっており、通常フローでは候補が常に1個なので顕在化しないが、ロジックとして脆い。
- 括弧除去の正規表現が2箇所で微妙に異なる：script.js:168 `/\(.*\)/`（greedy, 任意文字列） と script.js:342 `/\(\d+\)/`（数字限定）。想定フォーマット『value(count)』では実害無いが、移植時は共通ユーティリティ関数に統一した方が良い。
- window.innerWidth <= 768 による改行判定（script.js:210,214,217,258,291）はcalculate時点の一度きりの判定でリサイズに追従しない。CSSのみでの折返し制御か、Reactではメディアクエリhookに置き換えるのが望ましい。
- header.js:3 の fetch('/AssistTools/Pages/Header/header.html') は絶対パス（サイトルート基準）決め打ち。Vite移行時はBASE_URLやReact共通Headerコンポーネント化で吸収する必要がある。
- 逆算モードのデフォルト先頭スキル値配列 [150,140,130,120,110,100,160]（script.js:200）は数値順でなく末尾に160を追加した特殊順。表示順として維持する必要あり（UIの見た目の並び順に影響）。
- 順方向の実効値は常に Math.round で整数化（script.js:180,270）される一方、逆算の内部値は toFixed(1) で小数第1位まで保持（script.js:215,218,241,244,260）——丸め精度が非対称であり、意図的な仕様なので移植時に統一してしまわないよう注意。
- 『オリジナルキャラクター』選択時（script.js:488-490）は detailToggle.checked を強制的にtrueにし toggleDetailInput() を呼ぶ。toggleDetailInput（script.js:322-335）はOFF時に innerValueInput.value を空文字へ強制クリアする副作用があるため、モード遷移のたびに内部値がリセットされる点も踏襲すべき挙動として明記。
- VSの発動スキル値計算(script.js:113-115)およびdisplay代入でのMath.floorは入力が常に整数（base整数 + 30*整数）のため実質無意味だが、将来定数が非整数化された場合の安全策として残っている可能性がある。
- ボタンの▲▼は常に±5固定ステップ（script.js:538-571）。入力欄がNaN/空の場合は0スタートとして加減算される（parseInt(...||"0",10)）。
- unit-buttonsのVirtualSingerボタンはクリックしてもactiveクラスがトグルされない（script.js:583-584の分岐でスキップ）が、常時activeなCSSスタイル(html:92のclass="active")が最初から付与されているため常に選択済み扱い。ボタンとしてクリック可能に見えるが実際は無効化ボタンとして扱うべき（disabled属性付与などUI改善の余地あり）。
