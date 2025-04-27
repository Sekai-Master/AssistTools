const fs = require('fs');
const path = require('path');

(async () => {
  // 各データの取得先URL
  const musicsUrl = "https://sekai-world.github.io/sekai-master-db-diff/musics.json";
  const artistsUrl = "https://sekai-world.github.io/sekai-master-db-diff/musicArtists.json";
  const metasUrl = "https://storage.sekai.best/sekai-best-assets/music_metas.json";
  
  // JSONデータを取得
  const musicsResponse = await fetch(musicsUrl);
  const musics = await musicsResponse.json();
  
  const artistsResponse = await fetch(artistsUrl);
  const artists = await artistsResponse.json();
  
  const metasResponse = await fetch(metasUrl);
  const metas = await metasResponse.json();
  
  // 削除済み（非公開）楽曲情報を読み込み
  // deletedSongs.json は [{ "id": 241, "title": "…", "reason": "…" }, …] の形式を想定
  let deletedSongs = [];
  const deletedSongsPath = path.join(__dirname, 'deletedSongs.json');
  if (fs.existsSync(deletedSongsPath)) {
    try {
      const data = fs.readFileSync(deletedSongsPath, 'utf-8');
      deletedSongs = JSON.parse(data);
      console.log('削除済み楽曲情報を読み込みました:', deletedSongs);
    } catch (err) {
      console.error('削除済み楽曲情報の読み込みに失敗:', err);
    }
  } else {
    console.log('削除済み楽曲情報ファイルが見つかりません。');
  }
  // 比較用に、deletedSongs の ID を3桁文字列で整形してSetに格納
  const deletedIDsSet = new Set(deletedSongs.map(song => String(song.id).padStart(3, '0')));
  
  // Unitの変換用マッピング
  const unitMapping = {
    '1': '0_VS',
    '2': '1_L/n',
    '3': '2_MMJ',
    '4': '3_VBS',
    '5': '4_WxS',
    '6': '5_25',
    '7': '9_oth'
  };
  
  // 楽曲データの整形処理
  const transformedData = musics.map(music => {
    // idを3桁の文字列に変換（例: 1 -> "001"）
    const formattedId = String(music.id).padStart(3, '0');
    
    // musicArtists.jsonから creatorArtistId に一致するアーティスト名を取得
    const artist = artists.find(a => a.id === music.creatorArtistId);
    const artistName = artist ? artist.name : "";
    
    // seqそのままを"default"として利用
    const defaultSeq = music.seq;
    
    // Unitはseqの2文字目で決定（例: seqが1234567なら、2文字目は "2" なので "1_L/n"）
    const seqStr = String(music.seq);
    const secondDigit = seqStr.length >= 2 ? seqStr[1] : '';
    const unit = unitMapping[secondDigit] || "";
    
    // categories の変換："mv"のみ "mv_3d" に変更、それ以外はそのまま
    let categories = music.categories.map(cat => (cat === "mv" ? "mv_3d" : cat));

    // "image"タグが含まれている場合に、他のタグがあるなら削除
    if (categories.includes("image") && categories.length > 1) {
      categories = categories.filter(cat => cat !== "image");
    }
    
    // 画像ダウンロード用のURL（このURLを使って画像をダウンロードする）
    const jacketUrl = `https://storage.sekai.best/sekai-jp-assets/music/jacket/jacket_s_${formattedId}/jacket_s_${formattedId}.webp`;
    // JSON内に残すのはファイル名のみ
    const jacketLink = `jacket_s_${formattedId}.webp`;
    
    // metas.jsonから music_id が一致するレコードを取得
    const meta = metas.find(m => m.music_id === music.id);
    const music_time = meta ? meta.music_time : null;
    const event_rate = meta ? meta.event_rate : null;
    
    // publishedAt が現在時刻より前なら true、それ以外は false
    let published = music.publishedAt <= Date.now();
    // もしこの楽曲のIDが削除済みのSetに含まれていれば published を false に上書き
    if (deletedIDsSet.has(formattedId)) {
      published = false;
    }
    
    return {
      id: formattedId,
      title: music.title,
      pronunciation: music.pronunciation,
      creatorArtistId: music.creatorArtistId,
      artistName: artistName,
      default: defaultSeq,
      Unit: unit,
      categories: categories,
      publishedAt: music.publishedAt,
      published: published,
      isNewlyWrittenMusic: music.isNewlyWrittenMusic,
      isFullLength: music.isFullLength,
      jacketLink: jacketLink, 
      music_time: music_time,
      event_rate: event_rate,
      _jacketUrl: jacketUrl
    };
  });
  
  // _jacketUrlプロパティを除去して最終的なJSONを生成
  const finalData = transformedData.map(({ _jacketUrl, ...rest }) => rest);
  
  // 整形済みJSONを保存
  fs.writeFileSync('transformedMusics.json', JSON.stringify(finalData, null, 2), 'utf-8');
  console.log('変換完了！ transformedMusics.json に保存されました。');
  
  // 画像保存用のディレクトリ作成
  const jacketDir = path.join(__dirname, 'jacket');
  if (!fs.existsSync(jacketDir)) {
    fs.mkdirSync(jacketDir);
  }
  
  // 各楽曲の _jacketUrl から画像をダウンロード（既存ファイルがあればスキップ）
  for (const music of transformedData) {
    const jacketUrl = music._jacketUrl;
    const fileName = `jacket_s_${music.id}.webp`;
    const filePath = path.join(jacketDir, fileName);
    
    // ファイルが存在している場合はスキップ
    if (fs.existsSync(filePath)) {
      console.log(`ファイル ${fileName} は既に存在するためスキップ`);
      continue;
    }
    
    try {
      const res = await fetch(jacketUrl);
      if (!res.ok) {
         console.error(`ダウンロード失敗: ${jacketUrl} ステータス: ${res.status}`);
         continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(filePath, buffer);
      console.log(`ダウンロード成功: ${fileName}`);
    } catch (error) {
      console.error(`エラー発生 (${jacketUrl}):`, error);
    }
  }
})();
