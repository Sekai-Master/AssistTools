// ② liveBonusMultipliersをグローバル変数として定義
const liveBonusMultipliers = [1, 5, 10, 15, 20, 25, 27, 29, 31, 33, 35];

/**
 * イベントポイントを計算する関数（整数演算版）
 * 浮動小数点数による計算誤差を避けるため、すべての計算を整数で行います。
 */
function calculateEventPoint(score, eventBonus, basePoint = 100, liveBonusIndex = 0) {
    const liveBonus = liveBonusMultipliers[liveBonusIndex];
    const scoreComponent = Math.floor(score / 20000);

    // 1. 基礎となるポイントを計算
    const baseEventPoint = 100 + scoreComponent;

    // 2. イベントボーナスを適用
    // eventBonusはパーセント値 (例: 410, 410.25)
    // 誤差をなくすため、100倍して整数に変換 (例: 410.25 -> 41025)
    const integerEventBonus = Math.round(eventBonus * 100);

    // floor(基礎ポイント * (1 + eventBonus/100)) の計算を整数で行う
    // = floor(baseEventPoint * (10000 + integerEventBonus) / 10000)
    const bonusIncludedBasePoint = Math.floor((baseEventPoint * (10000 + integerEventBonus)) / 10000);

    // 3. 楽曲基礎ポイント(basePoint)を適用
    // floor(ボーナス適用後ポイント * (basePoint / 100)) の計算を整数で行う
    const basePointApplied = Math.floor((bonusIncludedBasePoint * basePoint) / 100);

    const totalPoint = basePointApplied * liveBonus;
    return totalPoint;
}

function generateScoreList(eventBonus, basePoint = 100, maxScore) {
    const scoreList = [];
    if (maxScore > 3000000) {
        maxScore = 3000000;
    }
    // LB最大消費量のスライダー値を取得（例：スライダーが8なら 8＋1 = 9 個を利用）
    const rsRange = document.getElementById("rs-range-line");
    const maxLBConsumption = parseInt(rsRange.value, 10) + 1; // 使用するliveBonusの項目数

    for (let score = 0; score < maxScore; score += 20000) {
        for (let liveBonusIndex = 0; liveBonusIndex < maxLBConsumption; liveBonusIndex++) {
            const scoreUpper = score + 20000 - 1;
            const lowerResult = calculateEventPoint(score, eventBonus, basePoint, liveBonusIndex);
            const upperResult = calculateEventPoint(scoreUpper, eventBonus, basePoint, liveBonusIndex);
            if (lowerResult === upperResult) {
                scoreList.push({
                    scoreLower: score,
                    scoreUpper: scoreUpper,
                    result: lowerResult,
                    liveBonusIndex: liveBonusIndex
                });
            }
        }
    }
    return scoreList;
}

function canMakeSum(target, scoreList) {
    const dp = new Array(target + 1).fill(false);
    const combination = new Array(target + 1).fill(null);
    dp[0] = true;
    combination[0] = [];

    for (let i = 0; i <= target; i++) {
        if (dp[i]) {
            for (let item of scoreList) {
                const num = item.result;
                if (i + num <= target) {
                    if (!dp[i + num] || combination[i + num].length > combination[i].length + 1) {
                        dp[i + num] = true;
                        combination[i + num] = [...combination[i], {
                            point: num,
                            scoreLower: item.scoreLower,
                            scoreUpper: item.scoreUpper,
                            liveBonus: liveBonusMultipliers[item.liveBonusIndex]
                        }];
                    }
                }
            }
        }
    }
    return dp[target] ? combination[target] : null;
}

function findPointAdjustment(currentPoints, targetPoints, eventBonus, basePoint = 100, maxScore = 2100000) {
    const pointDifference = targetPoints - currentPoints;

    if (pointDifference < 0) {
        return "目標ポイントは現在ポイントよりも大きな値を入力してください";
    }

    if (pointDifference > 100000) {
        return "目標ポイントにもっと近くなってから利用してください";
    }

    const scoreList = generateScoreList(eventBonus, basePoint, maxScore);
    const result = canMakeSum(pointDifference, scoreList);

    let resultText = `
<div class="result-summary">
    <div>
        <span>目標ポイント</span>
        <span id="targetPointsDisplay">${targetPoints.toLocaleString()} Pt</span>
    </div>
    <div>
        <span>現在のポイント</span>
        <span id="currentPointsDisplay">${currentPoints.toLocaleString()} Pt</span>
    </div>
    <div>
        <span>目標までの残り</span>
        <span id="pointDifferenceDisplay">${pointDifference.toLocaleString()} Pt</span>
    </div>
    <div>
        <span>イベントボーナス</span>
        <span>${eventBonus} %</span>
    </div>
</div>
`;

    if (!result) {
        resultText += `<div class="result-message">[${eventBonus}%]でのポイント調整は不可能でした。</div>`;
        const adjustments = [-10, -15, -20, -30, -50, -60, -75, -80, -100, -120, -140, -150, -160, -180, -200, -220, -240, -250, -260, -280, -300];
        let validAdjustments = [];
        let currentBonus = eventBonus;

        for (let i = 0; i < adjustments.length; i++) {
            currentBonus += adjustments[i];
            if (currentBonus < 0) break;
            const adjustedScoreList = generateScoreList(currentBonus, basePoint, maxScore);
            const adjustedResult = canMakeSum(pointDifference, adjustedScoreList);
            if (adjustedResult) {
                validAdjustments.push(currentBonus);
                if (validAdjustments.length === 4) break;
            }
        }

        if (validAdjustments.length > 0) {
            resultText += `<div class="result-message">調整可能なイベントボーナス値:</div><div class='result-container'>`;
            validAdjustments.forEach(adjustment => {
                resultText += `<div class="result-item"><span>[${adjustment}%]</span> <button onclick="updateEventBonus(${adjustment})">選択</button></div>`;
            });
            resultText += "</div>";
        } else {
            resultText += `<div class="result-message">イベントボーナス値の変更、または[詳細設定]から[最大スコア]の変更を検討してください。</div>`;
        }
        return resultText;
    }

    resultText += `<table class="result-table">
<thead>
    <tr>
        <th>✅</th>
        <th>#</th>
        <th>ポイント</th>
        <th>基礎ポイント</th>
        <th>スコア範囲</th>
        <th><img src="../../images/LB.png" alt="LB" class="lb-icon">消費</th>
        <th>LB効果</th>
    </tr>
</thead>
<tbody>`;

    result.forEach((step, i) => {
        const liveBonusIndex = liveBonusMultipliers.indexOf(step.liveBonus);
        const basePointApplied = step.point / step.liveBonus;
        resultText += `<tr>
<td><input type="checkbox" class="play-checkbox" data-point="${step.point}"></td>
<td>${i + 1}</td>
<td>${step.point}Pt</td>
<td>${Math.floor(basePointApplied)}Pt</td>
<td>[${step.scoreLower} ~ ${step.scoreUpper}]</td>
<td>${liveBonusIndex}個</td>
<td>${step.liveBonus}倍</td>
</tr>`;
    });

    resultText += `</tbody></table>`;
    return resultText;
}

let additionalChecks = 0;
let selectedFinalPointsBonus = 0; // 最終回モード用の選択されたボーナス

function findPointAdjustmentByFinalPoints(currentPoints, targetPoints, finalPoints, basePoint = 100, maxScore = 2100000, additionalChecks = 0) {
    const pointDifference = targetPoints - currentPoints;

    if (pointDifference < 0) {
        return "目標ポイントは現在ポイントよりも大きな値を入力してください";
    }
    if (pointDifference > 100000) {
        return "目標ポイントにもっと近くなってから利用してください";
    }

    let validAdjustments = [];
    let currentBonus = 435 - additionalChecks;
    while (validAdjustments.length < 8 + additionalChecks && currentBonus > 0) {
        const adjustedScoreList = generateScoreList(currentBonus, basePoint, maxScore);
        const finalPointResult = canMakeSum(finalPoints, adjustedScoreList);
        if (finalPointResult) {
            const remainingPoints = pointDifference - finalPoints;
            const adjustedResult = canMakeSum(remainingPoints, adjustedScoreList);
            if (adjustedResult) {
                validAdjustments.push(currentBonus);
            }
        }
        currentBonus -= 1;
    }

    let resultText = `
<div class="result-summary">
    <div>
        <span>目標ポイント</span>
        <span id="targetPointsDisplay">${targetPoints.toLocaleString()} Pt</span>
    </div>
    <div>
        <span>現在のポイント</span>
        <span id="currentPointsDisplay">${currentPoints.toLocaleString()} Pt</span>
    </div>
    <div>
        <span>目標までの残り</span>
        <span id="pointDifferenceDisplay">${pointDifference.toLocaleString()} Pt</span>
    </div>
    <div>
        <span>最終回獲得ポイント</span>
        <span>${finalPoints} Pt</span>
    </div>
    <div>
        <span>イベントボーナス</span>
        <span id="eventBonusDisplay">${selectedFinalPointsBonus} %</span>
    </div>
</div>
`;

    if (validAdjustments.length > 0) {
        resultText += `<div class="result-message">調整可能なイベントボーナス値:</div><div class='result-container'>`;
        validAdjustments.forEach(adjustment => {
            resultText += `<div class="result-item"><span>[${adjustment}%]</span> <button onclick="updateEventBonus(${adjustment})">選択</button></div>`;
        });
        resultText += "</div>";
        if (additionalChecks < 40) {
            resultText += `<button id="additionalCheckButton" onclick="additionalCheck()">追加検証</button>`;
        }
    } else {
        resultText += `<div class="result-message">複数の編成を利用したポイント調整、または[詳細設定]から[最大スコア]の変更を検討してください。</div>`;
    }

    return resultText;
}

function additionalCheck() {
    additionalChecks += 8;
    calculate();
}

function updateEventBonus(newEventBonus) {
    const mode = modeToggle.value;
    if (mode === 'eventBonus') {
        document.getElementById('eventBonus').value = newEventBonus;
        // イベントボーナス基軸モードの場合は再計算を呼び出す
        calculate();
    } else if (mode === 'finalPoints') {
        // 最終回獲得ポイント基軸モードの場合の処理
        selectedFinalPointsBonus = newEventBonus;

        // すでにresult-summary内にイベントボーナス表示があれば更新、なければ追加する
        const eventBonusDisplay = document.getElementById('eventBonusDisplay');
        if (eventBonusDisplay) {
            eventBonusDisplay.textContent = `${newEventBonus} %`;
        } else {
            const summaryDiv = document.querySelector('.result-summary');
            if (summaryDiv) {
                const newDiv = document.createElement('div');
                newDiv.innerHTML = `<span>イベントボーナス</span><span id="eventBonusDisplay">${newEventBonus} %</span>`;
                summaryDiv.appendChild(newDiv);
            }
        }

        // 調整内訳テーブルの表示
        const currentPoints = parseInt(convertToHalfWidth(currentPointsInput.value), 10);
        const targetPoints = parseInt(convertToHalfWidth(targetPointsInput.value), 10);
        const finalPoints = parseInt(convertToHalfWidth(finalPointsInput.value), 10);
        const basePoint = parseInt(convertToHalfWidth(basePointsInput.value), 10) || 100;
        const maxScore = parseInt(convertToHalfWidth(maxScoreInput.value), 10) || 2100000;
        const pointDifference = targetPoints - currentPoints;
        const scoreList = generateScoreList(newEventBonus, basePoint, maxScore);

        // 最初にfinalPoints達成のためのプレイを算出
        const finalPointResult = canMakeSum(finalPoints, scoreList);
        if (!finalPointResult) {
            resultDiv.innerHTML = "最終回獲得ポイントを達成するためのプレイが見つかりませんでした。";
            return;
        }

        // 残りのポイントを調整するプレイを算出
        const remainingPoints = pointDifference - finalPoints;
        const remainingResult = canMakeSum(remainingPoints, scoreList);
        if (!remainingResult) {
            resultDiv.innerHTML = "目標ポイントを達成するためのプレイが見つかりませんでした。";
            return;
        }

        // 結果テーブルの生成
        let resultText = `<table class="result-table">
<thead>
    <tr>
        <th>✅</th>
        <th>#</th>
        <th>ポイント</th>
        <th>基礎ポイント</th>
        <th>スコア範囲</th>
        <th><img src="../../images/LB.png" alt="LB" class="lb-icon">消費</th>
        <th>LB効果</th>
    </tr>
</thead>
<tbody>`;

        finalPointResult.forEach((step, index) => {
            const liveBonusIndex = liveBonusMultipliers.indexOf(step.liveBonus);
            const basePointApplied = step.point / step.liveBonus;
            resultText += `<tr>
<td><input type="checkbox" class="play-checkbox" data-point="${step.point}"></td>
<td>${index + 1}</td>
<td>${step.point}Pt</td>
<td>${Math.floor(basePointApplied)}Pt</td>
<td>[${step.scoreLower} ~ ${step.scoreUpper}]</td>
<td>${liveBonusIndex}個</td>
<td>${step.liveBonus}倍</td>
</tr>`;
        });

        remainingResult.forEach((step, index) => {
            const liveBonusIndex = liveBonusMultipliers.indexOf(step.liveBonus);
            const basePointApplied = step.point / step.liveBonus;
            resultText += `<tr>
<td><input type="checkbox" class="play-checkbox" data-point="${step.point}"></td>
<td>${finalPointResult.length + index + 1}</td>
<td>${step.point}Pt</td>
<td>${Math.floor(basePointApplied)}Pt</td>
<td>[${step.scoreLower} ~ ${step.scoreUpper}]</td>
<td>${liveBonusIndex}個</td>
<td>${step.liveBonus}倍</td>
</tr>`;
        });

        resultText += `</tbody></table>`;
        
        // 既存の調整表があれば削除する
        const oldTable = document.querySelector('.result-table');
        if (oldTable) {
            oldTable.remove();
        }

        // 挿入位置をresult-summaryの直後に設定
        const resultSummary = document.querySelector('.result-summary');
        if (resultSummary) {
            resultSummary.insertAdjacentHTML('afterend', resultText);
        } else {
            resultDiv.innerHTML += resultText;
        }
    }
}

function convertToHalfWidth(str) {
    return str.replace(/[！-～]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/　/g, " ");
}

function validateNumericInput(input) {
    const id = input.id;
    let value = input.value;
    let halfWidthValue = convertToHalfWidth(value);

    if (id === "eventBonus") {
        // eventBonus の場合は小数点2桁まで許可
        if (!/^\d+(\.\d{0,2})?$/.test(halfWidthValue)) {
            alert("イベントボーナスは整数または小数点第2位まで入力してください");
            input.value = "";
        } else {
            input.value = halfWidthValue;
        }
    } else {
        // その他のフィールドは整数のみ許可
        if (!/^\d+$/.test(halfWidthValue)) {
            alert("数値は半角整数で入力してください");
            input.value = "";
        } else {
            input.value = halfWidthValue;
        }
    }
}
function updatePoints() {
    const checkboxes = document.querySelectorAll('.play-checkbox');
    let playedPoints = 0;
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            playedPoints += parseInt(checkbox.getAttribute('data-point'), 10);
            checkbox.closest('tr').classList.add('played');
        } else {
            checkbox.closest('tr').classList.remove('played');
        }
    });

    const currentPoints = parseInt(convertToHalfWidth(currentPointsInput.value), 10) + playedPoints;
    const targetPoints = parseInt(convertToHalfWidth(targetPointsInput.value), 10);
    const pointDifference = targetPoints - currentPoints;

    document.getElementById('currentPointsDisplay').textContent = `${currentPoints.toLocaleString()} Pt`;
    document.getElementById('pointDifferenceDisplay').textContent = `${pointDifference.toLocaleString()} Pt`;
}

const currentPointsInput = document.getElementById('currentPoints');
const targetPointsInput = document.getElementById('targetPoints');
const eventBonusInput = document.getElementById('eventBonus');
const finalPointsInput = document.getElementById('finalPoints');
const modeToggle = document.getElementById('modeToggle');
const resultDiv = document.getElementById('result');
const eventBonusGroup = document.getElementById('eventBonusGroup');
const finalPointsGroup = document.getElementById('finalPointsGroup');
const basePointsInput = document.getElementById('basePoints');
const maxScoreInput = document.getElementById('maxScore');

function calculate() {
    const currentPoints = parseInt(convertToHalfWidth(currentPointsInput.value), 10);
    const targetPoints = parseInt(convertToHalfWidth(targetPointsInput.value), 10);
    const eventBonus = parseFloat(convertToHalfWidth(eventBonusInput.value));
    const finalPoints = parseInt(convertToHalfWidth(finalPointsInput.value), 10);
    const basePoint = parseInt(convertToHalfWidth(basePointsInput.value), 10) || 100;
    const maxScore = parseInt(convertToHalfWidth(maxScoreInput.value), 10) || 2100000;
    const mode = modeToggle.value;


    if (isNaN(currentPoints) || isNaN(targetPoints) || 
        (mode === 'eventBonus' && (isNaN(eventBonus) || eventBonus < 0)) || 
        (mode === 'finalPoints' && isNaN(finalPoints))) {
        resultDiv.textContent = "数値を入力してください";
        return;
    }

    let result;

    if (mode === 'eventBonus') {
        result = findPointAdjustment(currentPoints, targetPoints, eventBonus, basePoint, maxScore);
    } else if (mode === 'finalPoints') {
        result = findPointAdjustmentByFinalPoints(currentPoints, targetPoints, finalPoints, basePoint, maxScore, additionalChecks);
    }

    resultDiv.innerHTML = result;
}

document.addEventListener('DOMContentLoaded', function() {
    currentPointsInput.addEventListener('input', () => {
        validateNumericInput(currentPointsInput);
        calculate();
    });
    targetPointsInput.addEventListener('input', () => {
        validateNumericInput(targetPointsInput);
        calculate();
    });
    eventBonusInput.addEventListener('input', () => {
        validateNumericInput(eventBonusInput);
        calculate();
    });
    finalPointsInput.addEventListener('input', () => {
        validateNumericInput(finalPointsInput);
        calculate();
    });
    basePointsInput.addEventListener('input', () => {
        validateNumericInput(basePointsInput);
        calculate();
    });
    maxScoreInput.addEventListener('input', () => {
        validateNumericInput(maxScoreInput);
        calculate();
    });
    modeToggle.addEventListener('change', () => {
        if (modeToggle.value === 'eventBonus') {
            eventBonusGroup.style.display = 'block';
            finalPointsGroup.style.display = 'none';
        } else {
            eventBonusGroup.style.display = 'none';
            finalPointsGroup.style.display = 'block';
        }
        calculate();
    });

    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('play-checkbox')) {
            updatePoints();
        }
    });

    calculate();
});

var rangeSlider = document.getElementById("rs-range-line");
var rangeBullet = document.getElementById("rs-bullet");

rangeSlider.addEventListener("input", showSliderValue, false);

function showSliderValue() {
    rangeBullet.innerHTML = rangeSlider.value;
    var bulletPosition = (rangeSlider.value / rangeSlider.max);
    rangeBullet.style.left = (bulletPosition * rangeSlider.offsetWidth) + "px";
    // LB最大消費量の変更に伴い再計算を実施する
    calculate();
}

// ページ読み込み時にスライダーの位置を設定
document.addEventListener('DOMContentLoaded', function() {
    showSliderValue();
});