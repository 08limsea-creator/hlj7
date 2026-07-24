(() => {
  const config = window.GALLERY_CONFIG || {};
  const pageKey = config.pageKey || location.pathname;
  const builtIns = Array.isArray(config.files) ? config.files : [];
  const gallery = document.getElementById('gallery');
  const editButton = document.getElementById('editButton');
  const addInput = document.getElementById('addMedia');
  const addLabel = document.getElementById('addLabel');
  const resetButton = document.getElementById('resetButton');
  const editNotice = document.getElementById('editNotice');
  const lightbox = document.getElementById('lightbox');
  const lightboxContent = document.getElementById('lightboxContent');
  let editMode = false;

  const hiddenKey = `portfolio-hidden:${pageKey}`;
  const getHidden = () => new Set(JSON.parse(localStorage.getItem(hiddenKey) || '[]'));
  const saveHidden = (set) => localStorage.setItem(hiddenKey, JSON.stringify([...set]));

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PastelPortfolioMedia', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('media')) {
          const store = db.createObjectStore('media', { keyPath: 'id', autoIncrement: true });
          store.createIndex('pageKey', 'pageKey', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAddedMedia() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readonly');
      const req = tx.objectStore('media').index('pageKey').getAll(pageKey);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function addMediaRecord(file) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readwrite');
      tx.objectStore('media').add({ pageKey, name: file.name, type: file.type, blob: file, createdAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteAddedMedia(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readwrite');
      tx.objectStore('media').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearAddedMedia() {
    const items = await getAddedMedia();
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readwrite');
      const store = tx.objectStore('media');
      items.forEach(item => store.delete(item.id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function kindFrom(name = '', type = '') {
    if (type.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(name)) return 'video';
    return 'image';
  }

  function createCard(item) {
    const card = document.createElement('article');
    card.className = 'item';
    card.dataset.source = item.source;
    card.dataset.id = item.id ?? item.name;

    const mediaWrap = document.createElement('button');
    mediaWrap.type = 'button';
    mediaWrap.className = 'media-button';
    mediaWrap.setAttribute('aria-label', `${item.name} 크게 보기`);

    let media;
    if (item.kind === 'video') {
      media = document.createElement('video');
      media.src = item.url;
      media.preload = 'metadata';
      media.muted = true;
      media.playsInline = true;
      media.controls = true;
    } else {
      media = document.createElement('img');
      media.src = item.url;
      media.alt = item.name;
      media.loading = 'lazy';
    }
    mediaWrap.appendChild(media);

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = item.name;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.textContent = '삭제';
    deleteButton.setAttribute('aria-label', `${item.name} 삭제`);
    deleteButton.hidden = !editMode;
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!confirm(`“${item.name}”을(를) 갤러리에서 삭제할까요?`)) return;
      if (item.source === 'builtin') {
        const hidden = getHidden();
        hidden.add(item.name);
        saveHidden(hidden);
      } else {
        await deleteAddedMedia(item.id);
        URL.revokeObjectURL(item.url);
      }
      await render();
    });

    if (item.kind === 'image') {
      mediaWrap.addEventListener('click', () => openLightbox(item));
    }

    card.append(mediaWrap, caption, deleteButton);
    return card;
  }

  function openLightbox(item) {
    lightboxContent.innerHTML = '';
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.name;
    lightboxContent.appendChild(img);
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxContent.innerHTML = '';
  }

  async function render() {
    gallery.innerHTML = '';
    const hidden = getHidden();
    const builtInItems = builtIns
      .filter(name => !hidden.has(name))
      .map(name => ({ source: 'builtin', name, url: name, kind: kindFrom(name) }));

    let addedItems = [];
    try {
      const records = await getAddedMedia();
      addedItems = records.map(record => ({
        source: 'added',
        id: record.id,
        name: record.name,
        url: URL.createObjectURL(record.blob),
        kind: kindFrom(record.name, record.type)
      }));
    } catch (error) {
      console.warn('추가 미디어를 불러오지 못했습니다.', error);
    }

    const allItems = [...builtInItems, ...addedItems];
    if (!allItems.length) {
      gallery.innerHTML = '<div class="empty">표시할 이미지나 영상이 없습니다. 편집 버튼을 눌러 파일을 추가해 주세요.</div>';
      return;
    }
    allItems.forEach(item => gallery.appendChild(createCard(item)));
  }

  function setEditMode(nextMode) {
    editMode = nextMode;
    document.body.classList.toggle('editing', editMode);
    editButton.textContent = editMode ? '편집 완료' : '수정';
    addLabel.hidden = !editMode;
    resetButton.hidden = !editMode;
    editNotice.hidden = !editMode;
    document.querySelectorAll('.delete-button').forEach(btn => { btn.hidden = !editMode; });
  }

  const modalStyle = document.createElement('style');
  modalStyle.textContent = `
    .password-modal-backdrop{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(83,67,92,.28);backdrop-filter:blur(8px)}
    .password-modal-backdrop.open{display:flex}
    .password-modal{width:min(390px,100%);padding:30px 26px 24px;border-radius:28px;background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(255,244,249,.98));border:1px solid rgba(255,255,255,.92);box-shadow:0 28px 80px rgba(112,82,116,.24);text-align:center;animation:passwordPop .24s ease-out}
    @keyframes passwordPop{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
    .password-icon{width:64px;height:64px;margin:0 auto 14px;display:grid;place-items:center;border-radius:22px;background:linear-gradient(135deg,#ffe3ef,#e3f1ff,#efe5ff);font-size:30px;box-shadow:0 10px 24px rgba(136,95,132,.12)}
    .password-modal h2{margin:0 0 8px;color:#5d5065;font-size:1.35rem}
    .password-modal p{margin:0 0 18px;color:#8a7b90;font-size:.94rem}
    .password-input{width:100%;box-sizing:border-box;padding:14px 16px;border:2px solid #f0ddea;border-radius:16px;background:#fff;color:#574d5e;font:inherit;font-size:1.08rem;text-align:center;letter-spacing:.28em;outline:none;transition:.2s}
    .password-input:focus{border-color:#d8bff0;box-shadow:0 0 0 4px rgba(216,191,240,.2)}
    .password-error{min-height:22px;margin:9px 0 0!important;color:#d65f8d!important;font-size:.86rem!important;font-weight:700}
    .password-actions{display:flex;gap:10px;margin-top:14px}
    .password-actions button{flex:1;border:0;border-radius:999px;padding:12px 14px;font:inherit;font-weight:800;cursor:pointer}
    .password-cancel{background:#f5eff5;color:#786a7d}
    .password-confirm{background:linear-gradient(135deg,#ffbfd7,#d8c8ff);color:#5c4d63;box-shadow:0 8px 18px rgba(150,105,145,.16)}
  `;
  document.head.appendChild(modalStyle);

  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'password-modal-backdrop';
  modalBackdrop.setAttribute('aria-hidden','true');
  modalBackdrop.innerHTML = `
    <div class="password-modal" role="dialog" aria-modal="true" aria-labelledby="passwordTitle">
      <div class="password-icon">🔒</div>
      <h2 id="passwordTitle">수정 모드 열기</h2>
      <p>포트폴리오를 수정하려면 비밀번호를 입력해 주세요.</p>
      <input class="password-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="수정 비밀번호">
      <p class="password-error" aria-live="polite"></p>
      <div class="password-actions">
        <button class="password-cancel" type="button">취소</button>
        <button class="password-confirm" type="button">확인</button>
      </div>
    </div>`;
  document.body.appendChild(modalBackdrop);
  const passwordInput = modalBackdrop.querySelector('.password-input');
  const passwordError = modalBackdrop.querySelector('.password-error');

  function openPasswordModal(){
    passwordInput.value='';
    passwordError.textContent='';
    modalBackdrop.classList.add('open');
    modalBackdrop.setAttribute('aria-hidden','false');
    setTimeout(()=>passwordInput.focus(),30);
  }
  function closePasswordModal(){
    modalBackdrop.classList.remove('open');
    modalBackdrop.setAttribute('aria-hidden','true');
  }
  function submitPassword(){
    if(passwordInput.value==='0000'){
      closePasswordModal();
      setEditMode(true);
    }else{
      passwordError.textContent='비밀번호가 올바르지 않습니다.';
      passwordInput.select();
    }
  }

  modalBackdrop.querySelector('.password-cancel').addEventListener('click',closePasswordModal);
  modalBackdrop.querySelector('.password-confirm').addEventListener('click',submitPassword);
  passwordInput.addEventListener('keydown',event=>{if(event.key==='Enter')submitPassword();});
  modalBackdrop.addEventListener('click',event=>{if(event.target===modalBackdrop)closePasswordModal();});

  editButton?.addEventListener('click', () => {
    if (editMode) setEditMode(false);
    else openPasswordModal();
  });

  addInput?.addEventListener('change', async () => {
    const files = [...addInput.files];
    for (const file of files) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      await addMediaRecord(file);
    }
    addInput.value = '';
    await render();
  });

  resetButton?.addEventListener('click', async () => {
    if (!confirm('기본 이미지를 다시 표시하고, 브라우저에서 추가한 파일을 모두 삭제할까요?')) return;
    localStorage.removeItem(hiddenKey);
    await clearAddedMedia();
    await render();
  });

  lightbox?.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeLightbox();
  });

  render();
})();
