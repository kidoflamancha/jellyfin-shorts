(function () {
  'use strict';

  // State
  let videos = [];
  let currentIndex = 0;
  let isLoading = false;
  let hasMore = true;
  let isMuted = localStorage.getItem('shorts_muted') !== 'false';
  let isFitCover = localStorage.getItem('shorts_fit_cover') === 'true';
  let isRandom = true;

  // Extract query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const folderId = urlParams.get('folderId') || '';
  let token = urlParams.get('token') || urlParams.get('api_key') || '';
  let userId = urlParams.get('userId') || '';

  // Attempt to inherit credentials from Jellyfin Web if available
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
  const btnMute = document.getElementById('btn-mute');
  const btnRandom = document.getElementById('btn-random');
  const btnFit = document.getElementById('btn-fit');
  const btnLike = document.getElementById('btn-like');
  const likeLabel = document.getElementById('like-label');
  const centerIndicator = document.getElementById('center-indicator');
  const spinner = document.getElementById('spinner');
  const emptyMessage = document.getElementById('empty-message');

  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressBuffered = document.getElementById('progress-buffered');
  const progressThumb = document.getElementById('progress-thumb');

  // Likes memory (client-side persisted)
  const likedItems = new Set(JSON.parse(localStorage.getItem('shorts_likes') || '[]'));

  function buildStreamUrl(itemId) {
    let url = `/Videos/${itemId}/stream?static=true`;
    if (token) {
      url += `&api_key=${encodeURIComponent(token)}`;
    }
    return url;
  }

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

  function updateMuteState() {
    videoCurrent.muted = isMuted;
    videoPrev.muted = isMuted;
    videoNext.muted = isMuted;
    btnMute.innerHTML = isMuted
      ? '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  }

  function updateFitState() {
    [cardPrev, cardCurrent, cardNext].forEach(card => {
      if (isFitCover) {
        card.classList.add('fit-cover');
      } else {
        card.classList.remove('fit-cover');
      }
    });
  }

  function renderCurrent() {
    if (!videos.length || currentIndex < 0 || currentIndex >= videos.length) return;

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

    // Set Current Video
    const currentStream = buildStreamUrl(itemId);
    if (videoCurrent.dataset.src !== currentStream) {
      videoCurrent.dataset.src = currentStream;
      videoCurrent.src = currentStream;
      videoCurrent.load();
    }
    videoCurrent.muted = isMuted;
    videoCurrent.play().catch(e => {
      console.log('Autoplay prevented, requires user interaction:', e);
    });

    // Preload Previous Video
    if (currentIndex > 0) {
      const prevItem = videos[currentIndex - 1];
      const prevStream = buildStreamUrl(prevItem.id || prevItem.Id);
      if (videoPrev.dataset.src !== prevStream) {
        videoPrev.dataset.src = prevStream;
        videoPrev.src = prevStream;
        videoPrev.preload = 'metadata';
      }
    } else {
      videoPrev.src = '';
      videoPrev.dataset.src = '';
    }

    // Preload Next Video
    if (currentIndex + 1 < videos.length) {
      const nextItem = videos[currentIndex + 1];
      const nextStream = buildStreamUrl(nextItem.id || nextItem.Id);
      if (videoNext.dataset.src !== nextStream) {
        videoNext.dataset.src = nextStream;
        videoNext.src = nextStream;
        videoNext.preload = 'auto';
      }
    } else {
      videoNext.src = '';
      videoNext.dataset.src = '';
    }

    // Check if near end to load more
    if (currentIndex + 4 >= videos.length && hasMore) {
      fetchFeed(false);
    }
  }

  function goToNext() {
    if (currentIndex + 1 >= videos.length) {
      flashCenterNotice('已经是最后一个了');
      return;
    }

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
      flashCenterNotice('已经是第一个了');
      return;
    }

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

  function togglePlayPause() {
    if (videoCurrent.paused) {
      videoCurrent.play();
      showCenterIcon('play');
    } else {
      videoCurrent.pause();
      showCenterIcon('pause');
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
    centerIndicator.innerHTML = `<span style="font-size:13px;padding:6px 12px;color:#fff;white-space:nowrap">${text}</span>`;
    centerIndicator.classList.add('visible');
    setTimeout(() => {
      centerIndicator.classList.remove('visible');
    }, 600);
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

  // Double tap detection
  let lastTapTime = 0;
  cardCurrent.addEventListener('pointerdown', (e) => {
    // Ignore clicks on buttons/actions
    if (e.target.closest('.side-actions') || e.target.closest('.top-bar') || e.target.closest('.bottom-overlay')) return;

    const now = Date.now();
    if (now - lastTapTime < 300) {
      // Double tap
      triggerHeartAnimation(e.clientX, e.clientY);
      const item = videos[currentIndex];
      if (item && !likedItems.has(item.id || item.Id)) {
        toggleLike();
      }
      lastTapTime = 0;
    } else {
      lastTapTime = now;
      setTimeout(() => {
        if (lastTapTime === now) {
          // Single tap -> toggle play/pause
          togglePlayPause();
        }
      }, 300);
    }
  });

  // Touch Swipe Gesture
  let touchStartY = 0;
  let touchDiffY = 0;
  let isSwiping = false;

  window.addEventListener('touchstart', (e) => {
    if (e.target.closest('.side-actions') || e.target.closest('.progress-container')) return;
    touchStartY = e.touches[0].clientY;
    touchDiffY = 0;
    isSwiping = true;
    viewport.style.transition = 'none';
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    touchDiffY = e.touches[0].clientY - touchStartY;
    // Limit overscroll resistance at boundaries
    if ((currentIndex === 0 && touchDiffY > 0) || (currentIndex === videos.length - 1 && touchDiffY < 0)) {
      touchDiffY *= 0.35;
    }
    viewport.style.transform = `translateY(${touchDiffY}px)`;
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;
    viewport.style.transition = 'transform 0.25s ease-out';

    if (touchDiffY < -60) {
      goToNext();
    } else if (touchDiffY > 60) {
      goToPrev();
    } else {
      viewport.style.transform = 'translateY(0)';
    }
  });

  // Mouse Wheel Gesture (throttled)
  let lastWheelTime = 0;
  window.addEventListener('wheel', (e) => {
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
    }
  });

  // Progress Bar live updating
  videoCurrent.addEventListener('timeupdate', () => {
    if (!videoCurrent.duration) return;
    const pct = (videoCurrent.currentTime / videoCurrent.duration) * 100;
    progressFill.style.width = `${pct}%`;
    progressThumb.style.left = `${pct}%`;

    // Buffered range
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
  });

  // Action Buttons
  function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('shorts_muted', isMuted);
    updateMuteState();
    flashCenterNotice(isMuted ? '已静音' : '已开启声音');
  }

  btnMute.addEventListener('click', toggleMute);

  btnFit.addEventListener('click', () => {
    isFitCover = !isFitCover;
    localStorage.setItem('shorts_fit_cover', isFitCover);
    updateFitState();
    flashCenterNotice(isFitCover ? '画面铺满' : '自适应比例');
  });

  btnRandom.addEventListener('click', () => {
    isRandom = !isRandom;
    flashCenterNotice(isRandom ? '已开启随机流' : '顺序播放');
    fetchFeed(true);
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
  updateMuteState();
  updateFitState();
  fetchFeed(true);

})();
