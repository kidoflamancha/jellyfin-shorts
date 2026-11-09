(function () {
  'use strict';

  console.log('[Shorts] Initializing Jellyfin Shorts Web Injector...');

  let modalEl = null;
  let iframeEl = null;

  const SHORTS_ICON_SVG = `
    <svg viewBox="0 0 24 24" style="width: 1.45em; height: 1.45em; fill: currentColor; display: block;">
      <path d="M17.77 10.32l-1.2-.5L18 9.06a3.74 3.74 0 0 0-3.5-5.46 3.71 3.71 0 0 0-2.41.87l-5.63 3.32a3.74 3.74 0 0 0 0 6.42l1.2.5-1.43.76a3.74 3.74 0 0 0 3.5 5.46 3.71 3.71 0 0 0 2.41-.87l5.63-3.32a3.74 3.74 0 0 0 0-6.42zM10 14.5v-5l4.5 2.5-4.5 2.5z"/>
    </svg>`;

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
    const isDetailRibbon = container.classList.contains('mainDetailButtons') || container.classList.contains('detailButtons');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('is', 'emby-button');

    if (isDetailRibbon) {
      // 100% Native Jellyfin Detail Button (matches Play, Shuffle, Download buttons)
      btn.className = 'button-flat btn-shorts-launch detailButton emby-button';
      btn.title = '刷短视频 (Shorts)';
      btn.innerHTML = `
        <div class="detailButton-content">
          <span class="detailButton-icon" style="display:flex;align-items:center;justify-content:center;color:#00a4dc;">
            ${SHORTS_ICON_SVG}
          </span>
          <div class="detailButton-text" style="font-size: 80%; font-weight: 400; margin-top: .7em; color: rgba(255,255,255,0.85);">短视频</div>
        </div>
      `;
    } else {
      // Elegant minimal dark button for list/header toolbars
      btn.className = 'emby-button btn-shorts-launch button-flat raised-mini';
      btn.title = '刷短视频 (Shorts)';
      btn.style.cssText = `
        background: rgba(255, 255, 255, 0.08) !important;
        color: #fff !important;
        font-weight: 500 !important;
        font-size: 13px !important;
        border-radius: 6px !important;
        padding: 0 14px !important;
        height: 34px !important;
        display: inline-flex !important;
        align-items: center !important;
        flex-direction: row !important;
        gap: 6px !important;
        cursor: pointer !important;
        margin: 4px 6px !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        backdrop-filter: blur(8px) !important;
        transition: background 0.2s, transform 0.1s !important;
      `;
      btn.innerHTML = `
        <span style="display:flex;align-items:center;color:#00a4dc;">${SHORTS_ICON_SVG}</span>
        <span>短视频</span>
      `;

      btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255, 255, 255, 0.14)');
      btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255, 255, 255, 0.08)');
    }

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
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(24, 24, 24, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      color: #00a4dc;
      transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.2s, box-shadow 0.2s;
    `;
    fab.innerHTML = SHORTS_ICON_SVG;

    fab.addEventListener('mouseenter', () => {
      fab.style.transform = 'scale(1.1)';
      fab.style.background = 'rgba(36, 36, 36, 0.95)';
      fab.style.boxShadow = '0 8px 24px rgba(0, 164, 220, 0.35)';
    });

    fab.addEventListener('mouseleave', () => {
      fab.style.transform = 'scale(1)';
      fab.style.background = 'rgba(24, 24, 24, 0.88)';
      fab.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.55)';
    });

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
