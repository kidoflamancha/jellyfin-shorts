(function () {
  'use strict';

  // State
  let videos = [];
  let currentIndex = 0;
  let isLoading = false;
  let hasMore = true;
  let isMuted = localStorage.getItem('shorts_muted') !== 'false';
  let isFitCover = localStorage.getItem('shorts_fit_cover') === 'true';
  let isRandom = localStorage.getItem('shorts_random') !== 'false';
  let isAutoAdvance = localStorage.getItem('shorts_auto_advance') === 'true';
  let userPausedManually = false;
  let autoUnmutePending = false;

  // Quality presets
  const QUALITY_PRESETS = [
    { id: 'original', name: '原画', desc: 'Direct Play 原生直出', bitrate: 0 },
    { id: '1080p', name: '1080P', desc: '8 Mbps 超清转码', bitrate: 8000000 },
    { id: '720p', name: '720P', desc: '3.5 Mbps 高清流畅', bitrate: 3500000 },
    { id: '480p', name: '480P', desc: '1.2 Mbps 标清省流', bitrate: 1200000 },
    { id: '360p', name: '360P', desc: '600 Kbps 极速极简', bitrate: 600000 }
  ];
  let currentQuality = localStorage.getItem('shorts_quality') || 'original';

  // Extract query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const folderId = urlParams.get('folderId') || '';
  let token = urlParams.get('token') || urlParams.get('api_key') || '';
  let userId = urlParams.get('userId') || '';

  // Inherit credentials from Jellyfin Web if available
  if (!token) {
    try {
      if (window.parent && window.parent.ApiClient) {
        token = window.parent.ApiClient.accessToken();
        userId = userId || window.parent.ApiClient.getCurrentUserId();
      }
    } catch (e) {}
  }
  if (!token) {
    try {
      const stored = localStorage.getItem('jellyfin_credentials');
      if (stored) {
        const creds = JSON.parse(stored);
        if (creds && creds.Servers && creds.Servers[0]) {
          token = creds.Servers[0].AccessToken || '';
          userId = userId || creds.Servers[0].UserId || '';
        }
      }
    } catch (e) {}
  }

  // DOM Elements
  const container = document.getElementById('shorts-container');
  const viewport = document.getElementById('viewport');
  const cardPrev = document.getElementById('card-prev');
  const cardCurrent = document.getElementById('card-current');
  const cardNext = document.getElementById('card-next');
  const videoPrev = cardPrev.querySelector('video');
  const videoCurrent = cardCurrent.querySelector('video');
  const videoNext = cardNext.querySelector('video');

  const topTitle = document.getElementById('top-title');
  const infoTitle = document.getElementById('info-title');
  const infoTags = document.getElementById('info-tags');
  const btnClose = document.getElementById('btn-close');
  const btnRandom = document.getElementById('btn-random');
  const randomIconWrapper = document.getElementById('random-icon-wrapper');
  const btnAutoNext = document.getElementById('btn-autonext');
  const autoNextIconWrapper = document.getElementById('autonext-icon-wrapper');
  const btnMute = document.getElementById('btn-mute');
  const btnFit = document.getElementById('btn-fit');
  const btnLike = document.getElementById('btn-like');
  const likeLabel = document.getElementById('like-label');
  const btnQuality = document.getElementById('btn-quality');
  const qualityLabel = document.getElementById('quality-label');
  const qualityModal = document.getElementById('quality-modal');
  const qualityOptionsEl = document.getElementById('quality-options');
  const btnCloseQuality = document.getElementById('btn-close-quality');

  const centerIndicator = document.getElementById('center-indicator');
  const spinner = document.getElementById('spinner');
  const emptyMessage = document.getElementById('empty-message');

  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressBuffered = document.getElementById('progress-buffered');
  const progressThumb = document.getElementById('progress-thumb');

  // Likes memory (client-side persisted)
  const likedItems = new Set(JSON.parse(localStorage.getItem('shorts_likes') || '[]'));

  // ==========================================
  // 1. Asynchronous Idle Preloader & Blob Pool
  // ==========================================
  const MAX_BLOB_CACHE = 4;
  const blobCache = new Map(); // itemId -> { blobUrl, size, timestamp }
  let currentPreloadAbortCtrl = null;
  let preloadIdleTimer = null;

  function clearBlobCache() {
    if (currentPreloadAbortCtrl) {
      currentPreloadAbortCtrl.abort();
      currentPreloadAbortCtrl = null;
    }
    clearTimeout(preloadIdleTimer);
    for (const [id, entry] of blobCache.entries()) {
      if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
    }
    blobCache.clear();
  }

  function pruneBlobCache() {
    if (blobCache.size <= MAX_BLOB_CACHE) return;
    const currentVideoIds = new Set();
    for (let i = currentIndex - 1; i <= currentIndex + 2; i++) {
      if (videos[i]) currentVideoIds.add(videos[i].id || videos[i].Id);
    }

    for (const [id, entry] of blobCache.entries()) {
      if (!currentVideoIds.has(id)) {
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
        blobCache.delete(id);
        if (blobCache.size <= MAX_BLOB_CACHE) break;
      }
    }
  }

  // Preloads the single next video only while current video is playing smoothly
  function preloadNextVideoQuietly() {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= videos.length) return;

    const item = videos[nextIdx];
    const itemId = item.id || item.Id;
    if (!itemId || blobCache.has(itemId)) return;

    if (currentPreloadAbortCtrl) {
      currentPreloadAbortCtrl.abort();
    }

    const abortCtrl = new AbortController();
    currentPreloadAbortCtrl = abortCtrl;
    const streamUrl = buildStreamUrl(itemId);

    const headers = {};
    if (token) headers['X-Emby-Token'] = token;

    fetch(streamUrl, {
      headers,
      signal: abortCtrl.signal,
      priority: 'low'
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        blobCache.set(itemId, { blobUrl, size: blob.size, timestamp: Date.now() });
        pruneBlobCache();

        // If next video card is standing by, update it to use blobUrl
        if (currentIndex + 1 === nextIdx && videoNext.dataset.src) {
          videoNext.dataset.src = blobUrl;
          videoNext.src = blobUrl;
        }

        currentPreloadAbortCtrl = null;
      })
      .catch(err => {
        currentPreloadAbortCtrl = null;
      });
  }

  function resolveVideoSource(itemId) {
    const entry = blobCache.get(itemId);
    if (entry && entry.blobUrl) {
      return entry.blobUrl;
    }
    return buildStreamUrl(itemId);
  }

  function buildStreamUrl(itemId) {
    if (currentQuality === 'original') {
      let url = `/Videos/${itemId}/stream?static=true`;
      if (token) url += `&api_key=${encodeURIComponent(token)}`;
      return url;
    }

    const preset = QUALITY_PRESETS.find(q => q.id === currentQuality) || QUALITY_PRESETS[0];
    let url = `/Videos/${itemId}/stream.mp4?static=false&videoBitRate=${preset.bitrate}&maxStreamingBitrate=${preset.bitrate}&audioBitRate=128000`;
    if (token) url += `&api_key=${encodeURIComponent(token)}`;
    return url;
  }

  // ==========================================
  // 2. Feed Loader & Rendering
  // ==========================================
  function fetchFeed(initial = false) {
    if (isLoading || (!hasMore && !initial)) return;
    isLoading = true;
    if (initial) spinner.classList.add('active');

    const startIndex = initial ? 0 : videos.length;
    let url = `/Shorts/Feed?startIndex=${startIndex}&limit=20&random=${isRandom}`;
    if (folderId) url += `&folderId=${encodeURIComponent(folderId)}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;
    if (token) url += `&api_key=${encodeURIComponent(token)}`;

    const headers = {};
    if (token) {
      headers['X-Emby-Token'] = token;
      headers['Authorization'] = `MediaBrowser Client="Jellyfin Shorts", Device="Web", DeviceId="shorts-web", Version="1.0.0", Token="${token}"`;
    }

    fetch(url, { headers })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(res => {
        const items = res.items || res.Items || [];
        if (initial) {
          videos = items;
          currentIndex = 0;
          if (videos.length === 0) {
            emptyMessage.style.display = 'block';
            emptyMessage.textContent = '当前文件夹暂无短视频内容';
          } else {
            emptyMessage.style.display = 'none';
            renderCurrent();
          }
        } else {
          videos.push(...items);
        }

        hasMore = (res.totalRecordCount || res.TotalRecordCount || 0) > videos.length;
      })
      .catch(err => {
        console.error('Fetch feed error:', err);
        if (initial && videos.length === 0) {
          emptyMessage.style.display = 'block';
          emptyMessage.textContent = '加载失败: ' + err.message;
        }
      })
      .finally(() => {
        isLoading = false;
        spinner.classList.remove('active');
      });
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function setupAutoUnmuteOnFirstTouch() {
    if (autoUnmutePending) return;
    autoUnmutePending = true;

    function handleFirstUserInteraction(e) {
      if (e && e.target && e.target.closest('#btn-mute')) return;

      window.removeEventListener('pointerdown', handleFirstUserInteraction, true);
      window.removeEventListener('keydown', handleFirstUserInteraction, true);
      autoUnmutePending = false;

      // Only restore unmuted audio if user preferred sound (shorts_muted === 'false')
      const storedMute = localStorage.getItem('shorts_muted');
      if (storedMute === 'false') {
        isMuted = false;
        videoCurrent.muted = false;
        updateMuteState();
        flashCenterNotice('已开启声音');
      }
    }

    window.addEventListener('pointerdown', handleFirstUserInteraction, true);
    window.addEventListener('keydown', handleFirstUserInteraction, true);
  }

  function playCurrentVideo() {
    if (userPausedManually) return;
    videoCurrent.loop = !isAutoAdvance;

    const userWantsSound = (localStorage.getItem('shorts_muted') === 'false');

    if (userWantsSound) {
      videoCurrent.muted = false;
      const playPromise = videoCurrent.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            isMuted = false;
            updateMuteState();
          })
          .catch(err => {
            console.warn('[Shorts] Unmuted autoplay blocked by browser policy, falling back to muted autoplay:', err);
            // Fallback immediately to muted playback so it ALWAYS starts automatically!
            videoCurrent.muted = true;
            isMuted = true;
            updateMuteState();

            const retryPromise = videoCurrent.play();
            if (retryPromise !== undefined) {
              retryPromise
                .then(() => {
                  flashCenterNotice('已为您自动播放 (已静音，轻触开启声音)');
                  setupAutoUnmuteOnFirstTouch();
                })
                .catch(retryErr => {
                  console.error('[Shorts] Muted autoplay also failed:', retryErr);
                });
            }
          });
      }
    } else {
      videoCurrent.muted = true;
      isMuted = true;
      updateMuteState();
      const playPromise = videoCurrent.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[Shorts] Play prevented:', err);
        });
      }
    }
  }

  function renderCurrent() {
    if (!videos.length || currentIndex < 0 || currentIndex >= videos.length) return;

    // Abort any in-flight background download so new current video gets 100% bandwidth!
    if (currentPreloadAbortCtrl) {
      currentPreloadAbortCtrl.abort();
      currentPreloadAbortCtrl = null;
    }
    clearTimeout(preloadIdleTimer);

    const item = videos[currentIndex];
    topTitle.textContent = item.parentName || item.ParentName || 'Jellyfin Shorts';
    infoTitle.textContent = item.name || item.Name || '';

    // Render metadata tags
    const durSec = item.durationSeconds || item.DurationSeconds || 0;
    const durStr = formatDuration(durSec);
    const resStr = (item.width && item.height) ? `${item.width}x${item.height}` : '';
    const codecStr = (item.videoCodec || item.VideoCodec || '').toUpperCase();

    infoTags.innerHTML = `
      <span class="meta-badge">${durStr}</span>
      ${resStr ? `<span class="meta-badge">${resStr}</span>` : ''}
      ${codecStr ? `<span class="meta-badge">${codecStr}</span>` : ''}
    `;

    // Like state
    const itemId = item.id || item.Id;
    if (likedItems.has(itemId)) {
      btnLike.classList.add('liked');
      likeLabel.textContent = '已赞';
    } else {
      btnLike.classList.remove('liked');
      likeLabel.textContent = '喜欢';
    }

    // Set Current Video (gets 100% priority)
    const currentSrc = resolveVideoSource(itemId);
    if (videoCurrent.dataset.src !== currentSrc) {
      videoCurrent.dataset.src = currentSrc;
      videoCurrent.src = currentSrc;
    }
    userPausedManually = false;
    playCurrentVideo();

    // Set Previous Video (no eager download)
    if (currentIndex > 0) {
      const prevItem = videos[currentIndex - 1];
      const prevSrc = resolveVideoSource(prevItem.id || prevItem.Id);
      if (videoPrev.dataset.src !== prevSrc) {
        videoPrev.dataset.src = prevSrc;
        videoPrev.src = prevSrc;
        videoPrev.preload = 'none';
      }
    } else {
      videoPrev.src = '';
      videoPrev.dataset.src = '';
    }

    // Set Next Video (keep preload="none" so it doesn't contend for initial bandwidth!)
    if (currentIndex + 1 < videos.length) {
      const nextItem = videos[currentIndex + 1];
      const nextSrc = resolveVideoSource(nextItem.id || nextItem.Id);
      if (videoNext.dataset.src !== nextSrc) {
        videoNext.dataset.src = nextSrc;
        videoNext.src = nextSrc;
        videoNext.preload = 'none';
      }
    } else {
      videoNext.src = '';
      videoNext.dataset.src = '';
    }

    // Check if near end to load more feed
    if (currentIndex + 4 >= videos.length && hasMore) {
      fetchFeed(false);
    }

    scheduleIdleHide();
  }

  // Once current video is playing smoothly, schedule quiet background preload for next video
  videoCurrent.addEventListener('playing', () => {
    scheduleIdleHide();
    clearTimeout(preloadIdleTimer);
    preloadIdleTimer = setTimeout(() => {
      if (!videoCurrent.paused) {
        preloadNextVideoQuietly();
      }
    }, 1200);
  });

  videoCurrent.addEventListener('canplay', () => {
    if (videoCurrent.paused && !userPausedManually) {
      playCurrentVideo();
    }
  });

  // When current video ends, automatically advance to next if auto-advance mode is on
  videoCurrent.addEventListener('ended', () => {
    if (isAutoAdvance) {
      goToNext();
    }
  });

  function goToNext() {
    if (currentIndex + 1 >= videos.length) {
      viewport.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1)';
      viewport.style.transform = 'translateY(0)';
      flashCenterNotice('已经是最后一个了');
      return;
    }

    userPausedManually = false;
    videoCurrent.pause();
    viewport.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.4, 1)';
    viewport.style.transform = 'translateY(-100%)';

    setTimeout(() => {
      currentIndex++;
      viewport.style.transition = 'none';
      viewport.style.transform = 'translateY(0)';
      renderCurrent();
    }, 280);
  }

  function goToPrev() {
    if (currentIndex <= 0) {
      viewport.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1)';
      viewport.style.transform = 'translateY(0)';
      flashCenterNotice('已经是第一个了');
      return;
    }

    userPausedManually = false;
    videoCurrent.pause();
    viewport.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.4, 1)';
    viewport.style.transform = 'translateY(100%)';

    setTimeout(() => {
      currentIndex--;
      viewport.style.transition = 'none';
      viewport.style.transform = 'translateY(0)';
      renderCurrent();
    }, 280);
  }

  // ==========================================
  // 3. UI Controls Auto-Hiding (Idle Detection)
  // ==========================================
  let idleTimer = null;
  let isQualityModalOpen = false;

  function wakeControls() {
    clearTimeout(idleTimer);
    container.classList.remove('idle-hidden');

    if (videoCurrent.paused || isQualityModalOpen) {
      return;
    }

    idleTimer = setTimeout(() => {
      if (!videoCurrent.paused && !isQualityModalOpen) {
        container.classList.add('idle-hidden');
      }
    }, 2500);
  }

  function scheduleIdleHide() {
    clearTimeout(idleTimer);

    if (videoCurrent.paused || isQualityModalOpen) {
      return;
    }

    // CRITICAL: If controls were already hidden, keep them hidden!
    // Never wake up controls during hands-free auto-advance or smooth background transitions!
    if (container.classList.contains('idle-hidden')) {
      return;
    }

    idleTimer = setTimeout(() => {
      if (!videoCurrent.paused && !isQualityModalOpen) {
        container.classList.add('idle-hidden');
      }
    }, 2500);
  }

  // Wake up controls on user activity (with coordinate filter for pointermove)
  let lastPointerX = -1;
  let lastPointerY = -1;

  window.addEventListener('pointermove', (e) => {
    // Ignore touch pointer movement so swiping on mobile never wakes hidden controls
    if (e.pointerType === 'touch') {
      return;
    }
    // Ignore synthetic pointermove events dispatched by browser during CSS transforms
    if (e.clientX === lastPointerX && e.clientY === lastPointerY) {
      return;
    }
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    wakeControls();
  }, { passive: true });

  // Wake controls on keyboard activity (Space, Esc, Arrows)
  ['keydown'].forEach(evt => {
    window.addEventListener(evt, wakeControls, { passive: true });
  });

  // Only wake controls if the user explicitly/manually paused the video!
  // Internal pause during slide transitions or ended events will NOT wake controls!
  videoCurrent.addEventListener('pause', () => {
    if (userPausedManually) {
      wakeControls();
    }
  });

  // ==========================================
  // 4. Random vs Order Icon Toggle
  // ==========================================
  const SHUFFLE_ICON = `
    <svg viewBox="0 0 24 24">
      <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
    </svg>`;

  const ORDER_ICON = `
    <svg viewBox="0 0 24 24">
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
    </svg>`;

  function updateRandomButton() {
    if (isRandom) {
      randomIconWrapper.innerHTML = SHUFFLE_ICON;
      btnRandom.classList.add('active-mode');
      btnRandom.title = '当前：随机推荐（点击切为顺序播放）';
    } else {
      randomIconWrapper.innerHTML = ORDER_ICON;
      btnRandom.classList.remove('active-mode');
      btnRandom.title = '当前：顺序播放（点击切为随机推荐）';
    }
  }

  btnRandom.addEventListener('click', () => {
    isRandom = !isRandom;
    localStorage.setItem('shorts_random', isRandom);
    updateRandomButton();
    flashCenterNotice(isRandom ? '已开启随机流' : '已切换为顺序播放');
    clearBlobCache();
    fetchFeed(true);
  });

  // ==========================================
  // Auto-Advance vs Single-Loop Toggle
  // ==========================================
  const SKIP_NEXT_ICON = `
    <svg viewBox="0 0 24 24">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
    </svg>`;

  const REPEAT_ONE_ICON = `
    <svg viewBox="0 0 24 24">
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/>
    </svg>`;

  function updateAutoNextButton() {
    if (isAutoAdvance) {
      autoNextIconWrapper.innerHTML = SKIP_NEXT_ICON;
      btnAutoNext.classList.add('active-mode');
      btnAutoNext.title = '当前：自动切下一个（点击切换为单片循环）';
      videoCurrent.loop = false;
    } else {
      autoNextIconWrapper.innerHTML = REPEAT_ONE_ICON;
      btnAutoNext.classList.remove('active-mode');
      btnAutoNext.title = '当前：单片循环（点击切换为自动切下一个）';
      videoCurrent.loop = true;
    }
  }

  btnAutoNext.addEventListener('click', () => {
    isAutoAdvance = !isAutoAdvance;
    localStorage.setItem('shorts_auto_advance', isAutoAdvance);
    updateAutoNextButton();
    flashCenterNotice(isAutoAdvance ? '已开启自动连播 (播完切下一个)' : '已开启单视频循环');
  });

  // ==========================================
  // 5. Quality / Bitrate Selector
  // ==========================================
  function updateQualityUI() {
    const preset = QUALITY_PRESETS.find(q => q.id === currentQuality) || QUALITY_PRESETS[0];
    qualityLabel.textContent = preset.name;

    qualityOptionsEl.innerHTML = QUALITY_PRESETS.map(q => `
      <div class="quality-option-item ${q.id === currentQuality ? 'selected' : ''}" data-id="${q.id}">
        <div>
          <span class="quality-name">${q.name}</span>
          <span class="quality-desc">${q.desc}</span>
        </div>
        <div class="quality-check">✓</div>
      </div>
    `).join('');

    qualityOptionsEl.querySelectorAll('.quality-option-item').forEach(el => {
      el.addEventListener('click', () => {
        const selectedId = el.dataset.id;
        if (selectedId !== currentQuality) {
          switchQuality(selectedId);
        }
        closeQualityModal();
      });
    });
  }

  function openQualityModal() {
    isQualityModalOpen = true;
    updateQualityUI();
    qualityModal.classList.add('active');
    wakeControls();
  }

  function closeQualityModal() {
    isQualityModalOpen = false;
    qualityModal.classList.remove('active');
    scheduleIdleHide();
  }

  function switchQuality(newQualityId) {
    currentQuality = newQualityId;
    localStorage.setItem('shorts_quality', currentQuality);
    updateQualityUI();

    const preset = QUALITY_PRESETS.find(q => q.id === currentQuality) || QUALITY_PRESETS[0];
    flashCenterNotice(`画质已切换: ${preset.name}`);

    clearBlobCache();

    if (videos.length && currentIndex < videos.length) {
      const item = videos[currentIndex];
      const itemId = item.id || item.Id;
      const prevTime = videoCurrent.currentTime;
      const wasPlaying = !videoCurrent.paused;

      const newSrc = buildStreamUrl(itemId);
      videoCurrent.dataset.src = newSrc;
      videoCurrent.src = newSrc;
      videoCurrent.currentTime = prevTime;

      if (wasPlaying) {
        userPausedManually = false;
        playCurrentVideo();
      }
    }
  }

  btnQuality.addEventListener('click', openQualityModal);
  btnCloseQuality.addEventListener('click', closeQualityModal);
  qualityModal.addEventListener('click', (e) => {
    if (e.target === qualityModal) closeQualityModal();
  });

  // ==========================================
  // 6. Playback & Touch Interactions
  // ==========================================
  function togglePlayPause() {
    if (videoCurrent.paused) {
      userPausedManually = false;
      playCurrentVideo();
      showCenterIcon('play');
      scheduleIdleHide();
    } else {
      userPausedManually = true;
      videoCurrent.pause();
      showCenterIcon('pause');
      wakeControls();
    }
  }

  function showCenterIcon(type) {
    if (type === 'play') {
      centerIndicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    } else {
      centerIndicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }
    centerIndicator.classList.add('visible');
    setTimeout(() => {
      centerIndicator.classList.remove('visible');
    }, 450);
  }

  function flashCenterNotice(text) {
    centerIndicator.innerHTML = `<span style="font-size:13px;padding:6px 14px;color:#fff;white-space:nowrap">${text}</span>`;
    centerIndicator.classList.add('visible');
    setTimeout(() => {
      centerIndicator.classList.remove('visible');
    }, 700);
  }

  function triggerHeartAnimation(x, y) {
    const heart = document.createElement('div');
    heart.className = 'heart-burst';
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    heart.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 800);
  }

  function toggleLike(e) {
    if (!videos.length) return;
    const item = videos[currentIndex];
    const itemId = item.id || item.Id;

    if (likedItems.has(itemId)) {
      likedItems.delete(itemId);
      btnLike.classList.remove('liked');
      likeLabel.textContent = '喜欢';
    } else {
      likedItems.add(itemId);
      btnLike.classList.add('liked');
      likeLabel.textContent = '已赞';
      if (e) triggerHeartAnimation(e.clientX || window.innerWidth / 2, e.clientY || window.innerHeight / 2);
    }
    localStorage.setItem('shorts_likes', JSON.stringify(Array.from(likedItems)));
  }

  // Gesture & Tap/Swipe Handling
  // ==========================================
  let touchStartX = 0;
  let touchStartY = 0;
  let touchDiffY = 0;
  let isSwiping = false;
  let isTouchMoved = false;
  let touchActive = false;
  let lastTouchEndTime = 0;
  let lastTapTime = 0;
  let tapTimer = null;

  // Unconditionally block document-level elastic rubber-banding on mobile browsers
  document.addEventListener('touchmove', (e) => {
    if (e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('touchstart', (e) => {
    // Exclude touches on interactive buttons, progress bar, or modal sheet
    if (e.target.closest('button, .action-item, .progress-container, .modal-backdrop')) {
      touchActive = false;
      return;
    }

    touchActive = true;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchDiffY = 0;
    isSwiping = false;
    isTouchMoved = false;
    viewport.style.transition = 'none';
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!touchActive || e.touches.length !== 1) return;

    const t = e.touches[0];
    const diffX = t.clientX - touchStartX;
    const diffY = t.clientY - touchStartY;

    // Movement > 5px indicates a genuine swipe rather than a tap
    if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
      isTouchMoved = true;
    }

    touchDiffY = diffY;
    isSwiping = true;

    // Hard stop at boundary ends (no elastic rubber-band stretch on first/last video)
    let moveY = touchDiffY;
    if ((currentIndex === 0 && touchDiffY > 0) || (currentIndex === videos.length - 1 && touchDiffY < 0)) {
      moveY = 0;
    }
    viewport.style.transform = `translateY(${moveY}px)`;
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (!touchActive) return;
    touchActive = false;

    // If the finger dragged -> handle video transition
    if (isSwiping && isTouchMoved) {
      isSwiping = false;
      isTouchMoved = false;
      viewport.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1)';

      if (touchDiffY < -30) {
        goToNext();
      } else if (touchDiffY > 30) {
        goToPrev();
      } else {
        viewport.style.transform = 'translateY(0)';
      }
      touchDiffY = 0;
      return;
    }

    isSwiping = false;

    // If the finger did not drag -> It's a genuine tap!
    if (!isTouchMoved) {
      lastTouchEndTime = Date.now();
      const touchPos = e.changedTouches ? e.changedTouches[0] : null;
      handleTapOrClick(touchPos ? touchPos.clientX : window.innerWidth / 2, touchPos ? touchPos.clientY : window.innerHeight / 2);
    }
    isTouchMoved = false;
  });

  // Desktop click on card-current
  cardCurrent.addEventListener('click', (e) => {
    // If this click is a synthetic ghost click following a touch on mobile, completely ignore it!
    if (Date.now() - lastTouchEndTime < 600) return;
    if (e.target.closest('.side-actions') || e.target.closest('.top-bar') || e.target.closest('.bottom-overlay') || e.target.closest('.modal-backdrop')) return;

    handleTapOrClick(e.clientX, e.clientY);
  });

  // Handle single tap (toggle play/pause) and double tap (like)
  function handleTapOrClick(x, y) {
    const now = Date.now();

    // Double tap -> Heart animation + Like!
    if (now - lastTapTime < 240) {
      clearTimeout(tapTimer);
      tapTimer = null;
      lastTapTime = 0;
      triggerHeartAnimation(x, y);
      const item = videos[currentIndex];
      if (item && !likedItems.has(item.id || item.Id)) {
        toggleLike();
      }
      return;
    }

    // Single tap -> Toggle Play / Pause!
    lastTapTime = now;
    tapTimer = setTimeout(() => {
      tapTimer = null;
      togglePlayPause();
    }, 240);
  }

  // Mouse Wheel Gesture (throttled)
  let lastWheelTime = 0;
  window.addEventListener('wheel', (e) => {
    if (isQualityModalOpen) return;
    const now = Date.now();
    if (now - lastWheelTime < 500) return;
    if (Math.abs(e.deltaY) > 35) {
      lastWheelTime = now;
      if (e.deltaY > 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
  }, { passive: true });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (isQualityModalOpen) {
      if (e.key === 'Escape') closeQualityModal();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'j') {
      goToNext();
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      goToPrev();
    } else if (e.key === ' ') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === 'Escape') {
      closeShorts();
    } else if (e.key === 'm') {
      toggleMute();
    } else if (e.key === 'l' || e.key === 'L') {
      btnAutoNext.click();
    }
  });

  // Progress Bar live updating
  videoCurrent.addEventListener('timeupdate', () => {
    if (!videoCurrent.duration) return;
    const pct = (videoCurrent.currentTime / videoCurrent.duration) * 100;
    progressFill.style.width = `${pct}%`;
    progressThumb.style.left = `${pct}%`;

    if (videoCurrent.buffered.length > 0) {
      const bufferedEnd = videoCurrent.buffered.end(videoCurrent.buffered.length - 1);
      const bufPct = (bufferedEnd / videoCurrent.duration) * 100;
      progressBuffered.style.width = `${bufPct}%`;
    }
  });

  // Progress scrubbing
  progressContainer.addEventListener('click', (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (videoCurrent.duration) {
      videoCurrent.currentTime = pos * videoCurrent.duration;
    }
    wakeControls();
  });

  // Action Buttons
  function updateMuteState() {
    videoCurrent.muted = isMuted;
    videoPrev.muted = isMuted;
    videoNext.muted = isMuted;
    btnMute.innerHTML = isMuted
      ? '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  }

  function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('shorts_muted', isMuted);
    updateMuteState();
    flashCenterNotice(isMuted ? '已静音' : '已开启声音');
  }

  btnMute.addEventListener('click', toggleMute);

  function updateFitState() {
    [cardPrev, cardCurrent, cardNext].forEach(card => {
      if (isFitCover) {
        card.classList.add('fit-cover');
      } else {
        card.classList.remove('fit-cover');
      }
    });
  }

  btnFit.addEventListener('click', () => {
    isFitCover = !isFitCover;
    localStorage.setItem('shorts_fit_cover', isFitCover);
    updateFitState();
    flashCenterNotice(isFitCover ? '画面铺满' : '自适应比例');
  });

  btnLike.addEventListener('click', toggleLike);

  function closeShorts() {
    if (window.parent && window.parent !== window && window.parent.closeShortsModal) {
      window.parent.closeShortsModal();
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/web/index.html';
    }
  }

  btnClose.addEventListener('click', closeShorts);

  // Initialize
  videoCurrent.defaultMuted = isMuted;
  videoCurrent.muted = isMuted;
  updateMuteState();
  updateFitState();
  updateRandomButton();
  updateAutoNextButton();
  updateQualityUI();
  fetchFeed(true);

})();
