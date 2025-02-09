async function loadHeader() {
  try {
      const response = await fetch('header.html');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const headerHtml = await response.text();
      document.body.insertAdjacentHTML('afterbegin', headerHtml);
      setupHamburgerMenu();
      setupDropdownMenu(); // ドロップダウンメニューのイベントリスナーを設定
setupAdvanceModeToggle(); // Advance Modeの設定を追加
  } catch (error) {
    console.error('ヘッダーの読み込みに失敗しました:', error);
  }
}

function setupHamburgerMenu() {
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const nav = document.querySelector('header nav');

    if(hamburgerMenu){
        hamburgerMenu.addEventListener('click', () => {
            nav.classList.toggle('active');
        });
    }
}

function setupDropdownMenu() {
const dropdownToggle = document.querySelector('.dropdown-toggle');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  const dropdown = document.querySelector('.dropdown');


if (dropdownToggle && dropdownMenu) {
    dropdownToggle.addEventListener('click', (event) => {
    event.preventDefault(); // リンクのデフォルト動作をキャンセル
          dropdown.classList.toggle('active');
    });
  }
}

function setupAdvanceModeToggle() {
    const advanceModeToggle = document.getElementById('advanceModeToggle');
    if (advanceModeToggle) {
        advanceModeToggle.addEventListener('change', () => {
            const isChecked = advanceModeToggle.checked;
            // ここでAdvance Modeの切り替え処理を実装
            console.log(`Advance Mode: ${isChecked ? 'ON' : 'OFF'}`);
        });
    }
}

  loadHeader();