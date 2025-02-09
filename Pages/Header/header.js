async function loadHeader() {
    try {
        const path = window.location.pathname.includes('index.html') ? 'Pages/Header/header.html' : '../Header/header.html';
        const response = await fetch(path);
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
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', (event) => {
            event.preventDefault(); // リンクのデフォルト動作をキャンセル
            const dropdown = toggle.closest('.dropdown');
            dropdown.classList.toggle('active');
        });
    });
}

function setupAdvanceModeToggle() {
const advanceModeToggle = document.getElementById('advanceModeToggle');
if (advanceModeToggle) {
    advanceModeToggle.addEventListener('change', () => {
        const isChecked = advanceModeToggle.checked;
        const advancedElements = document.querySelectorAll('.advanced');
        advancedElements.forEach(element => {
            element.style.display = isChecked ? 'block' : 'none';
        });
        // ここでAdvance Modeの切り替え処理を実装
        console.log(`Advance Mode: ${isChecked ? 'ON' : 'OFF'}`);
    });
}
}

loadHeader();