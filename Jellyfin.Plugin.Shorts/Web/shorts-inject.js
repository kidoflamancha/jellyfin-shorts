(function () {
  'use strict';

  console.log('[Shorts] Initializing Jellyfin Shorts Web Injector...');

  let modalEl = null;
  let iframeEl = null;

  function createModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.id = 'jellyfin-shorts-modal';
    modalEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      background: #000;
      z-index: 999999;
      display: none;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 0 50px rgba(0,0,0,0.9);
    `;

    iframeEl = document.createElement('iframe');
    iframeEl.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: #000;
    `;
    iframeEl.allow = 'autoplay; fullscreen';

    modalEl.appendChild(iframeEl);
    document.body.appendChild(modalEl);
    return modalEl;
  }

  window.openShortsModal = function (folderId) {
    createModal();
    const apiClient = window.ApiClient;
    const token = apiClient ? apiClient.accessToken() : '';
    const userId = apiClient ? apiClient.getCurrentUserId() : '';

    let url = `/Shorts/app?t=${Date.now()}`;
    if (folderId) url += `&folderId=${encodeURIComponent(folderId)}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;
    if (token) url += `&api_key=${encodeURIComponent(token)}`;

    iframeEl.src = url;
    modalEl.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.closeShortsModal = function () {
    if (modalEl) {
      modalEl.style.display = 'none';
      if (iframeEl) iframeEl.src = 'about:blank';
      document.body.style.overflow = '';
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && modalEl.style.display === 'flex') {
      window.closeShortsModal();
    }
  });

  function getFolderIdFromUrl() {
    const hash = window.location.hash || '';
    const searchPart = hash.includes('?') ? hash.split('?')[1] : window.location.search.substring(1);
    const params = new URLSearchParams(searchPart);
    return params.get('id') || params.get('parentId') || params.get('topParentId') || '';
  }

  function injectButtonIntoDetailPage() {
    const targetContainers = [
      document.querySelector('.mainDetailButtons'),
      document.querySelector('.detailButtons'),
      document.querySelector('.headerButtonSection'),
      document.querySelector('.detailPageWrapperContainer .detailRibbon')
    ];

    const container = targetContainers.find(c => c && !c.querySelector('.btn-shorts-launch'));
    if (!container) return;

    const folderId = getFolderIdFromUrl();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emby-button btn-shorts-launch raised raised-mini detailButton';
    btn.style.cssText = `
      background: linear-gradient(135deg, #ff2c55 0%, #00a4dc 100%) !important;
      color: #fff !important;
      font-weight: 600 !important;
      border-radius: 20px !important;
      padding: 0 16px !important;
      height: 38px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      cursor: pointer !important;
      margin: 4px 6px !important;
      border: none !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
      transition: transform 0.15s, opacity 0.15s !important;
    `;
    btn.innerHTML = `
      <svg style="width:18px;height:18px;fill:#fff;" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span>刷短视频</span>
    `;

    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.05)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.openShortsModal(folderId);
    });

    container.appendChild(btn);
  }

  // Floating Action Button on home/libraries page for quick access
  function injectFloatingShortsButton() {
    if (document.getElementById('shorts-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'shorts-fab';
    fab.title = '打开短视频流 (Shorts)';
    fab.style.cssText = `
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff2c55, #00a4dc);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      color: #fff;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    fab.innerHTML = `
      <svg style="width:26px;height:26px;fill:#fff;" viewBox="0 0 24 24">
        <path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
      </svg>
    `;

    fab.addEventListener('mouseenter', () => fab.style.transform = 'scale(1.1)');
    fab.addEventListener('mouseleave', () => fab.style.transform = 'scale(1)');
    fab.addEventListener('click', () => {
      const folderId = getFolderIdFromUrl();
      window.openShortsModal(folderId);
    });

    document.body.appendChild(fab);
  }

  // Observers
  const observer = new MutationObserver(() => {
    injectButtonIntoDetailPage();
    injectFloatingShortsButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', () => {
    setTimeout(() => {
      injectButtonIntoDetailPage();
    }, 200);
  });

  // Initial trigger
  setTimeout(() => {
    injectButtonIntoDetailPage();
    injectFloatingShortsButton();
  }, 1000);

})();
