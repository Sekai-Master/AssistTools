// 変換済み楽曲データ
let transformedMusics = [];
let aliasMapping = [];
let freeIconImage = null;
let freeIconLoaded = false;
let currentCardData = null;
let currentBorderColor = null; // 現在の枠線の色を保持する変数
let editingCellIndex = null; // 置換対象のカード内インデックス
let fuse = null; // Fuse.js インスタンス
let centerSong = { title: "Tell Your World", id: "001", jacketLink: "jacket_s_001.webp", Unit: "0_VS" };

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
