async function loadHeader() {
    try {
      const response = await fetch('header.html');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const headerHtml = await response.text();
      document.body.insertAdjacentHTML('afterbegin', headerHtml);
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
  
  loadHeader().then(() => setupHamburgerMenu());