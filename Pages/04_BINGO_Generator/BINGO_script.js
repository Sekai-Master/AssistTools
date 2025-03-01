// 変換済み楽曲データ
let transformedMusics = [];
let aliasMapping = [];
let freeIconImage = null;
let freeIconLoaded = false;
let currentCardData = null;
let currentBorderColor = null; // 現在の枠線の色を保持する変数
let editingCellIndex = null; // 置換対象のカード内インデックス
let fuse = null; // Fuse.js インスタンス
let centerSong = { title: "Tell Your World", id: "001", jacketLink: "jacket_s_001.webp" };

// ◆ 枠線の色候補（CSS変数に対応する色をリスト化）
const colorCandidates = [
  "#3CB", "#FC1", "#FE1", "#fbc", "#d44", "#36c",  // VIRTUAL SINGER
  "#45D", "#3AE", "#FD4", "#F66", "#BD2",          // Leo/need
  "#8d4", "#fca", "#9cf", "#fac", "#9ed",          // MORE MORE JUMP!
  "#E16", "#F69", "#0Bd", "#F72", "#07D",          // Vivid BAD SQUAD
  "#F90", "#FB0", "#F6B", "#3D9", "#B8E",          // ワンダーランズ×ショウタイム
  "#849", "#B68", "#88C", "#CA8", "#DAC"           // 25時、ナイトコードで。
];

// Base64アルファベット（標準の順番）
const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// 初期状態：全ユニット、カテゴリ、曲種が選択されている
let selectedUnits = new Set(["0_VS", "1_L/n", "2_MMJ", "3_VBS", "4_WxS", "5_25", "9_oth"]);
let selectedCategories = new Set(["mv_3d", "mv_2d", "original", "image"]);
let selectedMusicTypes = new Set([true, false]);

// ------------------------------
// Helper Functions
// ------------------------------

/**
 * CLEARED状態のセルに対して、半透明グレーのオーバーレイ、斜め回転した "CLEARED" テキストと水平線を描画する。
 */
function drawClearedOverlay(ctx, x, y, cellSize) {
  // セル全体に半透明グレーを塗る
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "#cccccc";
  ctx.fillRect(x, y, cellSize, cellSize);
  ctx.restore();

  // セル中心に移動して -20°回転し、"CLEARED" 表示＋水平線描画
  ctx.save();
  const cx = x + cellSize / 2;
  const cy = y + cellSize / 2;
  ctx.translate(cx, cy);
  ctx.rotate(-20 * Math.PI / 180);
  ctx.fillStyle = "red";
  ctx.font = "italic 20px 'Arial Black'";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CLEARED", 0, 0);
  
  // 赤い水平線を上下に描画（上下15pxずらす例）
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-cellSize / 2, -15);
  ctx.lineTo(cellSize / 2, -15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-cellSize / 2, 15);
  ctx.lineTo(cellSize / 2, 15);
  ctx.stroke();
  ctx.restore();
}

/**
 * 楽曲セルの描画を行う。画像読み込み後、描画し、もしセルがクリア済みなら overlay を追加する。
 * @returns Promise
 */
function drawSongCell(ctx, song, x, y, cellSize) {
  const imgURL = "../../MusicDatas/jacket/" + song.jacketLink;
  return loadImage(imgURL).then(img => {
    ctx.drawImage(img, x, y, cellSize, cellSize);
    if (song.cleared) {
      drawClearedOverlay(ctx, x, y, cellSize);
    }
  }).catch(err => {
    console.error("画像読み込みエラー:", err);
    ctx.fillStyle = "#999999";
    ctx.fillRect(x, y, cellSize, cellSize);
  });
}

/**
 * 画像をPromiseで読み込む
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗: " + url));
    img.src = url;
  });
}

/**
 * 配列のシャッフル（Fisher-Yatesアルゴリズム）
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * シード値のエンコード
 * 楽曲セルは、楽曲ID (10進数文字列) を数値化し、クリア済みなら +2048、Base64変換して2文字に圧縮。
 * FREEセルは "AA" とする。（25セルで合計50文字）
 */
function encodeSeedValue(card) {
  return card.map(cell => {
    if (cell === "FREE") {
      return "AA";
    } else {
      let id = parseInt(cell.id, 10);
      if (cell.cleared) {
        id += 2048;
      }
      const firstChar = base64Alphabet[Math.floor(id / 64)];
      const secondChar = base64Alphabet[id % 64];
      return firstChar + secondChar;
    }
  }).join("");
}

/**
 * シード値のデコード
 * 50文字のシード値を2文字ずつに分割し、各セルの楽曲情報を復元する。
 */
function decodeSeedValue(seed) {
  const card = [];
  for (let i = 0; i < seed.length; i += 2) {
    const firstChar = seed[i];
    const secondChar = seed[i + 1];
    const id = base64Alphabet.indexOf(firstChar) * 64 + base64Alphabet.indexOf(secondChar);
    if (id === 0) {
      card.push("FREE");
    } else {
      const cleared = id >= 2048;
      const songId = (cleared ? id - 2048 : id).toString().padStart(3, '0');
      const song = transformedMusics.find(song => song.id === songId);
      if (!song) {
        throw new Error("シード値に対応する楽曲が見つかりません。ID:" + songId);
      }
      // 注意: 復元後は元データに影響を与えないようコピーを作ることも検討する
      song.cleared = cleared;
      card.push(song);
    }
  }
  return card;
}

// ------------------------------
// メインの初期化＆イベント設定
// ------------------------------

window.addEventListener('load', () => {
  const generateButton = document.getElementById('generateButton');
  const copyButton = document.getElementById('copyButton');
  const saveButton = document.getElementById('saveButton');
  const seedButton = document.getElementById('seedButton'); 
  const closeModalButton = document.getElementById('closeModalButton');
  const selectCenterSongButton = document.getElementById('selectCenterSongButton');

  // 各ボタンを無効化
  generateButton.disabled = true;
  copyButton.disabled = true;
  saveButton.disabled = true;
  seedButton.disabled = true;

  // エイリアス情報の読み込み
  fetch('../../MusicDatas/aliasMapping.json')
    .then(response => response.json())
    .then(data => {
      aliasMapping = data;
      console.log("エイリアス情報読み込み完了", aliasMapping);
      // 必要ならここでFuse.jsの初期化時にaliasMappingを利用するなどの処理を追加
    })
    .catch(error => console.error("エイリアス情報の読み込み失敗", error));

  // JSONデータの読み込み
  fetch('../../MusicDatas/transformedMusics.json')
    .then(response => {
      if (!response.ok) {
        throw new Error("レスポンスエラー: " + response.status);
      }
      return response.json();
    })
    .then(data => {
      transformedMusics = data;
      console.log("JSON読み込み完了:", transformedMusics.length, "件");
      generateButton.disabled = false;
      initializeFuse();
    })
    .catch(error => {
      console.error('JSONファイルの読み込みに失敗しました:', error);
    });

  // FREEマス用アイコン画像の読み込み
  const iconImg = new Image();
  iconImg.src = '../../images/icon.webp'; // パスは環境に合わせて修正
  iconImg.crossOrigin = 'Anonymous';
  iconImg.onload = () => {
    freeIconImage = iconImg;
    freeIconLoaded = true;
    console.log("FREEマス用アイコン画像を読み込みました");
  };
  iconImg.onerror = (e) => {
    console.error("FREEマス用アイコン画像の読み込みに失敗:", e);
  };

  // 各フィルターの初期化
  initUnitFilter();
  initCategoryFilter();
  initMusicTypeFilter(); 

  // モード選択の初期化
  initModeSelection();
  initCenterSelection();

  // 各ボタンのイベント
  generateButton.addEventListener('click', generateBingoCard);
  copyButton.addEventListener('click', copyCanvasImage);
  saveButton.addEventListener('click', saveCanvasImage);
  seedButton.addEventListener('click', generateSeedValue); 
  closeModalButton.addEventListener('click', closeSongSearchModal);
  selectCenterSongButton.addEventListener('click', () => {
    editingCellIndex = 12; // 中央マスのインデックス
    openSongSearchModal();
  });

  // メインページのフィルター要素
  const unitFilter = document.getElementById('unitFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const musicTypeFilter = document.getElementById('musicTypeFilter');

  // モーダル内のフィルター要素
  const modalUnitFilter = document.getElementById('modalUnitFilter');
  const modalCategoryFilter = document.getElementById('modalCategoryFilter');
  const modalMusicTypeFilter = document.getElementById('modalMusicTypeFilter');

  // フィルター条件が変更されたときに filterSongs() を呼び出す
  document.getElementById('unitFilter').addEventListener('change', filterSongs);
  document.getElementById('categoryFilter').addEventListener('change', filterSongs);
  document.getElementById('musicTypeFilter').addEventListener('change', filterSongs);

  // モーダル内のフィルター要素のイベントリスナー
  document.getElementById('modalUnitFilter').addEventListener('change', filterSongs);
  document.getElementById('modalCategoryFilter').addEventListener('change', filterSongs);
  document.getElementById('modalMusicTypeFilter').addEventListener('change', filterSongs);

  // モーダル内のフィルター要素のイベントリスナー
  modalUnitFilter.addEventListener('change', function(e) {
      console.log('modalUnitFilter changed:', e.target.value);
      filterSongs();
  });

  modalCategoryFilter.addEventListener('change', function(e) {
      console.log('modalCategoryFilter changed:', e.target.value);
      filterSongs();
  });

  modalMusicTypeFilter.addEventListener('change', function(e) {
      console.log('modalMusicTypeFilter changed:', e.target.value);
      filterSongs();
  });

  // 検索入力欄の入力イベントもそのまま利用
  document.getElementById('songSearchInput').addEventListener('input', function() {
    filterSongs();
  });
});

/**
 * フィルター条件に基づいて楽曲を検索し、結果を表示する関数 */
function filterSongs() {
  // メインページのフィルター要素の値を取得
  const unitFilter = document.getElementById('unitFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const musicTypeFilter = document.getElementById('musicTypeFilter');

  // モーダル内のフィルター要素の値を取得
  const modalUnitFilter = document.getElementById('modalUnitFilter');
  const modalCategoryFilter = document.getElementById('modalCategoryFilter');
  const modalMusicTypeFilter = document.getElementById('modalMusicTypeFilter');

  // フィルターの値を取得
  const unit = unitFilter && unitFilter.value !== undefined ? unitFilter.value : modalUnitFilter.value;
  const category = categoryFilter && categoryFilter.value !== undefined ? categoryFilter.value : modalCategoryFilter.value;
  const musicType = musicTypeFilter && musicTypeFilter.value !== undefined ? musicTypeFilter.value : modalMusicTypeFilter.value;

  console.log(`フィルターが変更されました: ユニット=${unit}, カテゴリ=${category}, 曲種=${musicType}`);

  const query = document.getElementById('songSearchInput').value.trim();
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';

  // 条件に応じてフィルタリング
  let filteredSongs = transformedMusics.filter(song => {
    return song.published &&
           (unit === 'all' || song.Unit === unit) &&
           (category === 'all' || song.categories.includes(category)) &&
           (musicType === 'all' || song.isNewlyWrittenMusic.toString() === musicType);
  });

  if (query) {
    // Fuse.js による fuzzy 検索
    let fuseResults = fuse.search(query).map(result => result.item);

    // エイリアス検索：aliasMapping の中で query が部分一致するものを探す
    let aliasResults = [];
    aliasMapping.forEach(entry => {
      if (entry.alias.indexOf(query) !== -1) {
        // エイリアスにマッチした場合、entry.songIds から transformedMusics から楽曲を抽出
        entry.songIds.forEach(id => {
          const song = transformedMusics.find(s => s.id === id && s.published);
          if (song) {
            aliasResults.push(song);
          }
        });
      }
    });

    // 結果のマージ（重複削除）
    let allResults = [...fuseResults, ...aliasResults];
    allResults = allResults.filter((song, index, self) =>
      index === self.findIndex(s => s.id === song.id)
    );

    // フィルター条件に合致するものだけを残す
    filteredSongs = allResults.filter(song => filteredSongs.includes(song));
  }

  if (filteredSongs.length === 0) {
    resultsContainer.innerHTML = '<p>該当する楽曲が見つかりませんでした。</p>';
  } else {
    filteredSongs.sort((a, b) => a.default - b.default);
    filteredSongs.slice(0, 50).forEach(song => {
      addSearchResultItem(song);
    });
  }
}

// ------------------------------
// フィルター等の初期化関数
// ------------------------------
function initUnitFilter() {
  const unitFilterContainer = document.getElementById('unitFilter');
  const elements = unitFilterContainer.querySelectorAll('.unit-logo');
  elements.forEach(el => {
    el.addEventListener('click', () => {
      const unit = el.getAttribute('data-unit');
      if (selectedUnits.has(unit)) {
        selectedUnits.delete(unit);
        el.classList.remove('selected');
        el.classList.add('unselected');
      } else {
        selectedUnits.add(unit);
        el.classList.remove('unselected');
        el.classList.add('selected');
      }
      console.log("現在選択中のユニット:", Array.from(selectedUnits));
    });
  });
}

function initCategoryFilter() {
  const categoryFilterContainer = document.getElementById('categoryFilter');
  const elements = categoryFilterContainer.querySelectorAll('.category-button');
  elements.forEach(el => {
    el.addEventListener('click', () => {
      const category = el.getAttribute('data-category');
      if (selectedCategories.has(category)) {
        selectedCategories.delete(category);
        el.classList.remove('active');
        el.style.filter = 'grayscale(100%)';
      } else {
        selectedCategories.add(category);
        el.classList.add('active');
        el.style.filter = 'none';
      }
      console.log("現在選択中のカテゴリ:", Array.from(selectedCategories));
    });
  });
}

function initMusicTypeFilter() {
  const musicTypeFilterContainer = document.getElementById('musicTypeFilter');
  const elements = musicTypeFilterContainer.querySelectorAll('.music-type-button');
  elements.forEach(el => {
    el.addEventListener('click', () => {
      const musicType = el.getAttribute('data-music-type') === 'true';
      if (selectedMusicTypes.has(musicType)) {
        selectedMusicTypes.delete(musicType);
        el.classList.remove('active');
        el.style.filter = 'grayscale(100%)';
      } else {
        selectedMusicTypes.add(musicType);
        el.classList.add('active');
        el.style.filter = 'none';
      }
      console.log("現在選択中の曲種:", Array.from(selectedMusicTypes));
    });
  });
}

function initModeSelection() {
  const modeButtons = document.querySelectorAll('#modeSelection .mode-button');
  const centerSelection = document.getElementById('centerSelectiongroup');
  const FilterGroup = document.getElementById('FilterGroup');
  const seedInputGroup = document.getElementById('seedInputGroup');

  modeButtons.forEach(button => {
    button.addEventListener('click', () => {
      modeButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      if (button.getAttribute('data-mode') === 'seed') {
        centerSelection.style.display = 'none';
        FilterGroup.style.display = 'none';
        seedInputGroup.style.display = 'block';
      } else {
        centerSelection.style.display = 'block';
        FilterGroup.style.display = 'block';
        seedInputGroup.style.display = 'none';
      }
    });
  });
}

function initCenterSelection() {
  const centerButtons = document.querySelectorAll('#centerSelection .center-button');
  const centerSongSelectionGroup = document.getElementById('centerSongSelectionGroup');
  centerButtons.forEach(button => {
    button.addEventListener('click', () => {
      centerButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      if (button.getAttribute('data-center') === 'specified') {
        centerSongSelectionGroup.style.display = 'block';
      } else {
        centerSongSelectionGroup.style.display = 'none';
      }
    });
  });
}

document.querySelectorAll('.unit-buttons button').forEach(button => {
  button.addEventListener('click', () => {
    const unit = button.dataset.unit;
    if (selectedUnits.has(unit)) {
      selectedUnits.delete(unit);
      button.classList.remove('active');
      button.style.filter = 'grayscale(100%)';
    } else {
      selectedUnits.add(unit);
      button.classList.add('active');
      button.style.filter = 'none';
    }
  });
});

// ------------------------------
// ビンゴカード生成＆シード値発行＆描画
// ------------------------------
function generateBingoCard() {
  if (!transformedMusics.length) {
    alert("楽曲データがまだ読み込まれていません。少し待ってから再度お試しください。");
    return;
  }

  const modeButton = document.querySelector('#modeSelection .mode-button.active');
  const mode = modeButton ? modeButton.getAttribute('data-mode') : 'random';

  if (mode === 'seed') {
    const seedInput = document.getElementById('seedInput').value.trim();
    if (!seedInput) {
      alert("シード値が入力されていません。シード値を入力してください。");
      return;
    }
    try {
      const card = decodeSeedValue(seedInput);
      console.log("シード値から再現されたカード:", card);
      currentCardData = card; // ここで currentCardData に設定
      drawBingoCard(card);
      generateCardTable(card); // 表を生成
      return;
    } catch (error) {
      console.error("シード値からの再現に失敗しました:", error);
      alert("シード値からの再現に失敗しました。シード値を確認してください。");
      return;
    }
  }

  // ランダム生成モードの場合
  const selectedSongs = transformedMusics.filter(song => {
    return song.published &&
           selectedUnits.has(song.Unit) &&
           song.categories.some(category => selectedCategories.has(category)) &&
           selectedMusicTypes.has(song.isNewlyWrittenMusic);
  });

  const centerButton = document.querySelector('#centerSelection .center-button.active');
  const centerMode = centerButton ? centerButton.getAttribute('data-center') : 'free';

  const requiredSongsCount = centerMode === 'random' ? 25 : 24;

  if (selectedSongs.length < requiredSongsCount) {
    alert(`条件を満たす楽曲が不足しています。現在のフィルター条件に合致する楽曲数: ${selectedSongs.length}曲`);
    return;
  }

  shuffleArray(selectedSongs);

  const card = [];
  let songIndex = 0;

  for (let i = 0; i < 25; i++) {
    if (i === 12) {
      if (centerMode === 'free') {
        card.push("FREE");
      } else if (centerMode === 'specified') {
        card.push({ ...centerSong, cleared: false });
      } else {
        if (songIndex < selectedSongs.length) {
          card.push({ ...selectedSongs[songIndex], cleared: false });
          songIndex++;
        } else {
          alert("カード生成中にエラーが発生しました。条件を満たす楽曲が不足しています。");
          return;
        }
      }
    } else {
      if (songIndex < selectedSongs.length) {
        // 中央マスの曲と重複しないようにする
        while (selectedSongs[songIndex].id === centerSong.id) {
          songIndex++;
        }
        if (songIndex < selectedSongs.length) {
          card.push({ ...selectedSongs[songIndex], cleared: false });
          songIndex++;
        } else {
          alert("カード生成中にエラーが発生しました。条件を満たす楽曲が不足しています。");
          return;
        }
      } else {
        alert("カード生成中にエラーが発生しました。条件を満たす楽曲が不足しています。");
        return;
      }
    }
  }

  const seedValue = encodeSeedValue(card);
  console.log("生成されたシード値:", seedValue);

  currentCardData = card;
  currentBorderColor = null;

  drawBingoCard(card);
  generateCardTable(card);
}

function drawBingoCard(card) {
  const canvas = document.getElementById('bingoCanvas');
  const ctx = canvas.getContext('2d');
  
  const cellSize = 100;
  const margin = 20;
  const cardSize = cellSize * 5;

  canvas.width = cardSize + margin * 2;
  canvas.height = cardSize + margin * 2;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const promises = [];

  for (let i = 0; i < card.length; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = margin + col * cellSize;
    const y = margin + row * cellSize;
    
    if (card[i] === "FREE") {
      // FREEセルの描画
      if (freeIconLoaded) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(freeIconImage, x, y, cellSize, cellSize);
        ctx.restore();
      } else {
        ctx.fillStyle = "#cccccc";
        ctx.fillRect(x, y, cellSize, cellSize);
      }
      ctx.fillStyle = "#222";
      ctx.font = "italic 25px 'Arial Black'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx.shadowBlur = 2;
      ctx.fillText("FREE", x + cellSize / 2, y + cellSize / 2);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    } else {
      // 楽曲セルの描画（重複部分は drawSongCell() に集約）
      promises.push(drawSongCell(ctx, card[i], x, y, cellSize));
    }
  }
  
  Promise.all(promises).then(() => {
    drawSignature(ctx, canvas, margin, cardSize);
    
    if (!currentBorderColor) {
      currentBorderColor = colorCandidates[Math.floor(Math.random() * colorCandidates.length)];
    }
    ctx.save();
    ctx.strokeStyle = currentBorderColor;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, margin, margin, cardSize, cardSize, 10);
    ctx.stroke();
    ctx.restore();

    console.log("ビンゴカード生成完了");
    document.getElementById('copyButton').disabled = false;
    document.getElementById('saveButton').disabled = false;
    document.getElementById('seedButton').disabled = false;
  });
}

function drawSignature(ctx, canvas, margin, cardSize) {
  const signature = "Created by Sekai-Master @YesNoritake";
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#000";
  ctx.textBaseline = "bottom";
  const textWidth = ctx.measureText(signature).width;
  // 署名を右下端（余白部分）に配置
  const x = canvas.width  - textWidth;
  const y = canvas.height ;
  ctx.fillText(signature, x, y);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function generateCardTable(card) {
  const tableContainer = document.getElementById('cardTableContainer');
  tableContainer.innerHTML = ''; // 既存のテーブルをクリア

  const table = document.createElement('table');
  table.classList.add('card-table');

  const headerRow = document.createElement('tr');
  const headers = ['位置', 'ジャケット', '曲名', 'ユニット', '状態'];
  headers.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  const columns = ['A', 'B', 'C', 'D', 'E'];

  card.forEach((cell, index) => {
      const row = document.createElement('tr');

      const positionCell = document.createElement('td');
      const col = columns[index % 5];
      const rowNum = Math.floor(index / 5) + 1;
      positionCell.textContent = `${col}${rowNum}`;
      row.appendChild(positionCell);
      
      const jacketCell = document.createElement('td');
      if (cell === "FREE") {
          jacketCell.textContent = "FREE";
      } else {
          const img = document.createElement('img');
          img.src = "../../MusicDatas/jacket/" + cell.jacketLink;
          img.alt = cell.title;
          img.style.width = 'auto';
          img.style.height = '50px';
          jacketCell.style.position = 'relative';
          jacketCell.appendChild(img);
          if (cell.cleared) {
              img.style.filter = 'grayscale(100%)';
              const clearedText = document.createElement('div');
              clearedText.textContent = "CLEARED";
              clearedText.style.color = 'red';
              clearedText.style.fontWeight = 'bold';
              clearedText.style.transform = 'translate(-50%, -50%) rotate(345deg)';
              clearedText.style.position = 'absolute';
              clearedText.style.top = '50%';
              clearedText.style.left = '50%';
              clearedText.style.textAlign = 'center';
              clearedText.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
              clearedText.style.padding = '2px 5px';
              clearedText.style.borderTop = '2px solid red';
              clearedText.style.borderBottom = '2px solid red';
              jacketCell.appendChild(clearedText);
          }
      }
      row.appendChild(jacketCell);
      const titleCell = document.createElement('td');
      titleCell.textContent = cell === "FREE" ? "FREE" : cell.title;
      if (cell !== "FREE") {
        // セルクリックで検索モーダルを開く
        titleCell.style.cursor = "pointer";
        titleCell.addEventListener('click', () => {
          // 編集対象のセルインデックスを保持
          editingCellIndex = index;
          openSongSearchModal();
        });
      }
      row.appendChild(titleCell);



      const unitCell = document.createElement('td');
      if (cell === "FREE") {
          unitCell.textContent = "N/A";
      } else {
          const unit = cell.Unit;
          const unitMapping = {
              "0_VS": "virtual_singer",
              "1_L/n": "leo_need",
              "2_MMJ": "more_more_jump",
              "3_VBS": "vivid_bad_squad",
              "4_WxS": "wonderlands_x_showtime",
              "5_25": "25_ji_night_cord",
              "9_oth": "others"
          };
          const unitAltMapping = {
              "0_VS": "Virtual Singer",
              "1_L/n": "Leo/need",
              "2_MMJ": "MORE MORE JUMP!",
              "3_VBS": "Vivid BAD SQUAD",
              "4_WxS": "ワンダーランズ×ショウタイム",
              "5_25": "25時、ナイトコードで。",
              "9_oth": "Others"
          };
          const unitColorMapping = {
              "1_L/n": "var(--leo-need)",
              "2_MMJ": "var(--more-more-jump)",
              "3_VBS": "var(--vivid-bad-squad)",
              "4_WxS": "var(--wonderlands-showtime)",
              "5_25": "var(--nightcodede)"
          };
          if (unit === "9_oth") {
              unitCell.textContent = "Others";
          } else {
              const unitImg = document.createElement('img');
              unitImg.src = `../../images/Team_Logo/${unitMapping[unit]}.png`;
              unitImg.alt = unitAltMapping[unit];
              unitImg.style.width = 'auto';
              unitImg.style.maxWidth = '20vw';
              unitImg.style.height = '50px';
              unitCell.appendChild(unitImg);
              if (unitColorMapping[unit]) {
                  unitCell.style.backgroundColor = unitColorMapping[unit];
              }
          }
      }
      row.appendChild(unitCell);

      const statusCell = document.createElement('td');
      if (cell === "FREE") {
          statusCell.textContent = "";
      } else {
          statusCell.textContent = cell.cleared ? "CLEARED" : "未プレイ";
          if (cell.cleared) {
              statusCell.style.backgroundColor = '#ffcccc';
              statusCell.style.fontWeight = 'bold';
          } else {
              statusCell.style.backgroundColor = '';
              statusCell.style.fontWeight = '';
          }
          statusCell.addEventListener('click', () => {
              cell.cleared = !cell.cleared;
              statusCell.textContent = cell.cleared ? "CLEARED" : "未プレイ";
              generateCardTable(card); // テーブルを再生成して更新
              drawBingoCard(card); // ビンゴカードも再描画
          });
      }
      row.appendChild(statusCell);

      table.appendChild(row);
  });

  tableContainer.appendChild(table);
}

// ------------------------------
// 画像コピー・保存機能
// ------------------------------
function copyCanvasImage() {
  const canvas = document.getElementById('bingoCanvas');
  canvas.toBlob(blob => {
    if (!blob) {
      alert("画像の取得に失敗しました。");
      return;
    }
    const item = new ClipboardItem({ "image/png": blob });
    navigator.clipboard.write([item])
      .then(() => {
        alert("画像をクリップボードにコピーしました。");
      })
      .catch(err => {
        console.error("コピーに失敗しました:", err);
        alert("画像のコピーに失敗しました。");
      });
  });
}

function saveCanvasImage() {
  const canvas = document.getElementById('bingoCanvas');
  const image = canvas.toDataURL("image/png");
  const link = document.createElement('a');
  link.href = image;
  link.download = "bingo_card.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function generateSeedValue() {
  if (!currentCardData) {
    alert("シード値を生成できませんでした。まずカードを生成してください。");
    return;
  }
  const seedValue = encodeSeedValue(currentCardData);
  navigator.clipboard.writeText(seedValue)
    .then(() => {
      alert("シード値をコピーしました:\n" + seedValue);
    })
    .catch(err => {
      console.error("シード値のコピーに失敗:", err);
      alert("シード値のコピーに失敗しました。");
    });
}

// ------------------------------
// 検索モーダルを開くための関数と、検索結果選択時のハンドラー
// ------------------------------
const fuseOptions = {
  keys: [
    { name: 'title', weight: 0.6 },
    { name: 'pronunciation', weight: 0.3 },
    { name: 'artistName', weight: 0.1 }
  ],
  threshold: 0.4,       // 適度に曖昧にマッチ
  includeScore: true,   // マッチスコアを取得
  includeMatches: true, // マッチした箇所も取得
  distance: 100,
};

// Fuse.js の初期化（transformedMusics 読み込み完了後に実行）
function initializeFuse() {
  const searchableSongs = transformedMusics.filter(song => song.published);
  fuse = new Fuse(searchableSongs, fuseOptions);
}

// モーダルウィンドウを開く
function openSongSearchModal() {
  const modal = document.getElementById('songSearchModal');
  modal.style.display = 'flex';
  document.getElementById('songSearchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  displayDefaultSongs();
}

// モーダルウィンドウを閉じる
function closeSongSearchModal() {
  const modal = document.getElementById('songSearchModal');
  modal.style.display = 'none';
  editingCellIndex = null;
}

// アコーディオンのトグル
document.getElementById('toggleConditionSearch').addEventListener('click', () => {
  const content = document.getElementById('conditionSearchContent');
  content.style.display = content.style.display === 'none' ? 'block' : 'none';
});

// 検索結果項目の生成
function addSearchResultItem(song) {
  const div = document.createElement('div');
  div.textContent = `${song.title} (${song.pronunciation}) - ${song.artistName}`;
  div.style.cursor = 'pointer';
  div.addEventListener('click', () => {
    if (editingCellIndex !== null) {
      const newSong = { ...song, cleared: false };
      currentCardData[editingCellIndex] = newSong;
      updateCardAtIndex(editingCellIndex, newSong);
      const newSeed = encodeSeedValue(currentCardData);
      console.log("更新後のシード値:", newSeed);
    }
    closeSongSearchModal();
  });
  document.getElementById('searchResults').appendChild(div);
}

// 条件検索のフィルタリング
document.getElementById('unitFilter').addEventListener('change', filterSongs);
document.getElementById('categoryFilter').addEventListener('change', filterSongs);
document.getElementById('musicTypeFilter').addEventListener('change', filterSongs);

function filterSongs() {
  // メインページのフィルター要素の値を取得
  const unitFilter = document.getElementById('unitFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const musicTypeFilter = document.getElementById('musicTypeFilter');

  // モーダル内のフィルター要素の値を取得
  const modalUnitFilter = document.getElementById('modalUnitFilter');
  const modalCategoryFilter = document.getElementById('modalCategoryFilter');
  const modalMusicTypeFilter = document.getElementById('modalMusicTypeFilter');

  // フィルターの値を取得
  const unit = unitFilter && unitFilter.value !== undefined ? unitFilter.value : modalUnitFilter.value;
  const category = categoryFilter && categoryFilter.value !== undefined ? categoryFilter.value : modalCategoryFilter.value;
  const musicType = musicTypeFilter && musicTypeFilter.value !== undefined ? musicTypeFilter.value : modalMusicTypeFilter.value;

  console.log(`フィルターが変更されました: ユニット=${unit}, カテゴリ=${category}, 曲種=${musicType}`);

  const query = document.getElementById('songSearchInput').value.trim();
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';

  // 条件に応じてフィルタリング
  let filteredSongs = transformedMusics.filter(song => {
    return song.published &&
           (unit === 'all' || song.Unit === unit) &&
           (category === 'all' || song.categories.includes(category)) &&
           (musicType === 'all' || song.isNewlyWrittenMusic.toString() === musicType);
  });

  if (query) {
    // Fuse.js による fuzzy 検索
    let fuseResults = fuse.search(query).map(result => result.item);

    // エイリアス検索：aliasMapping の中で query が部分一致するものを探す
    let aliasResults = [];
    aliasMapping.forEach(entry => {
      if (entry.alias.indexOf(query) !== -1) {
        // エイリアスにマッチした場合、entry.songIds から transformedMusics から楽曲を抽出
        entry.songIds.forEach(id => {
          const song = transformedMusics.find(s => s.id === id && s.published);
          if (song) {
            aliasResults.push(song);
          }
        });
      }
    });

    // 結果のマージ（重複削除）
    let allResults = [...fuseResults, ...aliasResults];
    allResults = allResults.filter((song, index, self) =>
      index === self.findIndex(s => s.id === song.id)
    );

    // フィルター条件に合致するものだけを残す
    filteredSongs = allResults.filter(song => filteredSongs.includes(song));
  }

  if (filteredSongs.length === 0) {
    resultsContainer.innerHTML = '<p>該当する楽曲が見つかりませんでした。</p>';
  } else {
    filteredSongs.sort((a, b) => a.default - b.default);
    filteredSongs.slice(0, 50).forEach(song => {
      addSearchResultItem(song);
    });
  }
}

// デフォルトの楽曲を表示
function displayDefaultSongs() {
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';

  let defaultSongs = transformedMusics.slice().sort((a, b) => a.default - b.default);
  defaultSongs.slice(0, 50).forEach(song => {
    addSearchResultItem(song);
  });
}

// セル更新後にカード全体を再描画するための関数
function updateCardAtIndex(index, newSong) {
  if (!currentCardData) {
    currentCardData = Array(25).fill(null);
  }
  if (index === 12) {
    updateCenterSong(newSong);
  }
  currentCardData[index] = { ...newSong, cleared: false };
  drawBingoCard(currentCardData);
  generateCardTable(currentCardData);
}
function updateCenterSong(song) {
  centerSong = song;
  document.getElementById('centerSongTitle').textContent = song.title;
}


