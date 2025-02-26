// 変換済み楽曲データ
let transformedMusics = [];
let freeIconImage = null;
let freeIconLoaded = false;
let currentCardData = null;
let currentBorderColor = null; // 現在の枠線の色を保持する変数

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

// シード値のエンコード
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

// シード値のデコード
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
            song.cleared = cleared;
            card.push(song);
        }
    }
    return card;
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

    // シード情報の生成
    const seedValue = encodeSeedValue(card);
    console.log("生成されたシード値:", seedValue);

    // currentCardData にカードデータを設定
    currentCardData = card;

    // 枠線の色をリセット
    currentBorderColor = null;

    // キャンバスに描画
    drawBingoCard(card);
    generateCardTable(card); // 表を生成
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
                    if (song.cleared) {
                      // セル全体に半透明グレーを塗る
                      ctx.save();
                      ctx.globalAlpha = 0.7;
                      ctx.fillStyle = "#cccccc";
                      ctx.fillRect(x, y, cellSize, cellSize);
                      ctx.restore();
                    
                      // セルの中心に移動して、-20°回転
                      ctx.save();
                      const cx = x + cellSize / 2;
                      const cy = y + cellSize / 2;
                      ctx.translate(cx, cy);
                      ctx.rotate(-20 * Math.PI / 180);
                    
                      // テキスト "CLEARED" を赤文字、斜体 25px Arial Black で中央に描画
                      ctx.fillStyle = "red";
                      ctx.font = "italic 20px 'Arial Black'";
                      ctx.textAlign = "center";
                      ctx.textBaseline = "middle";
                      ctx.fillText("CLEARED", 0, 0);
                    
                      // 赤い水平線を上下に描画（ここでは上下それぞれ15pxずらす例）
                      ctx.strokeStyle = "red";
                      ctx.lineWidth = 2;
                      
                      // 上部の水平線
                      ctx.beginPath();
                      ctx.moveTo(-cellSize / 2, -15);
                      ctx.lineTo(cellSize / 2, -15);
                      ctx.stroke();
                    
                      // 下部の水平線
                      ctx.beginPath();
                      ctx.moveTo(-cellSize / -2, 15);
                      ctx.lineTo(cellSize / -2, 15);
                      ctx.stroke();
                    
                      ctx.restore();
                    }
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
                if (song.cleared) {
                  // セル全体に半透明グレーを塗る
                  ctx.save();
                  ctx.globalAlpha = 0.7;
                  ctx.fillStyle = "#cccccc";
                  ctx.fillRect(x, y, cellSize, cellSize);
                  ctx.restore();
                
                  // セルの中心に移動して、-20°回転
                  ctx.save();
                  const cx = x + cellSize / 2;
                  const cy = y + cellSize / 2;
                  ctx.translate(cx, cy);
                  ctx.rotate(-20 * Math.PI / 180);
                
                  // テキスト "CLEARED" を赤文字、斜体 25px Arial Black で中央に描画
                  ctx.fillStyle = "red";
                  ctx.font = "italic 20px 'Arial Black'";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText("CLEARED", 0, 0);
                
                  // 赤い水平線を上下に描画（ここでは上下それぞれ15pxずらす例）
                  ctx.strokeStyle = "red";
                  ctx.lineWidth = 2;
                  
                  // 上部の水平線
                  ctx.beginPath();
                  ctx.moveTo(-cellSize / 2, -15);
                  ctx.lineTo(cellSize / 2, -15);
                  ctx.stroke();
                
                  // 下部の水平線
                  ctx.beginPath();
                  ctx.moveTo(-cellSize / -2, 15);
                  ctx.lineTo(cellSize / -2, 15);
                  ctx.stroke();
                
                  ctx.restore();
                }
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
        
        // 枠線（角丸）描画：4pxでランダムカラー
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
    const seedValue = encodeSeedValue(currentCardData); // currentCardData をエンコード
    navigator.clipboard.writeText(seedValue)
        .then(() => {
            alert("シード値をコピーしました:\n" + seedValue);
        })
        .catch(err => {
            console.error("シード値のコピーに失敗:", err);
            alert("シード値のコピーに失敗しました。");
        });
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
          jacketCell.style.position = 'relative'; // 追加
          jacketCell.appendChild(img);
          if (cell.cleared) {
              img.style.filter = 'grayscale(100%)';
              const clearedText = document.createElement('div');
              clearedText.textContent = "CLEARED";
              clearedText.style.color = 'red';
              clearedText.style.fontWeight = 'bold';
              clearedText.style.transform = 'rotate(345deg)';
              clearedText.style.position = 'absolute';
              clearedText.style.top = '50%';
              clearedText.style.left = '50%';
              clearedText.style.transform = 'translate(-50%, -50%) rotate(345deg)';
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