document.getElementById('showConditionOutside').addEventListener('change', function() {
  document.getElementById('conditionOutside').classList.toggle('hidden', !this.checked);
});

document.getElementById('showSupporter').addEventListener('change', function() {
  document.getElementById('supporterCount').classList.toggle('hidden', !this.checked);
});

function convertToHalfWidth(str) {
  return str.replace(/[！-～]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  }).replace(/　/g, " ");
}

function validateNumericInput(input) {
  const value = input.value;
  const halfWidthValue = convertToHalfWidth(value);
  if (/[^0-9]/.test(halfWidthValue)) {
    alert("数値は半角で入力してください");
    input.value = "";
  } else {
    input.value = halfWidthValue;
  }
}

document.getElementById('roomId').addEventListener('input', function() {
  validateNumericInput(this);
});

// ページ読み込み時にその他コメント欄の初期値を設定
window.addEventListener('load', () => {
  const otherCommentsTextarea = document.getElementById('otherComments');
  const initialText = "SF気にしません\n長時間大歓迎\nスタンプ他と同じ";
  otherCommentsTextarea.value = initialText;
  otherCommentsTextarea.style.height = 'auto'; // 初期値に合わせて高さを調整
  otherCommentsTextarea.style.height = otherCommentsTextarea.scrollHeight + 'px'; // スクロールバーが出ないように調整

  // 履歴の読み込みと表示
  loadHistory();

  // 募集主備考欄の開閉処理
  const hostRemarksToggle = document.getElementById('hostRemarksToggle');
  const hostRemarksContainer = document.getElementById('hostRemarksContainer');
  const hostRemarksHeader = document.getElementById('hostRemarksHeader');

  hostRemarksHeader.addEventListener('click', () => {
    hostRemarksContainer.classList.toggle('open');
    hostRemarksToggle.classList.toggle('arrow-down');
    hostRemarksToggle.classList.toggle('arrow-up');
  });

  // 募集備考欄の開閉処理
  const recruitRemarksToggle = document.getElementById('recruitRemarksToggle');
  const recruitRemarksContainer = document.getElementById('recruitRemarksContainer');
  const recruitRemarksHeader = document.getElementById('recruitRemarksHeader');

  recruitRemarksHeader.addEventListener('click', () => {
    recruitRemarksContainer.classList.toggle('open');
    recruitRemarksToggle.classList.toggle('arrow-down');
    recruitRemarksToggle.classList.toggle('arrow-up');
  });

  // スキル値/内部値の入力欄表示状態を初期化
  setupInputVisibility('showHostSkill', 'hostSkill');
  setupInputVisibility('showHostInnerValue', 'hostInnerValue');
  setupInputVisibility('showRequiredSkill', 'requiredSkill');
  setupInputVisibility('showRequiredInnerValue', 'requiredInnerValue');
  setupInputVisibility('showFreeDescription', 'freeDescription');
  setupInputVisibility('showRecruitFreeDescription', 'recruitFreeDescription');

  // 主スキルと募集スキルを初期状態で表示
  document.getElementById('hostSkill').classList.remove('hidden');
  document.getElementById('requiredSkill').classList.remove('hidden');

  // 募集備考の各スイッチにchangeイベントリスナーを追加
  document.getElementById('showLongSession').addEventListener('change', updateTweetPreview);
  document.getElementById('showJudgementStrengthenDisabled').addEventListener('change', updateTweetPreview);
  document.getElementById('showJudgementAndRecoveryDisabled').addEventListener('change', updateTweetPreview);
  document.getElementById('showStar4').addEventListener('change', updateTweetPreview);
  document.getElementById('showRecruitFreeDescription').addEventListener('change', updateTweetPreview);
  
});

// スキル値/内部値の入力欄表示切り替え処理
function setupInputVisibility(checkboxId, inputId) {
  const checkbox = document.getElementById(checkboxId);
  const input = document.getElementById(inputId);

  checkbox.addEventListener('change', () => {
    input.classList.toggle('hidden', !checkbox.checked);
    updateTweetPreview(); // 入力欄の表示/非表示が変更されたらプレビューを更新
  });
}

// 各ボタン式選択項目に対して処理を実行する
setupButtonGroup('tlFlowButtons', 'tlFlow', ''); // ありを初期値
setupButtonGroup('roomButtons', 'room', 'ベテラン');
setupButtonGroup('songButtons', 'song', '🦐');
setupButtonGroup('roundsButtons', 'rounds', '高速周回');
setupButtonGroup('remainingSlotsButtons', 'remainingSlots', '1'); // @1を初期値
setupButtonGroup('roomIdSymbolButtons', 'roomIdSymbol', '🔑');

// ボタンの状態変更と値の取得処理
function setupButtonGroup(buttonGroupId, inputId, initialValue = null) {
  const buttons = document.getElementById(buttonGroupId).querySelectorAll('button');
  const input = document.getElementById(inputId);

  buttons.forEach(button => {
    if (initialValue !== null && button.getAttribute('data-value') === initialValue) {
      button.classList.add('active');
      input.value = initialValue; // 初期値をinputに設定
    }

    button.addEventListener('click', () => {
      buttons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      input.value = button.getAttribute('data-value'); // クリックされたボタンの値をinputに設定
      updateTweetPreview();
    });
  });

  // 該当するボタングループであればsetupInputVisibilityを呼び出す
  if (buttonGroupId === 'showHostSkillButtons' || buttonGroupId === 'showHostInnerValueButtons' ||
      buttonGroupId === 'showRequiredSkillButtons' || buttonGroupId === 'showRequiredInnerValueButtons' ||
      buttonGroupId === 'showFreeDescriptionButtons' || buttonGroupId === 'showRecruitFreeDescriptionButtons') {
    setupInputVisibility(buttonGroupId.replace('Buttons', ''), buttonGroupId.replace('show', '').replace('Buttons', ''));
  }
}

// プレビューエリアの要素を取得
const tweetPreview = document.getElementById('tweetPreview');

// 入力項目が変更されるたびにプレビューを更新する関数
function updateTweetPreview() {
  const tlFlow = document.getElementById('tlFlow').value;
  const room = document.getElementById('room').value;
  const song = document.getElementById('song').value;
  const rounds = document.getElementById('rounds').value;
  const remainingSlots = document.getElementById('remainingSlots').value;
  const roomIdSymbol = document.getElementById('roomIdSymbol').value;
  const roomId = document.getElementById('roomId').value;
  const showHostSkill = document.getElementById('showHostSkill').checked;
  const hostSkill = showHostSkill ? document.getElementById('hostSkill').value : '';
  const showHostInnerValue = document.getElementById('showHostInnerValue').checked;
  const hostInnerValue = showHostInnerValue ? document.getElementById('hostInnerValue').value : '';
  const showRequiredSkill = document.getElementById('showRequiredSkill').checked;
  const requiredSkill = showRequiredSkill ? document.getElementById('requiredSkill').value : '';
  const showRequiredInnerValue = document.getElementById('showRequiredInnerValue').checked;
  const requiredInnerValue = showRequiredInnerValue ? document.getElementById('requiredInnerValue').value : '';
  const showConditionOutside = document.getElementById('showConditionOutside').checked;
  const conditionOutside = showConditionOutside ? document.getElementById('conditionOutside').value : '';
  const showSupporter = document.getElementById('showSupporter').checked;
  const supporterCount = showSupporter ? document.getElementById('supporterCount').value : '';
  const showFreeDescription = document.getElementById('showFreeDescription').checked;
  const freeDescription = showFreeDescription ? document.getElementById('freeDescription').value.trim() : '';
  const showRecruitFreeDescription = document.getElementById('showRecruitFreeDescription').checked;
  const recruitFreeDescription = showRecruitFreeDescription ? document.getElementById('recruitFreeDescription').value.trim() : '';
  const otherComments = document.getElementById('otherComments').value;

  // ルームID表示を整形
  let roomIdDisplay = roomId; // 初期値はroomId
  if (roomIdSymbol === 'ルームID' && roomId) {
    roomIdDisplay = `：${roomId}`;
  }

  // ツイート内容を生成 
  let tweetContent = ''; // 初期化

  // TL放流有無が「なし」の場合のみ #No_TL を追加
  if (tlFlow === '@No_TL') {
    tweetContent += `${tlFlow}\n`;
  }

  tweetContent += `${room} ${song}${rounds}　@${remainingSlots}\n【${roomIdSymbol}${roomIdDisplay}】\n\n`;

  // 主情報
  tweetContent += `主：${hostSkill}${hostInnerValue ? `/${hostInnerValue}` : ''}`;

  // 募集主備考
  let hostRemarksArray = []; // 備考項目を配列に格納
  if (conditionOutside) {
    hostRemarksArray.push(`条件外${conditionOutside}`);
  }
  if (supporterCount) {
    hostRemarksArray.push(`支援者${supporterCount}人`);
  }
  if (freeDescription) {
    hostRemarksArray.push(freeDescription);
  }

  if (hostRemarksArray.length > 0) {
    tweetContent += `　${hostRemarksArray.join('・')} `; // 備考項目を「・」で結合して表示
  }
  tweetContent += '\n'; // 主情報の後に改行を追加

  // 募集情報
  let recruitSkillText = `${requiredSkill}${requiredInnerValue ? `/${requiredInnerValue}` : ''}`; // スキル値と内部値を結合
  recruitSkillText = recruitSkillText.split('/').map(value => value ? `${value}↑` : '').join('/'); // スキル値または内部値があれば「↑」を追加

  let recruitRemarksArray = [];
  if (document.getElementById('showStar4').checked) {
    recruitRemarksArray.push("☆４");
  }
  if (document.getElementById('showLongSession').checked) {
    recruitRemarksArray.push("長時間できる方");
  }
  if (document.getElementById('showJudgementStrengthenDisabled').checked) {
    recruitRemarksArray.push("判定強化✖");
  }
  if (document.getElementById('showJudgementAndRecoveryDisabled').checked) {
    recruitRemarksArray.push("判定・回復✖");
  }
  if (document.getElementById('showRecruitFreeDescription').checked) {
    recruitRemarksArray.push(document.getElementById('recruitFreeDescription').value.trim());
  }

  tweetContent += `募：${recruitSkillText}`; // 募集情報を追加
  if (recruitRemarksArray.length > 0) {
    tweetContent += `　${recruitRemarksArray.join('・')} `; // 募集備考をスキル値/内部値に続けて表示
  }
  tweetContent += '\n'; // 募集情報の後に改行を追加

  if (otherComments) {
    tweetContent += `\n${otherComments.trim()}`; // trim() で余分な空白を削除
  }
  tweetContent += `\n\n#プロセカ募集 #プロセカ協力`;

  // 生成したツイート内容をプレビューエリアに表示
  tweetPreview.textContent = tweetContent;
}

function generateTweetLink() {
  // updateTweetPreview() を呼び出して最新の tweetContent を取得
  updateTweetPreview();

  const tweetUrl = `https://x.com/intent/post?text=${encodeURIComponent(tweetPreview.textContent)}`;

  // ツイートボタンを生成
  const tweetButton = document.createElement('a');
  tweetButton.href = tweetUrl;
  tweetButton.textContent = 'ツイートする';
  tweetButton.target = '_blank'; // 別タブで開く
  tweetButton.classList.add('tweet-button'); // CSS適用のためクラスを追加

  // tweetLinkContainer にボタンを追加
  const tweetLinkContainer = document.getElementById('tweetLinkContainer');
  tweetLinkContainer.innerHTML = ''; // 既存の内容をクリア
  tweetLinkContainer.appendChild(tweetButton);
}

// 全履歴削除ボタンのイベントリスナー
document.getElementById('clearAllHistoryButton').addEventListener('click', () => {
  localStorage.removeItem('history'); // ローカルストレージから履歴を削除
  displayHistory(); // 履歴表示を更新
});

// 履歴保存処理
function saveHistory() {
  const historyData = {
    dateTime: new Date().toLocaleString(),
    roomId: document.getElementById('roomId').value,
    tlFlow: document.getElementById('tlFlow').value,
    room: document.getElementById('room').value,
    song: document.getElementById('song').value,
    rounds: document.getElementById('rounds').value,
    remainingSlots: document.getElementById('remainingSlots').value,
    roomIdSymbol: document.getElementById('roomIdSymbol').value,
    showHostSkill: document.getElementById('showHostSkill').checked,
    hostSkill: document.getElementById('hostSkill').value,
    showHostInnerValue: document.getElementById('showHostInnerValue').checked,
    hostInnerValue: document.getElementById('hostInnerValue').value,
    showRequiredSkill: document.getElementById('showRequiredSkill').checked,
    requiredSkill: document.getElementById('requiredSkill').value,
    showRequiredInnerValue: document.getElementById('showRequiredInnerValue').checked,
    requiredInnerValue: document.getElementById('requiredInnerValue').value,
    showConditionOutside: document.getElementById('showConditionOutside').checked,
    conditionOutside: document.getElementById('conditionOutside').value,
    showSupporter: document.getElementById('showSupporter').checked,
    supporterCount: document.getElementById('supporterCount').value,
    showFreeDescription: document.getElementById('showFreeDescription').checked,
    freeDescription: document.getElementById('freeDescription').value,
    showRecruitFreeDescription: document.getElementById('showRecruitFreeDescription').checked,
    recruitFreeDescription: document.getElementById('recruitFreeDescription').value,
    showStar4: document.getElementById('showStar4').checked,
    showLongSession: document.getElementById('showLongSession').checked,
    showJudgementStrengthenDisabled: document.getElementById('showJudgementStrengthenDisabled').checked,
    showJudgementAndRecoveryDisabled: document.getElementById('showJudgementAndRecoveryDisabled').checked,
    otherComments: document.getElementById('otherComments').value,
    favorite: false // 初期状態はお気に入りでない
  };

  let history = loadHistory();
  history.unshift(historyData); // 新しい履歴を先頭に追加
  history = history.slice(0, 10); // 最大10件まで保存
  localStorage.setItem('history', JSON.stringify(history));
  displayHistory(); // 履歴表示を更新
}

// 履歴読み込み処理
function loadHistory() {
  const historyStr = localStorage.getItem('history');
  return historyStr ? JSON.parse(historyStr) : [];
}

// 履歴表示処理
function displayHistory() {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = ''; // リストをクリア

  const history = loadHistory();
  history.forEach((item, index) => {
    const listItem = document.createElement('li');
    listItem.innerHTML = `
        <span class="roomId">${item.roomId ? item.roomIdSymbol + item.roomId : 'ルームIDなし'}</span> 
        <span class="dateTime">${item.dateTime}</span>
        <button class="favorite-button ${item.favorite ? 'active' : ''}" data-index="${index}">★</button>
        <button class="reuse-button" data-index="${index}">再利用</button>
        <button class="delete-button" data-index="${index}">削除</button> <div class="button-group">
        </div>
      `;

    // お気に入りボタンのイベントリスナー
    const favoriteButton = listItem.querySelector('.favorite-button');
    favoriteButton.addEventListener('click', () => {
      toggleFavorite(index);
    });

    // 再利用ボタンのイベントリスナー
    const reuseButton = listItem.querySelector('.reuse-button');
    reuseButton.addEventListener('click', () => {
      reuseHistory(index);
    });

    // 削除ボタンのイベントリスナー
  const deleteButton = listItem.querySelector('.delete-button');
  deleteButton.addEventListener('click', () => {
    deleteHistory(index);
  });

    historyList.appendChild(listItem);
  });
}

// 履歴欄開閉処理
const historyToggle = document.getElementById('historyToggle'); // チェックボックスを取得
const historyContainer = document.getElementById('historyContainer');

historyToggle.addEventListener('change', () => { // 'click' イベントを 'change' イベントに変更
historyContainer.classList.toggle('open');

displayHistory(); 
});

// 履歴削除処理
function deleteHistory(index) {
  let history = loadHistory();
  history.splice(index, 1); // 指定されたインデックスの履歴を削除
  localStorage.setItem('history', JSON.stringify(history));
  displayHistory(); // 履歴表示を更新
}

// お気に入り切り替え処理
function toggleFavorite(index) {
  let history = loadHistory();
  history[index].favorite = !history[index].favorite;
  localStorage.setItem('history', JSON.stringify(history));
  displayHistory(); // 履歴表示を更新
}

// 履歴再利用処理
function reuseHistory(index) {
  const history = loadHistory();
  const item = history[index];

  // ボタン式選択項目の状態を復元
  updateButtonGroup('tlFlowButtons', 'tlFlow', item.tlFlow);
  updateButtonGroup('roomButtons', 'room', item.room);
  updateButtonGroup('songButtons', 'song', item.song);
  updateButtonGroup('roundsButtons', 'rounds', item.rounds);
  updateButtonGroup('remainingSlotsButtons', 'remainingSlots', item.remainingSlots);
  updateButtonGroup('roomIdSymbolButtons', 'roomIdSymbol', item.roomIdSymbol);

  // チェックボックスの状態を復元
  document.getElementById('showConditionOutside').checked = item.showConditionOutside;
  document.getElementById('conditionOutside').classList.toggle('hidden', !item.showConditionOutside); // 入力欄の表示状態を更新

  document.getElementById('showSupporter').checked = item.showSupporter;
  document.getElementById('supporterCount').classList.toggle('hidden', !item.showSupporter); // 入力欄の表示状態を更新

  // スキル値/内部値入力欄の表示状態を復元
  document.getElementById('showHostSkill').checked = item.showHostSkill;
  document.getElementById('hostSkill').classList.toggle('hidden', !item.showHostSkill);
  document.getElementById('showHostInnerValue').checked = item.showHostInnerValue;
  document.getElementById('hostInnerValue').classList.toggle('hidden', !item.showHostInnerValue);
  document.getElementById('showRequiredSkill').checked = item.showRequiredSkill;
  document.getElementById('requiredSkill').classList.toggle('hidden', !item.showRequiredSkill);
  document.getElementById('showRequiredInnerValue').checked = item.showRequiredInnerValue;
  document.getElementById('requiredInnerValue').classList.toggle('hidden', !item.showRequiredInnerValue);

  // 自由記述の入力欄表示状態を復元
  document.getElementById('showFreeDescription').checked = item.showFreeDescription;
  document.getElementById('freeDescription').classList.toggle('hidden', !item.showFreeDescription);
  document.getElementById('freeDescription').value = item.freeDescription;

  // 募集備考の入力欄表示状態を復元
  document.getElementById('showLongSession').checked = item.showLongSession;
  document.getElementById('showJudgementStrengthenDisabled').checked = item.showJudgementStrengthenDisabled;
  document.getElementById('showJudgementAndRecoveryDisabled').checked = item.showJudgementAndRecoveryDisabled;
  document.getElementById('showStar4').checked = item.showStar4;
  document.getElementById('showRecruitFreeDescription').checked = item.showRecruitFreeDescription;
  document.getElementById('recruitFreeDescription').classList.toggle('hidden', !item.showRecruitFreeDescription);
  document.getElementById('recruitFreeDescription').value = item.recruitFreeDescription;

  // フォームの各項目に値をセット
  document.getElementById('roomId').value = item.roomId;
  document.getElementById('tlFlow').value = item.tlFlow;
  document.getElementById('room').value = item.room;
  document.getElementById('song').value = item.song;
  document.getElementById('rounds').value = item.rounds;
  document.getElementById('remainingSlots').value = item.remainingSlots;
  document.getElementById('roomIdSymbol').value = item.roomIdSymbol;
  document.getElementById('hostSkill').value = item.hostSkill;
  document.getElementById('hostInnerValue').value = item.hostInnerValue;
  document.getElementById('requiredSkill').value = item.requiredSkill;
  document.getElementById('requiredInnerValue').value = item.requiredInnerValue;
  document.getElementById('showConditionOutside').checked = item.showConditionOutside;
  document.getElementById('conditionOutside').value = item.conditionOutside;
  document.getElementById('showSupporter').checked = item.showSupporter;
  document.getElementById('supporterCount').value = item.supporterCount;
  document.getElementById('otherComments').value = item.otherComments;

  updateTweetPreview(); // プレビューを更新
}

// ボタン式選択項目の状態を更新する関数
function updateButtonGroup(buttonGroupId, inputId, targetValue) {
  const buttons = document.getElementById(buttonGroupId).querySelectorAll('button');
  const input = document.getElementById(inputId); // 対応するinput要素を取得

  buttons.forEach(button => {
    const isActive = button.getAttribute('data-value') === targetValue;
    button.classList.toggle('active', isActive); 

    // ボタンがアクティブになった際に、対応するinput要素に値を設定
    if (isActive) {
      input.value = targetValue;
    }
  });
}

// 履歴保存ボタンのイベントリスナー
document.getElementById('saveHistoryButton').addEventListener('click', saveHistory);

// 各入力項目に対してイベントリスナーを設定
// ボタン式の項目は setupButtonGroup 内で設定済み
document.getElementById('roomId').addEventListener('input', updateTweetPreview);
document.getElementById('hostSkill').addEventListener('input', updateTweetPreview);
document.getElementById('hostInnerValue').addEventListener('input', updateTweetPreview);
document.getElementById('requiredSkill').addEventListener('input', updateTweetPreview);
document.getElementById('requiredInnerValue').addEventListener('input', updateTweetPreview);
document.getElementById('showConditionOutside').addEventListener('change', updateTweetPreview);
document.getElementById('conditionOutside').addEventListener('input', updateTweetPreview);
document.getElementById('showSupporter').addEventListener('change', updateTweetPreview);
document.getElementById('supporterCount').addEventListener('input', updateTweetPreview);
document.getElementById('freeDescription').addEventListener('input', updateTweetPreview); // 自由記述のイベントリスナーを追加
document.getElementById('recruitFreeDescription').addEventListener('input', updateTweetPreview); // 自由記述のイベントリスナーを追加
document.getElementById('otherComments').addEventListener('input', updateTweetPreview);

// ページ読み込み時にプレビューを更新
updateTweetPreview();