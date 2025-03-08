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
