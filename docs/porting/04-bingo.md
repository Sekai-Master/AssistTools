# 移植仕様: BINGO Generator (Pages/04_BINGO_Generator)

> 現行 vanilla 実装のキャプチャ（2026-07-22 調査）。React+Vite への移植時の正本。

**目的**: プロセカ「チアフルカーニバル」イベント用のBINGOカード（5x5、25マス）画像生成ツール。楽曲マスターデータから条件でフィルタしてランダム配置、またはシード値から同一カードを再現し、Canvas上に描画・PNGとして保存/クリップボードコピーできる。各マスは後から「クリア済み」トグルが可能で、再描画に反映される。

## 挙動（再現すべき）

- 【重要】BINGO_Generator.html (行193-196) が実際に読み込むのは BINGO_globals.js → BINGO_helpers.js → BINGO_draw.js → BINGO_events.js の4ファイルのみ。BINGO_script.js(1019行)は同じロジックをほぼ完全に含む旧一枚岩ファイルだが、HTMLからは一切参照されていない完全なデッドコード（リポジトリ内 grep でも他に参照なし）。移植は4分割版を正とすること。
- 初期化(BINGO_events.js:4-123, window 'load'イベント): generate/copy/save/seedの4ボタンをdisabled=trueで開始。aliasMapping.json と transformedMusics.json を並行fetchし、後者の読み込み完了後にのみ generateButton.disabled=false と initializeFuse() を実行(events.js:36-41)。copy/save/seedボタンはカード生成完了後(draw.js:240-242)まで有効化されない。
- FREEマス用アイコン '../../images/icon.webp' を非同期ロードし、成功時に freeIconLoaded=true をセット(globals.js:207-218)。ロード未完了のままカード生成すると FREEマスは単色グレー(#cccccc)で代替描画される(draw.js:205-208)。
- モード選択(events.js:491-513): 'ランダム'(初期active)と'シード値'の2ボタンのみが実装済み(HTML上、指定(曲)/指定(完全)ボタンはコメントアウトされ存在しない)。'シード値'選択でcenterSelectiongroup/FilterGroupを隠しseedInputGroupを表示、それ以外で逆。
- 中央マス選択(events.js:515-529): free(初期active)/random/specifiedの3ボタン。specified選択時のみ centerSongSelectionGroup を表示。
- 生成ボタン押下 generateBingoCard() (events.js:128-223): transformedMusics未ロードならalertして中断。modeが'seed'なら seedInput欄の値をtrim()し、空ならalert中断。decodeSeedValue()に通し、成功すれば currentCardData に代入して drawBingoCard+generateCardTable、失敗(try/catch)ならalertして中断・return。
- ランダム生成: transformedMusics を published && selectedUnits.has(Unit) && categories.some(selectedCategoriesに含まれる) && selectedMusicTypes.has(isNewlyWrittenMusic) でフィルタ(events.js:158-163)。中央モードが'random'なら25曲、それ以外は24曲が必要数(centerMode==='random'?25:24, events.js:168)。不足時はフィルタ後の該当曲数を含めてalertして中断。
- shuffleArray(Fisher-Yates, helpers.js:76-82)でselectedSongsを破壊的にシャッフル後、i=0..24をループしてcard配列を構築(events.js:180-213)。i===12(中央マス、0-indexed)でcenterMode分岐: free→"FREE"文字列, specified→{...centerSong, cleared:false}のコピー, random→selectedSongs[songIndex++]のコピー。それ以外のマスはselectedSongs[songIndex]を採用するが、centerSong.idと同じ曲は while ループで読み飛ばしてから採用(スキップされた曲はカードに一切現れない＝使われない)。songIndexがselectedSongs.lengthに達したら都度alertして中断。
- 重複防止は「centerSong.idとの重複」のみをチェックしており、centerMode==='random'または'free'の場合でも centerSong(前回選択された曲、既定はTell Your World)との重複排除ロジックは常に走る。centerMode==='free'/'random'選択時でも古い centerSong.id が居残っていると、その曲だけ他の24マスから除外され続けるという潜在バグ的挙動がある。
- カード生成完了時に encodeSeedValue(card)でシード値をconsole.logするのみ(コピー等はしない、events.js:215-216)。currentCardData=card, currentBorderColor=null にリセット(枠線色を次回描画で再抽選させる)。
- drawBingoCard(card) (draw.js:171-248): 描画開始時に #loader を display:flex、#bingoCanvas を display:none にして『ロード中』状態に切替える。canvas.width/height を cellSize*5+margin*2 = 100*5+20*2=520pxの正方形に設定。5x5グリッドを col=i%5, row=floor(i/5) でx,y座標化(margin=20, cellSize=100)。
- "FREE"文字列セルは即時描画（freeIconLoaded時は freeIconImage を globalAlpha 0.7 で描画、未ロード時は#ccccccで塗り潰し）、その上に半透明白シャドウ付きの斜体25px 'Arial Black' で中央に "FREE" と描画。楽曲セルは drawSongCell()のPromiseをpromises配列に積む(helpers.js:46-58): '../../MusicDatas/jacket/'+jacketLink から画像ロード→drawImage、失敗時は#999999で塗り潰し(imgエラーはconsole.errorのみでUI通知なし)。song.clearedがtrueならdrawClearedOverlay()を重ねる。
- drawClearedOverlay (helpers.js:8-40): セル全体に半透明(alpha 0.7)の#ccccccを塗った後、セル中心へ移動して-20度回転させた座標系で斜体20px 'Arial Black' 赤字の"CLEARED"を中央描画し、上下15pxの位置に赤い水平線(lineWidth 2)を2本引く。
- Promise.all(promises).then()内で drawSignature()（右下に'Created by Sekai-Master @YesNoritake'、14pxサンセリフ黒字、textBaseline='bottom'でcanvas右下ギリギリに配置）→ currentBorderColorがnullなら colorCandidates(30色)からMath.random()で1色抽選し保持 → drawRoundedRect(margin,margin,cardSize,cardSize,radius10)で角丸枠を描画(lineWidth4)。最後にcopy/save/seedボタンを有効化し、canvasを表示に戻してローダーを隠す。
- generateCardTable(card) (draw.js:27-169): #cardTableContainer 配下にHTMLテーブルを都度再生成(innerHTML=''でクリア後append)。列は['位置','ジャケット','曲名','ユニット','状態']。位置はA-E(列)+1-5(行、1始まり)。ジャケット列はimg(height:50px)を表示、clearedならgrayscale(100%)フィルタ+赤文字'CLEARED'オーバーレイdivを絶対配置(rotate 345deg)。
- 曲名セルはクリック可能(cursor:pointer)で、クリックすると editingCellIndex=index をセットして openSongSearchModal()を開く（そのマスの曲を差し替えるため）。ユニット列は9_oth以外は '../../images/Team_Logo/{unitMapping[unit]}.png' 画像とユニットカラー背景(unitColorMapping、CSS変数)を表示、9_othは文字列'Others'のみ。状態セルはクリックで cell.cleared をトグルし、都度 generateCardTable(card) と drawBingoCard(card) を全体再実行(部分更新ではなく毎回全体再生成・再描画)。
- シード値エンコード encodeSeedValue (helpers.js:89-103): カード25マスを2文字ずつのBase64類似文字にマップし結合(50文字固定長)。"FREE"は固定で"AA"(=id0)。楽曲マスは id=parseInt(cell.id,10) にcleared時+2048し、firstChar=base64Alphabet[floor(id/64)], secondChar=base64Alphabet[id%64]。
- シード値デコード decodeSeedValue (helpers.js:109-130): 文字列を2文字ずつ読み、base64Alphabet.indexOf()で復元したid(0-4095)が0なら"FREE"、非0ならid>=2048でcleared判定しid-2048(または元id)を3桁0埋め文字列化してtransformedMusicsから同id曲を検索。見つからなければException投げてgenerateBingoCard側のcatchでalert。
- decodeSeedValue はマッチした song オブジェクトへ song.cleared=cleared を直接代入している(グローバル配列transformedMusics内のオブジェクトを破壊的にミューテート、コード内コメントでも「元データに影響を与えないようコピーを検討」と自認)。同じ曲を含む複数のシード値を続けて読み込むと、以前のcleared状態が残存/上書きされ、かつ最初にランダム生成したカード(same song参照)のcleared表示にも波及しうる潜在バグ。
- 画像操作: copyCanvasImage()はcanvas.toBlob→ClipboardItem('image/png')でクリップボードへ書込み、成功/失敗をalertで通知。saveCanvasImage()はcanvas.toDataURL('image/png')から一時<a download='bingo_card.png'>を生成しclick()→removeChildでダウンロード起動。generateSeedValue()は currentCardData必須(nullならalertで中断)、encodeSeedValue()の結果をnavigator.clipboard.writeText()でコピーしalert表示（値そのものもalertに含めて表示）。
- 楽曲検索モーダル(openSongSearchModal/closeSongSearchModal, events.js:293-306): 開く際に検索入力欄クリア・検索結果クリア・displayDefaultSongs()でdefault値昇順ソートの先頭50曲を一覧表示。closeSongSearchModal()はeditingCellIndexをnullにリセットする。
- 楽曲検索/フィルタ filterSongs() (events.js:331-397, globals/scriptにも重複実装あり): メインページとモーダルのフィルタ要素(unitFilter等)を『メインの値があればそれ、無ければモーダルの値』の三項で解決(実運用ではメイン側は<div>のボタン群でvalueプロパティを持たないため常にmodal側のselect値が使われる設計と推測される→事実上モーダルの<select>だけが効く)。published && (unit==='all'||Unit一致) && (category==='all'||categories.includes) && (musicType==='all'||isNewlyWrittenMusic.toString()===musicType文字列比較)でベースフィルタ。
- 検索クエリがある場合: Fuse.js(threshold0.4, keys=title:0.6/pronunciation:0.3/artistName:0.1, distance100)によるあいまい検索結果と、aliasMapping内でquery部分一致(indexOf)したエントリのsongIdsから引いた曲をマージし、id重複除去(findIndexで先勝ち)、その後ベースフィルタ済み配列とのAND(filteredSongs.includes(song)、参照同一性で判定＝transformedMusics由来の同一オブジェクト参照である前提)。
- 検索結果は default フィールド昇順ソートで先頭50件のみ表示(addSearchResultItem, events.js:309-328)。各行クリックで: editingCellIndex!==nullなら該当インデックスの曲を{...song,cleared:false}に差し替えてupdateCardAtIndex()実行、nullなら中央マス曲(centerSong)を更新しcenterSongTitleのテキストを書換え。その後モーダルを閉じる。
- updateCardAtIndex(index,newSong) (events.js:411-421): currentCardDataが無ければ25要素null配列で初期化(生成前に個別セル編集した場合の防御だが、他のマスはnullのままdrawBingoCard呼び出しでnull.jacketLink等の参照エラーになりうる)。index===12なら centerSong も同時更新。対象マスへ{...newSong, cleared:false}を代入し、カード全体を再描画・再テーブル生成。
- フィルタボタン群(ユニット/カテゴリ/曲種)は全てトグル式(初期状態は全選択、globals.js:26-28相当のSet)。ボタンクリックでSetに対しadd/delete、CSSクラスとfilterスタイル(grayscale)を手動で付け外し。selectedMusicTypesはbooleanのSet({true,false})で管理し、data-music-type属性の文字列'true'/'false'を==='true'比較でboolean化。
- colorCandidates(30色, globals.js:13-20)はユニットごとに5色ずつグループ化された枠線色候補。カード生成のたびに currentBorderColor=null にリセットされるため、生成ボタンを押すたび新しい枠線色が抽選される。ただしセル編集(updateCardAtIndex経由の再描画)ではリセットされないため、枠線色は維持されたまま再描画される。

## ロジック・計算式・定数

- シードエンコーディング定数: base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'(64文字、globals.js:23)。cleared加算量は固定2048 (helpers.js:96, globals.js:125)。2文字1組×25マス=50文字固定長シード。
- id空間: 実データの楽曲id最大値は624(3桁ゼロ埋め文字列、transformedMusics.json確認済)。2文字Base64で表現可能な最大値は64*64-1=4095なので、cleared加算後(624+2048=2672)でもオーバーフローしない。ただし将来id>2047の曲がclearedになると2桁表現の桁上がりで衝突しうる理論上の上限がある(現状は未到達)。
- FREEマスのid値は0固定('AA'⇔0)。楽曲id=0は存在しない前提(transformedMusicsのidは'001'始まり)ため衝突なし。
- requiredSongsCount = centerMode==='random' ? 25 : 24 (events.js:168)。中央マス以外の24マスに加え、centerMode==='random'の時だけ中央用にもう1曲必要という数合わせ。
- 中央マスとの重複除外は while(selectedSongs[songIndex].id === centerSong.id) songIndex++ (events.js:196-201)。centerSong はモード関係なく常にモジュールグローバル変数として存在し、モーダルで一度も曲選択していない場合の既定値は centerSong = {title:'Tell Your World', id:'001', jacketLink:'jacket_s_001.webp', Unit:'0_VS'} (globals.js:10)。従って centerMode==='free' でも常に曲ID'001'(Tell Your World)がシャッフル後の他マス候補から除外される。
- cellSize=100px, margin=20px固定(draw.js:180-181)。canvas総サイズ = 100*5+20*2 = 520x520px固定。レスポンシブ対応はCSS側(#bingoCanvas{width:100%;max-width:540px;height:auto} @768px以下, BINGO_style.css:401-405)でのスケール表示のみ、実ピクセル数は変わらない。
- 枠線角丸半径は固定10px、線幅4px (draw.js:233-235)。署名フォントは固定14px sans-serif、位置は (canvas.width - textWidth, canvas.height)固定（右下ギリギリ、marginスペース内に収まる想定）。
- CLEAREDオーバーレイの回転角度は-20度固定(-20*Math.PI/180)、水平線は中心から上下15pxオフセット固定、線幅2px。フォントは 'italic 20px Arial Black' 固定。
- 検索: Fuse.js threshold=0.4, distance=100, keys weight [title:0.6, pronunciation:0.3, artistName:0.1] (events.js:274-284)。デフォルト表示・検索結果とも sort by 'default' フィールド昇順、slice(0,50)で上位50件のみ表示（'default'はゲーム内実装順などを示す並び替え専用の数値フィールドと推測、6-7桁の数値）。

## データ依存

- ../../MusicDatas/transformedMusics.json (プロジェクトルート相対 MusicDatas/transformedMusics.json, 624件確認, フィールド: id(3桁ゼロ埋め文字列), title, pronunciation, creatorArtistId, artistName, default(数値・表示順ソートキー), Unit('0_VS'|'1_L/n'|'2_MMJ'|'3_VBS'|'4_WxS'|'5_25'|'9_oth'固定7種), categories(配列、値は'mv_3d'|'mv_2d'|'original'|'image'の組合せ), publishedAt(unixミリ秒), published(bool), isNewlyWrittenMusic(bool), isFullLength(bool), jacketLink(ファイル名文字列), music_time(秒, float), event_rate(数値)。実行時に fetch→JSON配列としてグローバル transformedMusics へ格納、以後生成・検索・デコードの全処理がこれを直接参照(コピーせず同一オブジェクト参照を使い回す＝decodeSeedValueの.cleared代入がグローバルデータを汚染する)。
- ../../MusicDatas/aliasMapping.json (配列、各要素 {alias: string, songIds: string[]}。エイリアス検索用、id文字列の配列で1エイリアスが複数曲を指せる)。
- ../../MusicDatas/deletedSongs.json は BINGO Generator からは未参照(存在確認のみ、他ツール用データと思われる)。
- ../../MusicDatas/jacket/ 内 545枚のwebp画像(jacket_s_XXX.webp命名)。カード描画・テーブル・検索結果では使われていないがjacketLinkとして各曲に紐づく。

## 外部依存

- fetch('../../MusicDatas/aliasMapping.json') と fetch('../../MusicDatas/transformedMusics.json') — ページからの相対パス(Pages/04_BINGO_Generator/からの相対で実質ルート直下MusicDatas/を指す)。
- 画像fetch: '../../MusicDatas/jacket/'+jacketLink (楽曲ジャケット), '../../images/icon.webp' (FREEマス用アイコン、crossOrigin='Anonymous'指定＝CORS要件あり。同一オリジンのGitHub Pages配信なら問題ないが、Netlify移行時も同一オリジン配信であることが必須), '../../images/Team_Logo/{unit}.png' (ユニットロゴ、テーブル描画時)。
- fetch('/AssistTools/Pages/Header/header.html') — header.js内でルート絶対パス '/AssistTools/...' がハードコードされている(Header/header.js)。GitHub Pagesのプロジェクトページ(/AssistTools/配下)前提の設計なので、Netlify等パスルートが変わる配信では書き換え必須。
- 外部CDN: https://cdn.jsdelivr.net/npm/fuse.js@6.6.2 (Fuse.js、deferなし・同期読み込み。BINGO_Generator.htmlのみに存在、About_BINGO_Generator.htmlには無い)。
- Google Fonts: fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c (preconnect込み)。
- canvas API: toBlob/toDataURL、Clipboard API: navigator.clipboard.write([ClipboardItem])・writeText — HTTPS(またはlocalhost)必須、権限プロンプトが出る場合あり。
- アイコン favicon: '../../images/icon.jpeg'。
- 共通CSS: ../../common.css, ../Header/header.css, BINGO_style.css, loader.css（loader.scssから手動/ビルドでコンパイルされたもの、_variables.scss/_mixins.scssに依存。$primary-color: var(--unit-corlor) がBINGO_style.css内で :root{--unit-corlor: var(--wonderlands-showtime)}として上書きされている＝ローダーの球の色はワンダーランズ×ショウタイムのユニットカラー固定)。

## UXフロー

- 1. ページロード: 4ボタン(生成/コピー/保存/シード発行)が disabled で開始。裏でJSON2種を並行fetch。transformedMusics.json取得完了で生成ボタンのみ有効化されFuse.js初期化。FREEアイコン画像とヘッダーHTMLも非同期ロード。
- 2. モード選択: 'ランダム'(既定)か'シード値'をクリックで切替。シード値モードでは絞り込み条件UIと中央マス設定UIが隠れ、シード値入力欄が現れる。
- 3. (ランダムモード時)中央マス処理を FREE/ランダム/指定 から選択。'指定'選択で曲選択UI(現在の曲名+『曲を選択』ボタン)が現れる。『曲を選択』クリックで検索モーダルが開き(editingCellIndex=null)、モーダルから曲を選ぶと centerSong が更新されタイトル表示も書き換わる。
- 4. (ランダムモード時)絞り込み条件: ユニット7種・MV種別4種・曲種2種のトグルボタンで対象楽曲を絞る(初期は全選択)。
- 5. 生成ボタン押下: シードモードなら入力シード値をデコードしてカード再現(失敗時alert)。ランダムモードなら絞り込み条件でフィルタしたプールをシャッフルし25マス(中央マスの扱いはモード次第)に配置、中央曲との重複だけ排除。必要曲数不足なら都度alertで中断。
- 6. カード生成完了: ローダーが消えCanvas(520x520px、ジャケット画像+枠線+右下署名)が表示され、その下にHTMLテーブル(位置/ジャケット/曲名/ユニット/状態の5列)が生成される。同時にコピー/保存/シード発行ボタンが有効化。
- 7. テーブルの曲名セルをクリック→検索モーダルが開き(editingCellIndex=そのマスの番号)、選んだ曲でそのマスだけ差し替え(cleared状態はfalseにリセット)→カード全体（Canvas・テーブルとも）が再描画される。
- 8. テーブルの状態セルをクリック→そのマスのcleared(クリア済み/未プレイ)をトグル→カード全体を再描画。cleared時はCanvas上に斜め回転CLEAREDオーバーレイ、テーブル上はグレースケール画像＋赤文字CLEAREDバッジ＋行が薄赤背景・太字になる。
- 9. 『画像をコピー』→クリップボードへPNGコピー(成功/失敗をalert)。『画像を保存』→bingo_card.pngとしてダウンロード。『シードを発行』→現在のカード状態(clearedフラグ込み)をエンコードした50文字シード値をクリップボードにコピーし、値そのものをalertでも表示。
- 10. 生成ボタンを再度押すと（同モード・同条件でも）シャッフルにより異なるカードが再生成され、枠線色も新規抽選される（セル個別編集の場合は枠線色は維持）。

## 移植時の注意

- 最重要: 実際にサイトが読み込むのは BINGO_globals.js/BINGO_helpers.js/BINGO_draw.js/BINGO_events.js の4ファイル。BINGO_script.js(1019行)はHTMLから参照されないデッドコードなので、移植の一次資料として使うと『存在しない古いUX(例: drawBingoCard内にローダー制御が無い旧版)』を誤って再現するリスクがある。必ず4分割版のロジックを正とすること。
- 全てのグローバル変数(transformedMusics, aliasMapping, selectedUnits等のSet, currentCardData, currentBorderColor, editingCellIndex, fuse, centerSong)はスクリプトタグをまたぐトップレベル `let`/`const` に依存しており、モジュール化(ESM/バンドラ)する際は明示的なstate管理(useState/store等)への置換が必須。特に centerSong は『中央マスの指定曲』であると同時に『ランダム生成時の重複除外キー』としても使われる二重役割があるため、Reactの状態設計では役割を分離するか、free/randomモード選択時はこの重複除外を無効化するかを検討すべき（現行は centerMode に関わらず常に centerSong.id が除外される仕様＝要仕様確認）。
- decodeSeedValue が transformedMusics 配列内のオブジェクトを直接ミューテートする(song.cleared=cleared)。Reactで不変更新にする場合、この副作用はカード用に song のディープコピーを作る形へ変える必要がある（そうしないと、あるシードを読み込んだ後に同じ曲を含む別カード/別シードのcleared状態が意図せず変わる）。
- ランダム生成・セル差し替え双方で {...song, cleared:false} というシャローコピーを作っているが、categoriesが配列のため参照共有されたまま(通常は読み取り専用なので実害は薄いが、イミュータブル原則を厳密にするなら配列もコピーすべき)。
- filterSongs()はメイン画面のフィルタ要素(idがunitFilter等、実体は<div class="filter-buttons">のボタン群でvalueプロパティを持たない)とモーダル内<select>(id=modalUnitFilter等)を同名衝突気味に扱っており、`unitFilter.value !== undefined` の三項分岐は事実上常にfalse相当(divにvalueプロパティは存在しない)でmodal側の値だけが使われている疑いがある。移植時はメイン画面フィルタ(トグルボタン群のselectedUnits/selectedCategories/selectedMusicTypes)と検索モーダルの絞り込みは完全に別UIかつ別ロジック(検索モーダルはselect要素で'all'含む単一選択、メイン生成はSetによる複数選択トグル)と理解して設計し直すべきで、単純にfilterSongs()をそのまま移植すると混乱する。
- drawBingoCard/generateCardTableは『セルを1つ変える・clearedを1つトグルする』だけでもカード全体(Canvas全再描画+テーブル全再生成)を毎回フルリビルドする設計。React移植では各セルを独立コンポーネント化し、変更のあったセルだけ再レンダリングする設計に置き換えるのが自然だが、Canvas自体は依然全体再描画が必要(個別セルのCanvas部分描画APIは無い)。
- 画像読み込み失敗時(loadImage rejectやFREEアイコン読み込み失敗)はconsole.errorのみでユーザーへの通知がない(灰色矩形で代替表示されるだけ)。移植時はユーザー向けエラー表示を追加検討。
- シード値スキームは2文字=64進数で id(+cleared時2048)を符号化する固定長方式。実データ最大id=624なので現状は安全域内だが、将来的に楽曲idが2048を超えることは無い前提(3桁ゼロ埋め文字列という入力形式自体が999が上限)。移植時はこの前提(3桁固定・最大999）をバリデーションするか、より将来性のあるエンコーディング(例: idをそのまま16進や10進で区切り文字付き)に変えるかを検討する価値がある。
- GitHub Pages前提のパス依存: header.js内 fetch('/AssistTools/Pages/Header/header.html') がドメインルート配下'/AssistTools/'を絶対パスでハードコード。Netlifyでルートパスが変わるなら要修正（相対パスまたは環境変数化）。BINGO内の他のfetch/画像パスは全て相対パス('../../...')なので、ページの物理配置さえ揃えれば動くが、Reactアプリ化でルーティングが変わるとこれらの相対パスも再設計が必要(publicディレクトリ配下への静的アセット配置、import化などを検討)。
- loader(ローダー表示)はCSS(loader.css、SCSS由来)のkeyframeアニメーションで実装され、9個のdivそれぞれにSCSSの `random()` 関数で生成された固定のanimation-delay/durationがコンパイル時に埋め込まれている(loader.css内にハードコード値として現れる、例: nth-child(1)=delay -0.15s/duration 1.34s)。Reactに移植する場合はCSSアニメーションのまま流用するか、Framer Motion等で書き直すか検討要（現状値はビルド時ランダム値なので『仕様』ではなく単なる固定値、再現性重視なら好きな値に置換してよい）。
- colorCandidates(30色)はユニットごとに5色区切りでコメントされているが、実際の抽選はグループを無視して30色全体からMath.random()で1色を選ぶだけ(ユニットとの対応関係は保証されない、単なる『見た目のバリエーション用パレット』)。
- About_BINGO_Generator.html の使い方説明には未実装の'指定(曲)'/'指定(完全)'モードの説明が残っている(実際のUIではボタン自体がHTML上コメントアウトされ存在しない)。移植時は現行の実装済み機能(ランダム/シード値の2モードのみ)に合わせてドキュメントも更新する必要がある。
- 謝辞: 匿名M(@tkmei_M)氏の『チアフルビンゴ自動生成シート』を参考にした旨がAboutページに明記されている。第三者名として匿名化の要否は本人の公開Twitterハンドル+既に公開されたクレジット表記なので、この報告書中ではそのまま引用したが、brain側judgment/projects等に恒久保存する場合はCLAUDE.mdの第三者匿名化ルールとの整合を確認すること。
