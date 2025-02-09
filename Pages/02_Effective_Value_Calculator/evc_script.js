// 要素の取得
const leaderSkillInput = document.getElementById('leader-skill');
const innerValueInput = document.getElementById('inner-value');
const effectiveValueInput = document.getElementById('effective-value');
const opLeaderSkillInput = document.getElementById('op_leader-skill');
const modeToggle = document.getElementById('mode-toggle');
const leaderSkillGroup = document.getElementById('leader-skill-group');
const innerValueGroup = document.getElementById('inner-value-group');
const effectiveValueGroup = document.getElementById('effective-value-group');
const opLeaderSkillGroup = document.getElementById('op_leader-skill-group');
const resultDisplay = document.getElementById('result');
const characterRankArea = document.getElementById('character-rank-area');
const characterRankInput = document.getElementById('character-rank');
const customInputArea = document.getElementById('custom-input-area');
const trainingSelection = document.getElementById('training-selection');
const characterTypeSelection = document.getElementById('character-type-selection');
const calculatedSkillValueDisplay = document.getElementById('calculated-skill-value');
const detailToggle = document.getElementById('detail-toggle');
const detailInputArea = document.getElementById('detail-input-area');
const innerValueInput2 = document.getElementById('inner-value-2');
const innerValueInput3 = document.getElementById('inner-value-3');
const innerValueInput4 = document.getElementById('inner-value-4');
const innerValueInput5 = document.getElementById('inner-value-5');
const ocSkillLevelArea = document.getElementById('oc-skill-level-area');
const ocSkillLevelSelect = document.getElementById('oc-skill-level');
const calculatedOCSkillValueDisplay = document.getElementById('calculated-oc-skill-value');

// ボタン要素の取得
const leaderSkillUpButton = document.getElementById('leader-skill-up');
const leaderSkillDownButton = document.getElementById('leader-skill-down');
const innerValueUpButton = document.getElementById('inner-value-up');
const innerValueDownButton = document.getElementById('inner-value-down');
const opLeaderSkillUpButton = document.getElementById('op_leader-skill-up');
const opLeaderSkillDownButton = document.getElementById('op_leader-skill-down');
const skillButtons = document.querySelectorAll('.skill-buttons button');
const trainingButtons = document.querySelectorAll('#training-selection button');
const unitButtons = document.querySelectorAll('.unit-buttons button');
const vsSkillLevelSelect = document.getElementById('vs-skill-level');
const calculatedVSSkillValueDisplay = document.getElementById('calculated-vs-skill-value');
const unitSelection = document.getElementById('unit-selection');

// 特訓前オリジナルキャラクターの基礎値と上限値
const ocBaseSkillValues = [60, 65, 70, 80];
const ocSkillValueLimits = [120, 130, 140, 150];

// 初期状態を設定
modeToggle.checked = false;

// 特訓前オリジナルキャラクターの計算結果を保持するグローバル変数
let possibleSkillValues = [];



// 全角数字を半角数字に変換する関数
function toHalfWidth(str) {
  return str.replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
}

// スキルレベルに応じた基礎値を取得する関数 (特訓後)
function getBaseSkillValue(skillLevel) {
  switch (skillLevel) {
    case 1: return 90;
    case 2: return 95;
    case 3: return 100;
    case 4: return 110;
    default: return 110;
  }
}

// スキルレベルに応じた基礎値を取得する関数 (バーチャルシンガー特訓前)
function getVSBaseSkillValue(skillLevel) {
  switch (skillLevel) {
    case 1: return 70;
    case 2: return 75;
    case 3: return 80;
    case 4: return 90;
    default: return 90; 
  }
}

// スキルレベルに応じた基礎値を取得する関数 (特訓前オリジナルキャラクター)
function getOCBaseSkillValue(skillLevel) {
  switch (skillLevel) {
    case 1: return 60;
    case 2: return 65;
    case 3: return 70;
    case 4: return 80;
    default: return 80; 
  }
}

// 発動スキル値を更新する関数 (特訓後)
function updateSkillValue() {
  const characterRank = parseInt(toHalfWidth(characterRankInput.value)) || 0;
  const cappedCharacterRank = Math.min(characterRank, 100);
  const skillLevel = parseInt(document.getElementById('skill-level').value) || 1;
  const baseSkillValue = getBaseSkillValue(skillLevel);
  const skillValue = baseSkillValue + Math.floor(cappedCharacterRank / 2);
  calculatedSkillValueDisplay.textContent = skillValue;
  leaderSkillInput.value = skillValue;
  calculateInnerValueFromDetails(); // 内部値を再計算
  calculateEffectiveValue(); // 実効値を更新
}

// バーチャルシンガー特訓前の発動スキル値を更新する関数
function updateVSSkillValue() {
  const skillLevel = parseInt(vsSkillLevelSelect.value) || 1;
  const baseSkillValue = getVSBaseSkillValue(skillLevel);
  const selectedUnitCount = document.querySelectorAll('.unit-buttons button.active:not([data-unit="virtual_singer"])').length;
  const differentUnitCount = Math.min(selectedUnitCount, 2); // 最大2ユニットまで
  const skillValue = baseSkillValue + (30 * differentUnitCount); 
  calculatedVSSkillValueDisplay.textContent = Math.floor(skillValue);
  leaderSkillInput.value = Math.floor(skillValue);
  calculateInnerValueFromDetails(); // 内部値を再計算
  calculateEffectiveValue(); // 実効値を更新
}

// 特訓前オリジナルキャラクターのスキル値を計算する関数
function calculateOCSkillValue() {
  const skillLevel = parseInt(ocSkillLevelSelect.value) || 1;
  const baseSkillValue = getOCBaseSkillValue(skillLevel);
  const skillValueLimit = ocSkillValueLimits[skillLevel - 1];

  const innerValues = [
    parseFloat(toHalfWidth(innerValueInput2.value)) || 0,
    parseFloat(toHalfWidth(innerValueInput3.value)) || 0,
    parseFloat(toHalfWidth(innerValueInput4.value)) || 0,
    parseFloat(toHalfWidth(innerValueInput5.value)) || 0
  ];

  possibleSkillValues = innerValues.map(innerValue => { // グローバル変数に代入
    const calculatedSkillValue = baseSkillValue + Math.floor(innerValue / 2);
    return Math.min(calculatedSkillValue, skillValueLimit);
  });

  // 重複する値をカウント
  const skillValueCounts = {};
  possibleSkillValues.forEach(value => {
    skillValueCounts[value] = (skillValueCounts[value] || 0) + 1;
  });

  // 結果を文字列に整形 (150(2) のような形式に戻す)
  let resultText = possibleSkillValues
    .map(value => {
      const count = skillValueCounts[value];
      return count > 1 ? `${value}(${count})` : value;
    })
    .filter((value, index, self) => self.indexOf(value) === index) // 重複を除去
    .join(" or ");

  // 発動スキル値表示を更新
  calculatedOCSkillValueDisplay.textContent = resultText;
  leaderSkillInput.value = resultText; // 先頭スキル値入力欄にも表示

  // 内部値を再計算
  calculateInnerValueFromDetails();
  // 実効値を更新
  calculateEffectiveValue();
}

// 先頭スキル値と内部値から実効値を計算する関数
function calculateEffectiveValue() {
  if (!modeToggle.checked) {
    const leaderSkillValues = leaderSkillInput.value.split(" or ").map(value => {
      // 括弧書きがあれば除去して数値に変換
      return parseFloat(toHalfWidth(value.replace(/\(.*\)/, ''))) || 0;
    });
    const innerValue = parseFloat(toHalfWidth(innerValueInput.value)) || 0;

    // エラー処理: leaderSkillValues のいずれかが数値に変換できない場合
    if (leaderSkillValues.some(isNaN) || isNaN(innerValue)) {
      resultDisplay.innerHTML = `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">数値を入力してください</span>`;
      return;
    }

    const effectiveValues = leaderSkillValues.map(leaderSkill => {
      const effectiveValue = leaderSkill + (innerValue - leaderSkill) * 0.2;
      return Math.round(effectiveValue); // 整数値に変換
    });

    // 結果を文字列に整形
    let resultText = effectiveValues.join(" or ");

    // 実効値を表示
    displayResult(resultText);
  } else {
    resultDisplay.innerHTML = "";
  }
}

// 実効値から先頭/内部値を逆算する関数
function calculateFromEffectiveValue() {
  if (modeToggle.checked) {
    const effectiveValue = parseFloat(toHalfWidth(effectiveValueInput.value)) || 0;
    const opLeaderSkill = parseFloat(toHalfWidth(opLeaderSkillInput.value)) || 0;

    if (opLeaderSkill === 0) {
      const skillLevels = [150, 140, 130, 120, 110, 100, 160];
      let resultHTML = '';

      skillLevels.forEach((skillLevel, index) => {
        const innerValue = ((effectiveValue - skillLevel) / 0.2) + skillLevel;

        if (innerValue < skillLevel) {
          resultHTML += `<p>先頭スキル値が <span style="font-weight: bold;">${skillLevel}</span>の場合：実効値を再確認してください</p>`;
        } else {
          if (innerValue > skillLevel + 640) {
            const breakWord = window.innerWidth <= 768 ? "<br>" : " ";
            resultHTML += `<p>先頭スキル値が <span style="font-weight: bold;">${skillLevel}</span>の場合：${breakWord}該当内部値はありません</p>`;
          } else {
            if (innerValue > skillLevel + 600 && innerValue <= skillLevel + 640) {
              const breakWord = window.innerWidth <= 768 ? "<br>" : " ";
              resultHTML += `<p>先頭スキル値が <span style="font-weight: bold;">${skillLevel}</span>の場合：${breakWord}内部値は <span style="font-weight: bold; background-color: #FFAACC; padding: 5px 10px; border-radius: 5px;">${innerValue.toFixed(1)}</span> です。<br>(ブルフェスメンバーを含む編成です)</p>`;
            } else {
              const breakWord = window.innerWidth <= 768 ? "<br>" : " ";
              resultHTML += `<p>先頭スキル値が <span style="font-weight: bold;">${skillLevel}</span>の場合：${breakWord}内部値は <span style="font-weight: bold; background-color: #FFAACC; padding: 5px 10px; border-radius: 5px;">${innerValue.toFixed(1)}</span> です。</p>`;
            }
          }
        }

        if (index < skillLevels.length - 1) {
          resultHTML += '<hr>';
        }
      });

      resultDisplay.innerHTML = resultHTML;
    } else {
      const innerValue = ((effectiveValue - opLeaderSkill) / 0.2) + opLeaderSkill;

      if (innerValue < opLeaderSkill) {
        resultDisplay.innerHTML = `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">実効値を再確認してください</span>`;
      } else {
        if (innerValue > opLeaderSkill + 640) {
          resultDisplay.innerHTML = `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">該当内部値はありません</span>`;
        } else {
          let resultHTML = '';

          if (innerValue > opLeaderSkill + 600 && innerValue <= opLeaderSkill + 640) {
            resultHTML += `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">内部値は <span style="font-weight: bold; background-color: #FFAACC; padding: 5px 10px; border-radius: 5px;">${innerValue.toFixed(1)}</span> です。</span><br>`;
            resultHTML += `<span style="font-size: 18px; color: white; text-shadow: 2px 2px 4px black;">ブルフェスメンバーを含む編成です</span>`;
          } else {
            resultHTML += `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">内部値は <span style="font-weight: bold; background-color: #FFAACC; padding: 5px 10px; border-radius: 5px;">${innerValue.toFixed(1)}</span> です。</span>`;
          }

          resultDisplay.innerHTML = resultHTML;
        }
      }
    }
  } else {
    resultDisplay.innerHTML = "";
  }
}

// 結果表示を行う関数
function displayResult(value, isReverseMode = false) {
  const breakWord = window.innerWidth <= 768 ? "<br>" : " ";
  if (isReverseMode) {
    resultDisplay.innerHTML = `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">内部値は${breakWord}<span style="font-weight: bold; background-color: #FFAACC; padding: 5px 10px; border-radius: 5px;">${value.toFixed(1)}</span> です。</span>`;
  } else {
    resultDisplay.innerHTML = `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">この編成の実効値は${breakWord}<span style="font-weight: bold; background-color: #99EEDD; padding: 5px 10px; border-radius: 5px;">${value}</span> です。</span>`;
  }
}

// 特訓前オリジナルキャラクターの実効値を表示する関数
function displayResultForOC() {
  const innerValue = parseFloat(toHalfWidth(innerValueInput.value)) || 0;
  const effectiveValues = possibleSkillValues.map(skillValue => {
    return Math.round(skillValue + (innerValue - skillValue) * 0.2); // 整数値に変換
  });

  // 4値の平均値を計算
  const averageEffectiveValue = Math.round(effectiveValues.reduce((sum, value) => sum + value, 0) / effectiveValues.length);

  // 重複する実効値をカウント
  const effectiveValueCounts = {};
  effectiveValues.forEach(value => {
    effectiveValueCounts[value] = (effectiveValueCounts[value] || 0) + 1;
  });

  // 実効値を表示する文字列を作成
  let resultText = effectiveValues
    .map(value => {
      const count = effectiveValueCounts[value];
      return count > 1 ? `${value}(${count})` : value;
    })
    .filter((value, index, self) => self.indexOf(value) === index)
    .join(" or ");

  const breakWord = window.innerWidth <= 768 ? "<br>" : " ";
  resultDisplay.innerHTML = `<span style="font-size: 24px; color: white; text-shadow: 2px 2px 4px black;">この編成の実効値は<br><span style="font-weight: bold; background-color: #99EEDD; padding: 5px 10px; border-radius: 5px;">${resultText}</span> ${breakWord}<span style="font-weight: bold; background-color: #99EEDD; padding: 5px 10px; border-radius: 5px;">(平均: ${averageEffectiveValue})</span>です。</span>`;
}

// ボタンの選択状態を変更する関数
function updateButtonSelection(value) {
  skillButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.value === value);
  });
}

// モード切り替え時の表示処理を行う関数
function toggleMode() {
  if (modeToggle.checked) {
    leaderSkillGroup.style.display = 'none';
    innerValueGroup.style.display = 'none';
    characterRankArea.style.display = 'none';
    ocSkillLevelArea.style.display = 'none'; // オリジナルキャラクターのスキルレベルエリアも非表示にする
    effectiveValueGroup.style.display = 'block';
    opLeaderSkillGroup.style.display = 'block';
    resultDisplay.textContent = "";
  } else {
    leaderSkillGroup.style.display = 'block';
    innerValueGroup.style.display = 'block';
    effectiveValueGroup.style.display = 'none';
    opLeaderSkillGroup.style.display = 'none';
    calculateEffectiveValue();
  }
}

// 詳細入力の表示/非表示を切り替える関数
function toggleDetailInput() {
  detailInputArea.style.display = detailToggle.checked ? 'flex' : 'none';

  // 個別スキル値入力のオン/オフに応じて内部値入力欄の有効/無効を切り替える
  innerValueInput.disabled = detailToggle.checked; 

  if (detailToggle.checked) {
    // 個別スキル値入力欄が表示されたら、内部値を再計算
    calculateInnerValueFromDetails(); 
  } else {
    // 個別スキル値入力欄が非表示になったら、内部値入力欄の値をクリア
    innerValueInput.value = '';
  }
}

// 個別スキル値から内部値を計算する関数
function calculateInnerValueFromDetails() {
  if (detailToggle.checked) {
    // 括弧と数字を削除してから数値に変換
    const leaderSkillValues = leaderSkillInput.value.split(" or ").map(value => {
      return parseFloat(toHalfWidth(value.replace(/\(\d+\)/, ''))) || 0;
    });
    const leaderSkill = leaderSkillValues.reduce((sum, value) => sum + value, 0);

    const innerValue2 = parseFloat(toHalfWidth(innerValueInput2.value)) || 0;
    const innerValue3 = parseFloat(toHalfWidth(innerValueInput3.value)) || 0;
    const innerValue4 = parseFloat(toHalfWidth(innerValueInput4.value)) || 0;
    const innerValue5 = parseFloat(toHalfWidth(innerValueInput5.value)) || 0;

    const totalInnerValue = leaderSkill + innerValue2 + innerValue3 + innerValue4 + innerValue5;

    innerValueInput.value = totalInnerValue;
    calculateEffectiveValue(); // 内部値が変更されたら実効値も再計算
  }
}

// ブルフェス特訓前オリジナルキャラクターが選択されている場合に発動スキル値、内部値、実効値を更新する関数
function updateOCSkillValueIfNeeded() {
  if (
    document.querySelector('.skill-buttons button[data-value="bluefes"]').classList.contains('active') &&
    document.querySelector('#training-selection button[data-value="before"]').classList.contains('active') &&
    document.querySelector('#character-type-selection button[data-value="original-character"]').classList.contains('active')
  ) {
    // 発動スキル値を更新
    calculateOCSkillValue();

    // 内部値を更新 (最大値のみを表示)
    const maxSkillValue = Math.max(...possibleSkillValues); // グローバル変数を使用
    innerValueInput.value = (parseFloat(toHalfWidth(innerValueInput.value)) || 0) + maxSkillValue;

    // 実効値を更新
    displayResultForOC(); // 修正: displayResultForOC を直接呼び出す
  }
}



// イベントリスナーの設定
// モード切り替えスイッチ
modeToggle.addEventListener('change', toggleMode);

// スキル値ボタン
skillButtons.forEach(button => {
  button.addEventListener('click', () => {
    // すべてのスキル値ボタンから active クラスを削除
    skillButtons.forEach(btn => btn.classList.remove('active'));
    // クリックされたボタンに active クラスを追加
    button.classList.add('active');

    if (button.dataset.value === "bluefes") {
      leaderSkillInput.value = "";
      // 任意値入力エリアを非表示にする
      customInputArea.style.display = 'none';
      // 特訓選択エリアを表示する
      trainingSelection.style.display = 'block';
      // キャラクタータイプ選択エリアを非表示にする
      characterTypeSelection.style.display = 'none';
      // キャラクターランク入力エリアを非表示にする
      characterRankArea.style.display = 'none';
      // オリジナルキャラクターのスキルレベルエリアを非表示にする
      ocSkillLevelArea.style.display = 'none';
      // ユニット選択エリアを非表示にする
      unitSelection.style.display = 'none';
    } else {
      // 先頭スキル値入力欄にボタンの値を設定
      leaderSkillInput.value = button.dataset.value;
      // 任意値入力エリアを表示にする
      customInputArea.style.display = 'flex';
      // 特訓選択エリアを非表示にする
      trainingSelection.style.display = 'none';
      // キャラクタータイプ選択エリアを非表示にする
      characterTypeSelection.style.display = 'none';
      // キャラクターランク入力エリアを非表示にする
      characterRankArea.style.display = 'none';
      // オリジナルキャラクターのスキルレベルエリアを非表示にする
      ocSkillLevelArea.style.display = 'none';
      // ユニット選択エリアを非表示にする
      unitSelection.style.display = 'none';
    }
    // 個別スキル値入力がオンの場合、内部値を再計算
    if (detailToggle.checked) { 
      calculateInnerValueFromDetails();
    }
    // 実効値を更新
    calculateEffectiveValue(); 
  });
});

// 特訓選択ボタン
trainingSelection.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => {
    // すべての特訓選択ボタンから active クラスを削除
    trainingSelection.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
    // クリックされたボタンに active クラスを追加
    button.classList.add('active');

    if (button.dataset.value === "before") {
      // キャラクタータイプ選択エリアを表示する
      characterTypeSelection.style.display = 'block';
      // キャラクターランク入力エリアを非表示にする
      characterRankArea.style.display = 'none';
      // オリジナルキャラクターのスキルレベルエリアを非表示にする
      ocSkillLevelArea.style.display = 'none';
      // ユニット選択エリアを非表示にする
      unitSelection.style.display = 'none';
    } else if (button.dataset.value === "after") {
      // キャラクタータイプ選択エリアを非表示にする
      characterTypeSelection.style.display = 'none';
      // キャラクターランク入力エリアを表示する
      characterRankArea.style.display = 'flex';
      // オリジナルキャラクターのスキルレベルエリアを非表示にする
      ocSkillLevelArea.style.display = 'none';
      // ユニット選択エリアを非表示にする
      unitSelection.style.display = 'none';
      // 発動スキル値を更新
      updateSkillValue();
      // 実効値を更新
      calculateEffectiveValue();
    }
  });
});

// キャラクタータイプ選択ボタン
characterTypeSelection.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => {
    // すべてのキャラクタータイプ選択ボタンから active クラスを削除
    characterTypeSelection.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
    // クリックされたボタンに active クラスを追加
    button.classList.add('active');

    if (button.dataset.value === "virtual-singer") {
      // ユニット選択エリアを表示する
      unitSelection.style.display = 'block';
      // キャラクターランク入力エリアを非表示にする
      characterRankArea.style.display = 'none';
      // オリジナルキャラクターのスキルレベルエリアを非表示にする
      ocSkillLevelArea.style.display = 'none';
      // バーチャルシンガー特訓前の発動スキル値を更新
      updateVSSkillValue();
    } else if (button.dataset.value === "original-character") {
      // ユニット選択エリアを非表示にする
      unitSelection.style.display = 'none';
      // キャラクターランク入力エリアを非表示にする
      characterRankArea.style.display = 'none';
      // オリジナルキャラクターのスキルレベルエリアを表示する
      ocSkillLevelArea.style.display = 'block';
      // 強制的に内部値の個別入力をオンにする
      detailToggle.checked = true;
      toggleDetailInput(); // 詳細入力エリアを表示
      // スキル値を計算
      calculateOCSkillValue();
      // 内部値と実効値を更新
      updateOCSkillValueIfNeeded(); 
    }
  });
});

// 先頭スキル値入力欄
leaderSkillInput.addEventListener('input', () => {
  // 実効値を計算
  calculateEffectiveValue();
  // ボタンの選択状態を更新
  updateButtonSelection(leaderSkillInput.value); 
});

// 内部値入力欄
innerValueInput.addEventListener('input', calculateEffectiveValue);

// 実効値入力欄
effectiveValueInput.addEventListener('input', calculateFromEffectiveValue);

// オプション先頭スキル値入力欄
opLeaderSkillInput.addEventListener('input', calculateFromEffectiveValue);

// キャラクターランク入力欄
characterRankInput.addEventListener('input', updateSkillValue);

// 個別スキル値入力欄
innerValueInput2.addEventListener('input', () => {
  calculateInnerValueFromDetails();
  updateOCSkillValueIfNeeded(); // ブルフェス特訓前オリジナルキャラクターの場合の処理を追加
});
innerValueInput3.addEventListener('input', () => {
  calculateInnerValueFromDetails();
  updateOCSkillValueIfNeeded(); // ブルフェス特訓前オリジナルキャラクターの場合の処理を追加
});
innerValueInput4.addEventListener('input', () => {
  calculateInnerValueFromDetails();
  updateOCSkillValueIfNeeded(); // ブルフェス特訓前オリジナルキャラクターの場合の処理を追加
});
innerValueInput5.addEventListener('input', () => {
  calculateInnerValueFromDetails();
  updateOCSkillValueIfNeeded(); // ブルフェス特訓前オリジナルキャラクターの場合の処理を追加
});

// 先頭スキル値アップボタン
leaderSkillUpButton.addEventListener('click', () => {
  leaderSkillInput.value = (parseInt(leaderSkillInput.value || "0", 10) + 5).toString();
  calculateEffectiveValue();
});

// 先頭スキル値ダウンボタン
leaderSkillDownButton.addEventListener('click', () => {
  leaderSkillInput.value = (parseInt(leaderSkillInput.value || "0", 10) - 5).toString();
  calculateEffectiveValue();
});

// 内部値アップボタン
innerValueUpButton.addEventListener('click', () => {
  innerValueInput.value = (parseInt(innerValueInput.value || "0", 10) + 5).toString();
  calculateEffectiveValue();
});

// 内部値ダウンボタン
innerValueDownButton.addEventListener('click', () => {
  innerValueInput.value = (parseInt(innerValueInput.value || "0", 10) - 5).toString();
  calculateEffectiveValue();
});

// オプション先頭スキル値アップボタン
opLeaderSkillUpButton.addEventListener('click', () => {
  opLeaderSkillInput.value = (parseInt(opLeaderSkillInput.value || "0", 10) + 5).toString();
  calculateFromEffectiveValue();
});

// オプション先頭スキル値ダウンボタン
opLeaderSkillDownButton.addEventListener('click', () => {
  opLeaderSkillInput.value = (parseInt(opLeaderSkillInput.value || "0", 10) - 5).toString();
  calculateFromEffectiveValue();
});

// 詳細入力トグル
detailToggle.addEventListener('change', toggleDetailInput);

// 特訓後のスキルレベル選択
const skillLevelSelect = document.getElementById('skill-level');
skillLevelSelect.addEventListener('change', updateSkillValue);

// ユニット選択ボタン
unitButtons.forEach(button => {
  button.addEventListener('click', () => {
    // Virtual Singer ボタンは固定
    if (button.dataset.unit !== "virtual_singer") { 
      button.classList.toggle('active');
      // バーチャルシンガー特訓前の発動スキル値を更新
      updateVSSkillValue(); 
    }
  });
});

// バーチャルシンガー特訓前のスキルレベル選択
vsSkillLevelSelect.addEventListener('change', updateVSSkillValue);

// オリジナルキャラクターのスキルレベル選択
ocSkillLevelSelect.addEventListener('change', () => {
  calculateOCSkillValue();
  updateOCSkillValueIfNeeded();
});