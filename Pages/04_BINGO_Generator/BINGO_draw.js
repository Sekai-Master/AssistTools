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

function drawBingoCard(card) {
    // 画像読み込み前にローダーを表示
    document.getElementById('loader').style.display = 'flex';
    
    // canvas を非表示にする
    const canvas = document.getElementById('bingoCanvas');
    canvas.style.display = 'none';
    
    const ctx = canvas.getContext('2d');
    const cellSize = 100;
    const margin = 20;
    const cardSize = cellSize * 5;

    canvas.width = cardSize + margin * 2;
    canvas.height = cardSize + margin * 2;
    
    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const promises = [];

    for (let i = 0; i < card.length; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = margin + col * cellSize;
    const y = margin + row * cellSize;
    
    if (card[i] === "FREE") {
        // FREEセルは画像不要なので即描画
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
        // 楽曲セルは画像読み込みのPromiseを処理
        promises.push(drawSongCell(ctx, card[i], x, y, cellSize));
    }
    }
    
    // すべての画像読み込み完了後にカード描画を完了させる
    Promise.all(promises).then(() => {
    // 残りの描画（署名、枠線など）
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

    // 完了後、canvasを再表示し、ローダーを非表示にする
    canvas.style.display = 'block';
    document.getElementById('loader').style.display = 'none';
    });
}
