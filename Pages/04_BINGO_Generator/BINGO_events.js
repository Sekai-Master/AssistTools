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
    editingCellIndex = null; // 中央マスのインデックスをリセット
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
    unitFilter.addEventListener('change', filterSongs);
    categoryFilter.addEventListener('change', filterSongs);
    musicTypeFilter.addEventListener('change', filterSongs);

    // モーダル内のフィルター要素のイベントリスナー
    modalUnitFilter.addEventListener('change', (e) => {
        console.log('modalUnitFilter changed:', e.target.value);
        filterSongs();
    });
    modalCategoryFilter.addEventListener('change', (e) => {
        console.log('modalCategoryFilter changed:', e.target.value);
        filterSongs();
    });
    modalMusicTypeFilter.addEventListener('change', (e) => {
        console.log('modalMusicTypeFilter changed:', e.target.value);
        filterSongs();
    });

    // 検索入力欄の入力イベント
    document.getElementById('songSearchInput').addEventListener('input', function() {
    filterSongs();
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
    } else {
        // 中央マスの曲を選択した場合の処理
        centerSong = { ...song, cleared: false };
        document.getElementById('centerSongTitle').textContent = song.title;
    }
    closeSongSearchModal();
    });
    document.getElementById('searchResults').appendChild(div);
}

// 条件検索のフィルタリング
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
