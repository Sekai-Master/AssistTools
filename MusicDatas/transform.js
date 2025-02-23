const fs = require('fs');

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
    const categories = music.categories.map(cat => (cat === "mv" ? "mv_3d" : cat));
    
    // jacketLinkの生成（3桁に整形したidを利用）
    const jacketLink = `https://storage.sekai.best/sekai-jp-assets/music/jacket/jacket_s_${formattedId}_rip/jacket_s_${formattedId}.webp`;
    
    // metas.jsonから music_id が一致するレコードを取得
    const meta = metas.find(m => m.music_id === music.id);
    const music_time = meta ? meta.music_time : null;
    const event_rate = meta ? meta.event_rate : null;
    
    // 整形後のオブジェクトを返す
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
      isNewlyWrittenMusic: music.isNewlyWrittenMusic,
      isFullLength: music.isFullLength,
      jacketLink: jacketLink,
      music_time: music_time,
      event_rate: event_rate
    };
  });
  
  // 結果を整形済みJSONとしてファイルに出力
  fs.writeFileSync('transformedMusics.json', JSON.stringify(transformedData, null, 2), 'utf-8');
  console.log('変換完了！ transformedMusics.json に保存されました。');
})();
