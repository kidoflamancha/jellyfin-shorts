(function () {
  'use strict';

  console.log('[Shorts] Initializing Jellyfin Shorts Web Injector...');

  let modalEl = null;
  let iframeEl = null;
  let lastCheckedId = null;
  let isCurrentItemSingleVideo = false;

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

    document.body.appendChild(modalEl);
    return modalEl;
  }

  window.openShortsModal = function (folderId) {
    createModal();

    // Remove any previous iframe to free memory and prevent duplicate instances
    if (iframeEl) {
      try {
        iframeEl.remove();
      } catch (e) {}
      iframeEl = null;
    }

    const apiClient = window.ApiClient;
    const token = apiClient ? apiClient.accessToken() : '';
    const userId = apiClient ? apiClient.getCurrentUserId() : '';

    let url = `/Shorts/app?t=${Date.now()}`;
    if (folderId) url += `&folderId=${encodeURIComponent(folderId)}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;
    if (token) url += `&api_key=${encodeURIComponent(token)}`;

    iframeEl = document.createElement('iframe');
    iframeEl.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: #000;
    `;
    iframeEl.setAttribute('allow', 'autoplay *; fullscreen *; picture-in-picture *');
    iframeEl.setAttribute('allowfullscreen', 'true');
    iframeEl.allow = 'autoplay *; fullscreen *; picture-in-picture *';

    modalEl.appendChild(iframeEl);
    modalEl.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Use location.replace to load URL inside the iframe without adding an entry to top window history!
    try {
      if (iframeEl.contentWindow) {
        iframeEl.contentWindow.location.replace(url);
      } else {
        iframeEl.src = url;
      }
    } catch (e) {
      iframeEl.src = url;
    }

    try {
      iframeEl.focus();
    } catch (e) {}
  };

  window.closeShortsModal = function () {
    if (modalEl && modalEl.style.display !== 'none') {
      modalEl.style.display = 'none';

      // Destroy the iframe completely without navigating to about:blank
      // This immediately stops playback and leaves window.history 100% untouched!
      if (iframeEl) {
        try {
          iframeEl.remove();
        } catch (e) {}
        iframeEl = null;
      }
      document.body.style.overflow = '';
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && modalEl.style.display === 'flex') {
      window.closeShortsModal();
    }
  });

  // If user navigates via hash/history while modal is open, ensure modal closes cleanly
  window.addEventListener('hashchange', () => {
    if (modalEl && modalEl.style.display === 'flex') {
      window.closeShortsModal();
    }
  });
  window.addEventListener('popstate', () => {
    if (modalEl && modalEl.style.display === 'flex') {
      window.closeShortsModal();
    }
  });

  function getFolderIdFromUrl() {
    const hash = window.location.hash || '';
    const searchPart = hash.includes('?') ? hash.split('?')[1] : window.location.search.substring(1);
    const params = new URLSearchParams(searchPart);
    return params.get('id') || params.get('parentId') || params.get('topParentId') || '';
  }

  function createAndAppendButton(container, folderId) {
    if (container.querySelector('.btn-shorts-launch')) return;

    // Gradient capsule icon button without text
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emby-button btn-shorts-launch';
    btn.title = '刷短视频 (Shorts)';
    btn.style.cssText = `
      background: linear-gradient(135deg, #ff2c55 0%, #00a4dc 100%) !important;
      color: #fff !important;
      border-radius: 20px !important;
      width: 52px !important;
      height: 32px !important;
      min-width: 52px !important;
      padding: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      margin: 4px 6px !important;
      border: none !important;
      box-shadow: 0 2px 10px rgba(255, 44, 85, 0.35) !important;
      transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.15s !important;
      vertical-align: middle !important;
    `;
    btn.innerHTML = `
      <svg style="width: 17px; height: 17px; fill: #fff; margin-left: 2px; display: block;" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.08)';
      btn.style.boxShadow = '0 4px 14px rgba(0, 164, 220, 0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 2px 10px rgba(255, 44, 85, 0.35)';
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.openShortsModal(folderId);
    });

    container.appendChild(btn);
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
    if (!folderId) return;

    const apiClient = window.ApiClient;
    if (apiClient) {
      if (lastCheckedId === folderId && isCurrentItemSingleVideo) {
        return;
      }

      apiClient.getItem(apiClient.getCurrentUserId(), folderId).then(item => {
        lastCheckedId = folderId;
        // If single video item (Movie, Video, Episode), DO NOT show shorts button!
        if (item && !item.IsFolder && item.Type !== 'Playlist' && item.Type !== 'BoxSet' && item.Type !== 'Series') {
          isCurrentItemSingleVideo = true;
          return;
        }

        isCurrentItemSingleVideo = false;
        createAndAppendButton(container, folderId);
      }).catch(() => {
        // Fallback: check DOM elements
        if (document.querySelector('.trackSelections') || document.querySelector('.btnPlaystate')) {
          return; // likely single video
        }
        createAndAppendButton(container, folderId);
      });
    } else {
      createAndAppendButton(container, folderId);
    }
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
      background: linear-gradient(135deg, #ff2c55, #00a4dc);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      color: #fff;
      transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s;
    `;
    fab.innerHTML = `
      <svg style="width: 22px; height: 22px; fill: #fff; margin-left: 2px;" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;

    fab.addEventListener('mouseenter', () => {
      fab.style.transform = 'scale(1.1)';
      fab.style.boxShadow = '0 6px 20px rgba(255, 44, 85, 0.55)';
    });
    fab.addEventListener('mouseleave', () => {
      fab.style.transform = 'scale(1)';
      fab.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.45)';
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
