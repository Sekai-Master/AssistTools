let transformedMusics = [];

// ページが読み込まれたときにJSONファイルをフェッチ
window.addEventListener('load', () => {
    const generateButton = document.getElementById('generateButton');
    generateButton.disabled = true;

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
      // データ読み込み完了後、生成ボタンを有効化
      generateButton.disabled = false;
    })
    .catch(error => {
      console.error('JSONファイルの読み込みに失敗しました:', error);
    });

    // 生成ボタンのクリックイベントにバインド
    generateButton.addEventListener('click', generateBingoCard);
});

function generateBingoCard() {
  if (!transformedMusics.length) {
    alert("楽曲データがまだ読み込まれていません。少し待ってから再度お試しください。");
    return;
  }
  
  // publishedがtrueの楽曲のみ抽出
  const availableSongs = transformedMusics.filter(song => song.published);
  console.log("利用可能な楽曲数:", availableSongs.length);
  
  if (availableSongs.length < 24) {
    alert("利用可能な楽曲が24曲未満です。");
    return;
  }
  
  // ランダムにシャッフルして24曲を選出
  const shuffled = shuffleArray(availableSongs.slice());
  const selectedSongs = shuffled.slice(0, 24);
  
  // 5x5マス（計25マス）の配列を作成。中央マス（インデックス12）はFREEとする
  const card = [];
  let songIndex = 0;
  for (let i = 0; i < 25; i++) {
    if (i === 12) {
      card.push(null); // 中央はFREE
    } else {
      card.push(selectedSongs[songIndex]);
      songIndex++;
    }
  }
  
  // キャンバスにビンゴカードを描画
  drawBingoCard(card);
}

// キャンバスにカードを描画する関数
function drawBingoCard(card) {
  const canvas = document.getElementById('bingoCanvas');
  const ctx = canvas.getContext('2d');
  const cellSize = 100; // 各セルのサイズ（px）
  canvas.width = cellSize * 5;
  canvas.height = cellSize * 5;
  
  // キャンバスクリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 画像読み込みのPromiseを格納する配列
  const promises = [];
  
  for (let i = 0; i < card.length; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = col * cellSize;
    const y = row * cellSize;
    
    if (i === 12) {
      // 中央セル: FREEマス
      ctx.fillStyle = "#cccccc";
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.fillStyle = "#000";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FREE", x + cellSize / 2, y + cellSize / 2);
    } else {
      const song = card[i];
      // 画像のパスは、ジャケット画像フォルダとファイル名から生成（例: "./jacket/jacket_s_001.webp"）
      const imgURL = "../../MusicDatas/jacket/" + song.jacketLink;
      // 非同期で画像を読み込み、描画する
      const promise = loadImage(imgURL).then(img => {
        ctx.drawImage(img, x, y, cellSize, cellSize);
      }).catch(err => {
        console.error("画像読み込みエラー:", err);
        // エラー時はセルにグレーの背景を描画
        ctx.fillStyle = "#999999";
        ctx.fillRect(x, y, cellSize, cellSize);
      });
      promises.push(promise);
    }
  }
  
  // すべての画像読み込みが完了した後の処理
  Promise.all(promises).then(() => {
    console.log("ビンゴカード生成完了");
    // ここでcanvas.toDataURL()を使って画像をダウンロードする処理も追加可能
  });
}

// 画像読み込みをPromiseでラップするヘルパー関数
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // 必要に応じて設定
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗: " + url));
    img.src = url;
  });
}

// Fisher-Yatesシャッフルアルゴリズム
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
