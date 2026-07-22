# 移植仕様: Point Analyzer (Pages/03_Point_Analyzer)

> 現行 vanilla 実装のキャプチャ（2026-07-22 調査）。React+Vite への移植時の正本。

**目的**: プロセカのイベントポイント調整ツール。「現在Pt」から「目標Pt」までの差分を、指定イベントボーナス%で何回ライブをプレイすれば過不足なく到達できるか（スコア範囲の組み合わせ）を動的計画法で逆算する。イベントボーナス基軸モードと最終回獲得ポイント基軸モードの2モードを持つ。

## 挙動（再現すべき）

- 入力: targetPoints(目標イベントポイント, number), currentPoints(現在のイベントポイント, number), modeToggle(select: 'eventBonus'|'finalPoints'), eventBonus(text, 初期値'350', 小数第2位まで許可), finalPoints(number, finalPointsモード時のみ), basePoints(number, 初期値100, 詳細設定・非表示), maxScore(number, 初期値1100000, 詳細設定・非表示), rs-range-line(range slider 0-10, 初期値10, LB最大消費量)
- 全入力欄はinputイベントで即時バリデーション(validateNumericInput)→calculate()を毎回フル実行（デバウンスなし）。全角→半角変換(convertToHalfWidth)を先にかけてから正規表現検証。不正なら alert() を出して該当欄を空文字にリセットする（値を残さない）
- eventBonusモード: findPointAdjustment()。pointDifference = targetPoints - currentPoints。負なら「目標ポイントは現在ポイントよりも大きな値を入力してください」を返して終了。100000超なら「目標ポイントにもっと近くなってから利用してください」を返して終了（=一度に埋められる差分は最大100,000Ptという設計上のハード上限）
- generateScoreList(eventBonus, basePoint, maxScore): maxScoreを3,000,000に上限クリップ。score=0から20000刻みでmaxScoreまで、liveBonusIndex=0..(スライダー値+1)まで（DOM読み取りに直接依存）ループし、calculateEventPoint(score)===calculateEventPoint(score+19999)となる『スコア帯』のみ採用（帯内で同一Ptになる保証）。この二重ループの計算量はO(maxScore/20000 * (slider+1))
- canMakeSum(target, scoreList): 0..targetの各値についてDP配列dp[]/combination[]を構築する部分和問題（無制限ナップサック的、同じscoreList要素を何度でも使える）。ヒューリスティックとして『同じPt合計に到達する組み合わせのうち手数(length)が最小になる方』を優先して上書き（combination[i+num].length > combination[i].length+1 の比較）。target Ptちょうどを作れなければnullを返す＝『不可能』
- 不可能時のフォールバック: adjustments = [-10,-15,-20,-30,-50,-60,-75,-80,-100,-120,-140,-150,-160,-180,-200,-220,-240,-250,-260,-280,-300] を順に累積加算してeventBonusを下げていき（currentBonus += adjustments[i]、累積なので回を追うごとにより大きく下がる）、負になったら打ち切り。各段階でgenerateScoreList+canMakeSumを再実行し、成立するボーナス値を最大4件集めてvalidAdjustmentsに積む。0件ならメッセージのみ、1件以上なら選択ボタン（onclick=updateEventBonus(bonus)）付きで提示
- 成功時: 結果テーブルをHTML文字列で生成。各行にチェックボックス(data-point属性にPt値)、連番、Pt、基礎ポイント(point/liveBonus)、スコア範囲[lower~upper]、LB消費個数(liveBonusMultipliers.indexOf(liveBonus))、LB倍率を表示
- finalPointsモード: findPointAdjustmentByFinalPoints()。pointDifference計算・エラー条件はeventBonusモードと同一。currentBonus=435-additionalChecksから1ずつ減らしながら、finalPoints分をcanMakeSumできて、かつ残り(pointDifference-finalPoints)分もcanMakeSumできるボーナス値を探索し、8+additionalChecks件たまるかcurrentBonusが0以下になるまで続ける。見つかったボーナス値のリストをvalidAdjustmentsとして選択ボタン提示。additionalChecks<40なら『追加検証』ボタンを出し、押すとadditionalChecks+=8して再calculate()（つまり探索を8段階ずつ深くする）
- updateEventBonus(bonus): eventBonusモードでは入力欄に値をセットして即calculate()。finalPointsモードでは選択された値をselectedFinalPointsBonus変数に保持し、result-summary内のeventBonusDisplayを更新（無ければ追加）した上で、finalPoints分・残り分それぞれのcanMakeSumを再実行し、2つの結果テーブルを連結して既存の.result-tableを置換表示する（この分岐だけ他と独立した描画パスを持つ）
- プレイ済みチェックボックス(updatePoints): チェックが入った行のdata-point合計をcurrentPointsInputの値に加算し、currentPointsDisplay/pointDifferenceDisplayをその場で更新（再計算=calculate()は呼ばない。DOM直接書き換えのみ、行にplayedクラス付与で取り消し線表示）
- LB最大消費量スライダー: input時にrangeBulletのテキストと絶対位置(px、offsetWidthベース)を更新しcalculate()を呼ぶ。DOMContentLoaded時にも初期位置表示のためshowSliderValue()を1回実行

## ロジック・計算式・定数

- liveBonusMultipliers = [1,5,10,15,20,25,27,29,31,33,35] (analyzer_script.js:2)。※Analyzer_test.js:2は古い値[1,5,10,15,19,23,26,29,31,33,35]のまま（2024-09-28のゲーム側改定：4番目20/25/27等に未追従）。本番ページで使われるのはanalyzer_script.js側なので現行値は正しいが、テストファイルは陳腐化した参照実装であり移植時に真似てはいけない
- calculateEventPoint(score,eventBonus,basePoint,liveBonusIndex) analyzer_script.js:8-30: scoreComponent=floor(score/20000); baseEventPoint=100+scoreComponent; integerEventBonus=round(eventBonus*100); bonusIncludedBasePoint=floor(baseEventPoint*(10000+integerEventBonus)/10000); basePointApplied=floor(bonusIncludedBasePoint*basePoint/100); totalPoint=basePointApplied*liveBonus。全て整数演算に落として浮動小数点誤差を回避した設計（コメントに明記）
- React版 calcLivePt.ts:42-58 の式: step1=floor(score/20000); bonus100x=round(bonus*100); numerator=(step1+100)*(bonus100x+10000)=val2*10000; step2x10=floor(numerator/1000)=floor(val2*10)  ←ここが小数第1位を保持する中間ステップ; step3=floor(step2x10*base/1000)=floor(step2*base/100); 結果=step3*multiplier。これはvanilla版のbonusIncludedBasePoint計算と『floor(基礎Pt*(1+bonus/100))を小数第1位まで保持してから基礎点を掛ける』点で数学的に異なる可能性がある——vanilla版はboundIncludedBasePointをそのまま整数化(floor)してからbasePointを掛けるのに対し、React版はvalに10を掛けてfloorしてから(=小数第1位切り捨てで止め)basePointを掛ける2段floor構造。React版コメント(calcLivePt.ts:34-37)によれば『小数第1位まで保持』が実機実測(base=114, score=1224240でPt=946)で確定した仕様であり、base=100(独りんぼエンヴィー基準)では両方式が数学的に同値になるため、vanilla版がbase≠100の場合に正しい値を出せているかは要検証。移植時はReact版のcalcLivePt.tsを正とする（ユーザー指示にも明記の通り実測値検証済み）
- generateScoreList: score+20000-1が『帯の上限』。lowerResult(score)とupperResult(score+19999)が一致する帯だけ採用するのはvanilla/React共通の考え方だが、React版はMAX_SCORE_N=200固定・SCORE_STEP=20000で最大4,000,000までカバー(constants.ts:9-16)する一方、vanilla版はmaxScore(UIの詳細設定、既定1,100,000、内部で3,000,000にクリップ)までしかループしない。この探索上限の違いは大きなスコア帯を要する高倍率ボーナス時に結果の差になりうる
- vanilla版のライブボーナス消費個数(rs-range-line)は0〜10(スライダー)で、liveBonusIndexのループ範囲がDOMのslider.value+1に直接依存(analyzer_script.js:38-39)——グローバルDOM要素への直接参照であり、関数の純粋性がない（テスト困難・移植時は引数として渡す設計にすべき）
- findPointAdjustment: pointDifference>100000で『目標ポイントにもっと近くなってから利用してください』は、DPのcanMakeSum(target=pointDifference,...)の配列サイズがtarget+1であることに起因するハード上限とみられる（100,000を超えると配列/計算コストが跳ね上がるため）。この上限値自体は仕様というより実装都合の可能性が高く、移植時に緩和するか要確認
- findPointAdjustmentByFinalPoints: currentBonus初期値が435固定(analyzer_script.js:196)。React版はこの435%ハードコードを撤廃し、ユーザーの実効ボーナスを上限にexploreする設計に変更済み（constants.ts:31-36のコメントに経緯明記：ワールドリンク開催中は実効700%超があり得るため）。vanilla版のこの435固定は既知の限界としてそのまま移植しない
- canMakeSumのDPは『到達可能性』のみ厳密で、『手数最小』は貪欲的比較（同じiに複数回combinationを更新するループの中で長さ比較するだけなので、真の最小手数を保証しない可能性がある＝scoreListの走査順に依存した近似）。移植時は意図的な仕様か要確認（コメントなし）

## データ依存

- vanilla版(analyzer_script.js)は楽曲マスタデータ(MusicDatas/*)を一切参照しない。basePointはユーザーが手入力する数値のみ（詳細設定のbasePoints、既定100）。楽曲選択UIは存在しない
- React版はsrc/data/transformedMusics.json（+aliasMapping.json, deletedSongs.json, limitedTimeMusics.json）から楽曲リストを取得し、ラストラン曲の基礎点を自動解決する（calculator.ts:136-142, SongSelector.tsx）。musicSources.tsが実測値(verifiedBasePoints.ts) > 取得データ > 同梱データの優先順位でマージする
- React版のfallbackMusics()は636曲超のソート・重複排除処理をキャッシュして初回のみ実行(calculator.ts:38-48)

## 外部依存

- ../../common.css, ../Header/header.css, analyzer_style.css（読み込み順でカスケード）
- ../Header/header.js (defer) — ヘッダー/ナビを動的挿入。/AssistTools/ パス固定に依存している可能性大（他ページと共通）
- Google Fonts: preconnect fonts.googleapis.com / fonts.gstatic.com, family=M+PLUS+Rounded+1c&display=swap
- favicon: ../../images/icon.jpeg
- LBアイコン画像: ../../images/LB.png（結果テーブルのヘッダーに<img>直書き、file:point_analyzer.html及びanalyzer_script.js:158,312で相対パス直参照）
- CSS変数: --vivid-bad-squad, --azusawa-kohane, --shiraishi-anne, --shinonome-akito, --aoyagi-toya は ../../common.css (32-36行目) で定義されたキャラクターカラー。analyzer_style.cssはこれらを--unit-corlor(スペルミスに注意、'color'ではなく'corlor')や--member-color-01〜04にマッピングして使用
- React版: localStorage key 'pa.env.v1'（総合力/ボーナス/ワールドパス/最終曲。イベント間で不変な設定）、sessionStorage key 'pa.pts.v1'（現在Pt/目標Pt/最終回Pt。タブを閉じたら消す）。globalThis.localStorage/sessionStorageのgetter自体がSecurityErrorを投げる環境(Cookieブロック)に対しsafeStorage()でtry/catchガード必須
- React版: window.location.hash による簡易ルーティング（#about ⇔ メイン画面）

## UXフロー

- 1. 目標イベントポイント・現在のイベントポイントを入力
- 2. モード選択（イベントボーナス基軸 / 最終回獲得ポイント基軸）。デフォルトはeventBonus、切替でeventBonusGroup⇔finalPointsGroupのdisplay:block/noneをトグル
- 3a. eventBonusモード: イベントボーナス%を入力（初期値350、テキスト欄、小数第2位まで）
- 3b. finalPointsモード: 最終回獲得ポイントを入力（このモードではボーナス値自体を探索するのでeventBonus欄は使わない）
- 4. （任意）Advance-Mode詳細設定を開く：基礎点(既定100)・Max Score(既定1,100,000)・LB最大消費量スライダー(0-10)。HTML上は`.advanced`にstyle="display:none"がベタ書きされておりCSSでは表示トリガーが見当たらない＝現状UIから開けない可能性がある要確認ポイント
- 5. 各入力欄はinputイベントで即時バリデーション→即時再計算（ボタン押下不要、全キャストロークで全処理再実行）
- 6. 結果: サマリー(目標/現在/残り/ボーナスorLB情報)＋成立時は達成プランのテーブル（各行チェックボックス付き）、不成立時は代替ボーナス候補ボタン
- 7. 代替ボーナス候補ボタンをクリック(updateEventBonus)→ eventBonusモードなら入力欄を書き換えて全体再計算、finalPointsモードならそのボーナスでのプラン内訳を直接テーブルとして挿入表示
- 8. finalPointsモードでヒットが少ない場合『追加検証』ボタンで探索範囲を段階的に拡張（+8ずつ、最大additionalChecks<40まで）
- 9. 結果テーブルの各行チェックボックスにチェックを入れると『プレイ済み』としてPt加算・行に取り消し線（updatePoints、再計算はせずサマリー数値のみその場更新）

## 移植時の注意

- 最大の相違点: vanilla版のcalculateEventPointとReact版calcLivePt.tsは数式の丸め処理の段数が異なる（『ボーナス適用後の値をどこでfloorするか』）。base=100(独りんぼエンヴィー)では同値になり見分けがつかないため、この食い違いはvanilla版のテスト・実運用で表面化していない可能性が高い。React版は実機実測(base=114)で確定させた式なのでこちらを正としてポーティングし、vanilla独自式は採用しない
- vanilla版はDOM要素(rs-range-line等)への直接参照をgenerateScoreList内で行っており(analyzer_script.js:38-39)、関数が副作用/グローバル状態に依存。React化では引数として明示的に渡す（すでにReact版はliveBonusesを引数化・scoreSearch.tsに共通化済みなのでその設計をそのまま踏襲すればよい）
- vanilla版のfindPointAdjustmentByFinalPointsは currentBonus=435 のハードコードで探索上限を決めている。React版はこれを撤廃し『ユーザーの現在ボーナス値を上限に、ユーザーが自分の編成より高いボーナスを出すことはできない』という考え方に変更（finalRun.ts:19-25のコメント参照）。移植時は435固定を再現せずReact版の可変上限方式を採用すべき
- pointDifference>100000で『不可能』と即エラーにする設計はDPの計算量制約から来ている可能性が高い。React版はこの種のハード上限は見当たらず(collectScorePlansはO(N)のスコア帯探索、DPの部分和ではなく直接解を求める設計に変わっている)。vanilla版のDP(canMakeSum)方式とReact版のcollectScorePlans+finalRun/liveAdjust方式はアルゴリズムそのものが別物——vanilla版は『任意個数の任意プランの組み合わせで目標Ptちょうどを作る』一般部分和問題、React版は『マイセカイ配分で大部分を埋め、ライブでの端数調整は独りんぼエンヴィー基礎点固定・ライブボーナス0〜1消費のみに限定した狭い探索』に設計思想が変わっている。単純な機能移植ではなく、React版はそもそも計算モデル自体（マイセカイ採取配分を主軸にした v6 モデル）が刷新されているため、vanilla版のDP方式を1:1移植するのではなくcalculator.ts/mySekai.ts/liveAdjust.ts/finalRun.tsの新モデルをそのまま持ってくる、というユーザー指示の方針が正しい
- vanilla版のcanMakeSumは『手数最小』を狙うが正確な最小性を保証しないヒューリスティック。React版はDPを使わず個別プラン列挙+UIでの提示順管理（scoreSearch.tsのbonusOuterでpush順を厳密に固定）という別アプローチなので、vanilla版のDP的な『複数プレイの組み合わせ最適化』機能自体はReact版に存在しない可能性がある。もしその『複数曲の組み合わせで目標Ptちょうどに合わせる』機能自体が要件に残っているなら、React版のどのモジュールが担うのか要確認（LiveAdjustSection.tsx等の実装を見る必要あり、今回は未読）
- vanilla版の詳細設定(Advance-Mode)はCSSで`display:none`がインラインスタイルとして固定されており、開閉トリガーのJSが見当たらない（グローバル検索で確認要）。移植時にこれが単なる未実装/デッドUIなのか、削除された機能なのか要確認
- .advanced内のbasePoints初期値100・maxScore初期値1,100,000という既定値はReact版のDEFAULT_BASE_POINT=100と一致するが、maxScoreの概念はReact版ではMAX_SCORE_N=200(=4,000,000点相当)という固定探索上限に置き換わっており、ユーザーが変更できるUI要素としては存在しない模様（constants.tsコメント参照）
- analyzer_style.cssの--unit-corlor はスペルミス（'color'ではなく'corlor'）。移植時に変数名を新規に切るなら踏襲しない方がよいが、既存CSSとの互換を取るなら注意
- Analyzer_test.js は現行のanalyzer_script.jsとは別実装（liveBonusMultipliers含め古い値を使用、Node実行のconsole.logベースの手動テストでJestなど不使用）。移植の参照実装として使うと2024-09-28以前の誤った倍率を持ち込むリスクがあるため、real spec sourceとしてはanalyzer_script.jsのみを正とすること
- vanilla版はcurrentPointsInput等をDOMContentLoaded後に取得するグローバル変数として定義(analyzer_script.js:413-422)。calculate()関数自体もこれらグローバル変数に依存しており、単体テスト不可能な構造。React化では既にstateベースに置き換わっている(App.tsx)ので新規移植の心配は無いが、『vanilla版の挙動を正確に再現する』という要求に対しては、これらグローバル依存が『いつ計算が走るか』の実際の条件（全部の欄がPromiseなしで同期的に揃っていなくてもcalculate()は毎回走り、isNaNチェックで弾く）を再現する必要がある
- updateEventBonus()のfinalPointsモード分岐は、他の再計算パスと完全に独立したDOM書き換えロジック（既存.result-tableをquerySelectorで探して丸ごとremove→insertAdjacentHTMLで挿入）になっており、状態not-single-source-of-truthな設計。React版でこれに相当するのはLiveAdjustSection.tsxのプラン選択状態(selectedPlan)だと思われるが、今回未読のため機能マッピングの一対一対応は要検証
