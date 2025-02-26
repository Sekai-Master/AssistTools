// 変換済み楽曲データ
let transformedMusics = [];
let freeIconImage = null;
let freeIconLoaded = false;
let currentCardData = null;

// ◆ 枠線の色候補（CSS変数に対応する色をリスト化）
const colorCandidates = [
  "#3CB", "#FC1", "#FE1", "#fbc", "#d44", "#36c",  // VIRTUAL SINGER
  "#45D", "#3AE", "#FD4", "#F66", "#BD2",          // Leo/need
  "#8d4", "#fca", "#9cf", "#fac", "#9ed",          // MORE MORE JUMP!
  "#E16", "#F69", "#0Bd", "#F72", "#07D",          // Vivid BAD SQUAD
  "#F90", "#FB0", "#F6B", "#3D9", "#B8E",          // ワンダーランズ×ショウタイム
  "#849", "#B68", "#88C", "#CA8", "#DAC"           // 25時、ナイトコードで。
];

// 初期状態：全ユニット、カテゴリ、曲種が選択されている
let selectedUnits = new Set(["0_VS", "1_L/n", "2_MMJ", "3_VBS", "4_WxS", "5_25", "9_oth"]);
let selectedCategories = new Set(["mv_3d", "mv_2d", "original", "image"]);
let selectedMusicTypes = new Set([true, false]);

window.addEventListener('load', () => {
  const generateButton = document.getElementById('generateButton');
  const copyButton = document.getElementById('copyButton');
  const saveButton = document.getElementById('saveButton');
  const seedButton = document.getElementById('seedButton'); 

  // 各ボタンを無効化
  generateButton.disabled = true;
  copyButton.disabled = true;
  saveButton.disabled = true;
  seedButton.disabled = true;

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
});

// ユニットフィルターの初期化
function initUnitFilter() {
  const unitFilterContainer = document.getElementById('unitFilter');
  // unitFilter内の各要素にクリックイベントを設定
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

// カテゴリフィルターの初期化
function initCategoryFilter() {
  const categoryFilterContainer = document.getElementById('categoryFilter');
  // categoryFilter内の各要素にクリックイベントを設定
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

// 曲種フィルターの初期化
function initMusicTypeFilter() {
  const musicTypeFilterContainer = document.getElementById('musicTypeFilter');
  // musicTypeFilter内の各要素にクリックイベントを設定
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
  centerButtons.forEach(button => {
    button.addEventListener('click', () => {
      centerButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
    });
  });
}

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
      currentCardData = seedInput.match(/.{1,4}/g); // 4文字ごとに分割
      if (currentCardData.length !== 25) {
        throw new Error("シード値の形式が正しくありません。");
      }
      const card = currentCardData.map(cell => {
        if (cell === "FFF0") {
          return "FREE";
        } else {
          const id = parseInt(cell.slice(0, 3), 16).toString().padStart(3, '0');
          const song = transformedMusics.find(song => song.id === id);
          if (!song) {
            console.error("シード値に対応する楽曲が見つかりません。ID:", id);
            throw new Error("シード値に対応する楽曲が見つかりません。");
          }
          return song;
        }
      });
      console.log("シード値から再現されたカード:", card);
      drawBingoCard(card);
      return;
    } catch (error) {
      console.error("シード値からの再現に失敗しました:", error);
      alert("シード値からの再現に失敗しました。シード値を確認してください。");
      return;
    }
  }

  const selectedSongs = transformedMusics.filter(song => {
    return song.published &&
           selectedUnits.has(song.Unit) &&
           song.categories.some(category => selectedCategories.has(category)) &&
           selectedMusicTypes.has(song.isNewlyWrittenMusic);
  });

  const centerButton = document.querySelector('#centerSelection .center-button.active');
  const centerMode = centerButton ? centerButton.getAttribute('data-center') : 'free';

  const requiredSongsCount = centerMode === 'free' ? 24 : 25;

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
      } else {
        if (songIndex < selectedSongs.length) {
          card.push(selectedSongs[songIndex]);
          songIndex++;
        } else {
          alert("カード生成中にエラーが発生しました。条件を満たす楽曲が不足しています。");
          return;
        }
      }
    } else {
      if (songIndex < selectedSongs.length) {
        card.push(selectedSongs[songIndex]);
        songIndex++;
      } else {
        alert("カード生成中にエラーが発生しました。条件を満たす楽曲が不足しています。");
        return;
      }
    }
  }

  // シード情報の生成：各セルを4文字に圧縮
  currentCardData = card.map(cell => {
    if (cell === "FREE") {
      return "FFF0";
    } else {
      let dec = parseInt(cell.id, 10);
      let hex = dec.toString(16).toUpperCase();
      hex = hex.padStart(3, "0"); // 例: 34 -> "022"
      // 初期状態はすべて未クリア（0）
      return hex + "0";
    }
  });

  console.log("生成されたシード値:", currentCardData.join(""));

  // キャンバスに描画
  drawBingoCard(card);
}

function drawBingoCard(card) {
  const canvas = document.getElementById('bingoCanvas');
  const ctx = canvas.getContext('2d');
  
  const cellSize = 100;
  const margin = 20;
  const cardSize = cellSize * 5; // 500px

  canvas.width = cardSize + margin * 2;
  canvas.height = cardSize + margin * 2;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const promises = [];

  for (let i = 0; i < card.length; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = margin + col * cellSize;
    const y = margin + row * cellSize;
    
    if (i === 12) {
      // FREEマス
      if (card[i] === "FREE") {
        if (freeIconLoaded) {
          ctx.save();
          ctx.globalAlpha = 1;
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
        const song = card[i];
        const imgURL = "../../MusicDatas/jacket/" + song.jacketLink;
        const promise = loadImage(imgURL).then(img => {
          ctx.drawImage(img, x, y, cellSize, cellSize);
        }).catch(err => {
          console.error("画像読み込みエラー:", err);
          ctx.fillStyle = "#999999";
          ctx.fillRect(x, y, cellSize, cellSize);
        });
        promises.push(promise);
      }
    } else {
      const song = card[i];
      const imgURL = "../../MusicDatas/jacket/" + song.jacketLink;
      const promise = loadImage(imgURL).then(img => {
        ctx.drawImage(img, x, y, cellSize, cellSize);
      }).catch(err => {
        console.error("画像読み込みエラー:", err);
        ctx.fillStyle = "#999999";
        ctx.fillRect(x, y, cellSize, cellSize);
      });
      promises.push(promise);
    }
  }
  
  Promise.all(promises).then(() => {
    drawSignature(ctx, canvas, margin, cardSize);
    
    // 枠線（角丸）描画：2pxでランダムカラー
    const randomColor = colorCandidates[Math.floor(Math.random() * colorCandidates.length)];
    ctx.save();
    ctx.strokeStyle = randomColor;
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
  // 署名を右下端（余白部分）に配置（カードの下端から余白内の右下）
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

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗: " + url));
    img.src = url;
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

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
  const seedValue = currentCardData.join(""); // 100文字の文字列
  navigator.clipboard.writeText(seedValue)
    .then(() => {
      alert("シード値をコピーしました:\n" + seedValue);
    })
    .catch(err => {
      console.error("シード値のコピーに失敗:", err);
      alert("シード値のコピーに失敗しました。");
    });
}
