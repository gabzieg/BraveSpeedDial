const rootGrid = document.getElementById('dial-grid');
const folderOverlay = document.getElementById('folder-overlay');
const folderGrid = document.getElementById('folder-grid');
const folderTitle = document.getElementById('folder-title');

const modal = document.getElementById('edit-modal');
const modalNameInput = document.getElementById('dial-name');
const modalUrlInput = document.getElementById('dial-url');
const urlGroup = document.getElementById('url-group');
const typeRadios = document.getElementsByName('dial-type');
const modalPreviewIcon = document.getElementById('modal-preview-icon');
const modalPreview = document.querySelector('.modal-preview');
const saveBtn = document.getElementById('modal-save-btn');
const cancelBtn = document.getElementById('modal-cancel-btn');
const editTitle = document.getElementById('edit-title');
const editError = document.getElementById('edit-error');
const folderCloseBtn = document.getElementById('folder-close-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const syncStatus = document.getElementById('sync-status');

const contextMenu = document.getElementById('context-menu');
const contextEdit = document.getElementById('context-edit');
const contextDelete = document.getElementById('context-delete');
const contextMoveUp = document.getElementById('context-move-up');
const contextMoveDown = document.getElementById('context-move-down');
const contextMoveOut = document.getElementById('context-move-out');
const folderTargets = document.getElementById('folder-targets');

const pageContextMenu = document.getElementById('page-context-menu');
const menuEditTheme = document.getElementById('menu-edit-theme');
const menuAddDial = document.getElementById('menu-add-dial');
const menuBookmarks = document.getElementById('menu-bookmarks');
const menuHistory = document.getElementById('menu-history');

let dials = [];
let editingId = null;
let contextMenuTargetId = null;
let currentFolderId = null;
const returnFocus = new WeakMap();

function openDialog(overlay, focusTarget) {
    returnFocus.set(overlay, document.activeElement);
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    focusTarget.focus();
}

function closeDialog(overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    const previous = returnFocus.get(overlay);
    const fallback = currentFolderId ? folderCloseBtn : settingsBtn;
    (previous?.isConnected ? previous : fallback).focus();
}

async function init() {
    await loadDials();
    renderRoot();
    setupEventListeners();
}

async function loadDials() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['speedDials', 'localOnly'], function(localResult) {
            chrome.storage.sync.get(['speedDials'], function(syncResult) {
                if (localResult.localOnly && Array.isArray(localResult.speedDials)) {
                    dials = localResult.speedDials;
                    syncStatus.hidden = false;
                } else if (Array.isArray(syncResult.speedDials)) {
                    dials = syncResult.speedDials;
                } else if (Array.isArray(localResult.speedDials)) {
                    dials = localResult.speedDials;
                    saveDials();
                } else {
                    dials = [
                        { id: generateId(), name: 'YouTube', url: 'https://youtube.com', isFolder: false },
                        { id: generateId(), name: 'GitHub', url: 'https://github.com', isFolder: false }
                    ];
                    saveDials();
                }
                resolve();
            });
        });
    });
}

function saveDials() {
    const snapshot = structuredClone(dials);
    chrome.storage.local.set({ speedDials: snapshot, localOnly: true }, () => {
        chrome.storage.sync.set({ speedDials: snapshot }, () => {
            const failed = Boolean(chrome.runtime.lastError);
            syncStatus.hidden = !failed;
            if (!failed) chrome.storage.local.set({ localOnly: false });
        });
    });
}
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function getDomain(url) {
    try {
        const urlObj = new URL(formatUrl(url));
        return urlObj.hostname;
    } catch (e) { return ''; }
}

function formatUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
        return parsed.href;
    } catch (e) { return ''; }
}

function validateImportedDials(items) {
    if (!Array.isArray(items)) return null;
    const ids = new Set();
    const validate = (list, insideFolder) => list.map(item => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
            !item.id || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) {
            throw new Error('Atalho inválido');
        }
        ids.add(item.id);
        if (item.isFolder === true) {
            if (insideFolder || !Array.isArray(item.children)) throw new Error('Pasta inválida');
            return { id: item.id, name: item.name.trim(), isFolder: true, children: validate(item.children, true) };
        }
        if (typeof item.url !== 'string' || !formatUrl(item.url)) throw new Error('Endereço inválido');
        return { id: item.id, name: item.name.trim(), isFolder: false, url: formatUrl(item.url) };
    });
    try { return validate(items, false); } catch (e) { return null; }
}

function createDialElement(dial, isInsideFolder) {
    const dialEl = document.createElement('div');
    dialEl.className = 'dial-item' + (dial.isFolder ? ' folder' : '');
    dialEl.dataset.id = dial.id;
    dialEl.draggable = true;
    const mainAction = document.createElement('button');
    mainAction.type = 'button';
    mainAction.className = 'dial-open-btn';
    mainAction.setAttribute('aria-label', dial.isFolder ? `Abrir pasta ${dial.name}` : `Abrir ${dial.name}`);

    const card = document.createElement('div');
    card.className = 'dial-card';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'dial-edit-btn';
    editBtn.setAttribute('aria-label', `Opções de ${dial.name}`);

    if (dial.isFolder) {
        (dial.children || []).slice(0, 4).forEach(child => {
            const domain = getDomain(child.url);
            const icon = document.createElement(domain ? 'img' : 'div');
            icon.className = 'folder-mini-icon';
            if (domain) {
                icon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
                icon.alt = '';
            }
            card.appendChild(icon);
        });
    } else {
        const domain = getDomain(dial.url);
        const fallback = document.createElement('span');
        fallback.className = 'dial-fallback';
        fallback.textContent = dial.name.trim().charAt(0).toLocaleUpperCase() || '•';
        card.appendChild(fallback);
        if (domain) {
            const icon = document.createElement('img');
            icon.className = 'dial-icon';
            icon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
            icon.alt = '';
            icon.addEventListener('error', () => { icon.hidden = true; });
            icon.addEventListener('load', () => { fallback.hidden = true; });
            card.appendChild(icon);
        }
    }

    const title = document.createElement('div');
    title.className = 'dial-title';
    title.title = dial.name;
    title.textContent = dial.name;
    mainAction.append(card, title);
    dialEl.append(mainAction, editBtn);

    const activate = () => {
        if (dial.isFolder) openFolder(dial.id);
        else {
            const targetUrl = formatUrl(dial.url);
            if (targetUrl) window.location.href = targetUrl;
            else openModal(dial);
        }
    };
    mainAction.addEventListener('click', activate);

    editBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        hidePageContextMenu();
        const rect = editBtn.getBoundingClientRect();
        showContextMenu({ clientX: rect.left, clientY: rect.bottom + 4 }, dial.id, true);
    });

    dialEl.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        hidePageContextMenu();
        showContextMenu(e, dial.id);
    });

    dialEl.addEventListener('dragstart', handleDragStart);
    dialEl.addEventListener('dragover', handleDragOver);
    dialEl.addEventListener('dragenter', handleDragEnter);
    dialEl.addEventListener('dragleave', handleDragLeave);
    dialEl.addEventListener('drop', handleDrop);
    dialEl.addEventListener('dragend', handleDragEnd);

    return dialEl;
}

function createAddButton() {
    const addEl = document.createElement('button');
    addEl.className = 'dial-item add-btn';
    addEl.type = 'button';
    addEl.setAttribute('aria-label', 'Adicionar atalho');
    addEl.innerHTML = `<div class="dial-card"><span class="add-icon">+</span></div><div class="dial-title">Adicionar</div>`;
    const trigger = () => openModal();
    addEl.addEventListener('click', trigger);
    return addEl;
}

function renderRoot() {
    rootGrid.innerHTML = '';
    dials.forEach(dial => {
        rootGrid.appendChild(createDialElement(dial, false));
    });
    rootGrid.appendChild(createAddButton());
}

function renderFolder(folderId) {
    folderGrid.innerHTML = '';
    const folder = dials.find(d => d.id === folderId);
    if (!folder) return;
    folderTitle.textContent = folder.name;
    (folder.children || []).forEach(dial => {
        folderGrid.appendChild(createDialElement(dial, true));
    });
    folderGrid.appendChild(createAddButton());
}

function openFolder(folderId) {
    currentFolderId = folderId;
    renderFolder(folderId);
    openDialog(folderOverlay, folderCloseBtn);
}

function closeFolder() {
    const previousId = returnFocus.get(folderOverlay)?.closest('.dial-item')?.dataset.id;
    currentFolderId = null;
    renderRoot();
    closeDialog(folderOverlay);
    if (previousId) rootGrid.querySelector(`[data-id="${CSS.escape(previousId)}"] .dial-open-btn`)?.focus();
}

function openModal(dial = null) {
    editError.hidden = true;
    editTitle.textContent = dial ? 'Editar atalho' : 'Adicionar atalho';
    if (dial) {
        editingId = dial.id;
        modalNameInput.value = dial.name;
        if (dial.isFolder) {
            document.querySelector('input[name="dial-type"][value="folder"]').checked = true;
            urlGroup.style.display = 'none';
            modalPreviewIcon.hidden = true;
            modalPreview.hidden = true;
        } else {
            document.querySelector('input[name="dial-type"][value="site"]').checked = true;
            urlGroup.style.display = 'block';
            modalUrlInput.value = dial.url;
            updateModalPreview(dial.url);
        }
        typeRadios.forEach(r => r.disabled = true);
    } else {
        editingId = null;
        modalNameInput.value = '';
        modalUrlInput.value = '';
        modalPreviewIcon.hidden = true;
        modalPreview.hidden = true;
        document.querySelector('input[name="dial-type"][value="site"]').checked = true;
        urlGroup.style.display = 'block';
        typeRadios.forEach(r => r.disabled = false);
        if (currentFolderId) document.querySelector('input[name="dial-type"][value="folder"]').disabled = true;
    }
    openDialog(modal, modalNameInput);
}

function closeModal() { closeDialog(modal); editingId = null; }

function updateModalPreview(url) {
    const domain = getDomain(url);
    if (domain) {
        modalPreviewIcon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
        modalPreviewIcon.hidden = false;
        modalPreview.hidden = false;
    } else {
        modalPreviewIcon.hidden = true;
        modalPreview.hidden = true;
    }
}

function placeMenu(menu, e) {
    menu.classList.add('active');
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(e.clientX, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(e.clientY, window.innerHeight - rect.height - 8))}px`;
}

function showContextMenu(e, id, focus = false) {
    contextMenuTargetId = id;
    const items = getCurrentItems();
    const index = items.findIndex(item => item.id === id);
    const selected = items[index];
    contextMoveUp.hidden = index <= 0;
    contextMoveDown.hidden = index < 0 || index >= items.length - 1;
    contextMoveOut.hidden = !currentFolderId;
    folderTargets.replaceChildren();
    if (!currentFolderId && selected && !selected.isFolder) {
        dials.filter(item => item.isFolder).forEach(folder => {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'menuitem');
            button.textContent = `Mover para ${folder.name}`;
            button.addEventListener('click', event => {
                event.stopPropagation();
                const moved = dials.splice(dials.findIndex(item => item.id === id), 1)[0];
                (folder.children ||= []).push(moved);
                hideContextMenu();
                saveDials();
                renderRoot();
                rootGrid.querySelector(`[data-id="${CSS.escape(folder.id)}"] .dial-open-btn`)?.focus();
            });
            folderTargets.appendChild(button);
        });
    }
    placeMenu(contextMenu, e);
    if (focus) contextEdit.focus();
}

function hideContextMenu() {
    const wasFocused = contextMenu.contains(document.activeElement);
    const targetId = contextMenuTargetId;
    contextMenu.classList.remove('active');
    contextMenuTargetId = null;
    if (wasFocused && targetId) {
        document.querySelector(`.dial-item[data-id="${CSS.escape(targetId)}"] .dial-edit-btn`)?.focus();
    }
}

function showPageContextMenu(e) {
    hideContextMenu();
    placeMenu(pageContextMenu, e);
}

function hidePageContextMenu() { pageContextMenu.classList.remove('active'); }

function getCurrentItems() {
    if (currentFolderId) {
        const folder = dials.find(d => d.id === currentFolderId);
        return folder ? folder.children : [];
    }
    return dials;
}

function renderCurrentItems() {
    if (currentFolderId) renderFolder(currentFolderId);
    else renderRoot();
}

function setupEventListeners() {
    cancelBtn.addEventListener('click', closeModal);
    folderCloseBtn.addEventListener('click', closeFolder);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal.classList.contains('active')) closeModal();
            else if (settingsModal.classList.contains('active')) closeDialog(settingsModal);
            else if (contextMenu.classList.contains('active')) hideContextMenu();
            else if (pageContextMenu.classList.contains('active')) hidePageContextMenu();
            else if (folderOverlay.classList.contains('active')) closeFolder();
            return;
        }
        if (e.key !== 'Tab') return;
        const active = [modal, settingsModal, folderOverlay].find(overlay => overlay.classList.contains('active'));
        if (!active) return;
        const focusable = Array.from(active.querySelectorAll('button:not([disabled]), input:not([disabled]):not([hidden]), select:not([disabled]), [tabindex="0"]'))
            .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        if (!focusable.length) return;
        if (e.shiftKey && document.activeElement === focusable[0]) {
            e.preventDefault();
            focusable.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === focusable.at(-1)) {
            e.preventDefault();
            focusable[0].focus();
        }
    });
    
    // Close folder when clicking outside the popup content
    folderOverlay.addEventListener('click', (e) => {
        if (e.target === folderOverlay) closeFolder();
    });
    
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    typeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            urlGroup.style.display = e.target.value === 'folder' ? 'none' : 'block';
            if (e.target.value === 'folder') {
                modalPreviewIcon.hidden = true;
                modalPreview.hidden = true;
            }
            else updateModalPreview(modalUrlInput.value);
        });
    });

    saveBtn.addEventListener('click', () => {
        const name = modalNameInput.value.trim();
        const type = document.querySelector('input[name="dial-type"]:checked').value;
        const url = type === 'site' ? formatUrl(modalUrlInput.value.trim()) : '';

        if (!name) {
            editError.textContent = 'Informe um nome para o atalho.';
            editError.hidden = false;
            modalNameInput.focus();
            return;
        }
        if (type === 'site' && !url) {
            editError.textContent = 'Informe um endereço HTTP ou HTTPS válido.';
            editError.hidden = false;
            modalUrlInput.focus();
            return;
        }

        const items = getCurrentItems();

        if (editingId) {
            const index = items.findIndex(d => d.id === editingId);
            if (index !== -1) {
                items[index].name = name;
                if (type === 'site') items[index].url = url;
            }
        } else {
            const newItem = { id: generateId(), name, isFolder: (type === 'folder') };
            if (type === 'site') newItem.url = url;
            else newItem.children = [];
            items.push(newItem);
        }

        saveDials(); 
        if (currentFolderId) renderFolder(currentFolderId);
        else renderRoot();
        closeModal();
    });
    
    modalNameInput.addEventListener('input', () => { editError.hidden = true; });
    modalUrlInput.addEventListener('input', (e) => {
        editError.hidden = true;
        updateModalPreview(e.target.value);
    });

    const handleEnter = (e) => { if (e.key === 'Enter') saveBtn.click(); };
    modalNameInput.addEventListener('keydown', handleEnter);
    modalUrlInput.addEventListener('keydown', handleEnter);

    document.addEventListener('click', () => {
        hideContextMenu();
        hidePageContextMenu();
    });

    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.dial-item')) {
            e.preventDefault();
            showPageContextMenu(e);
        }
    });

    contextEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        const dial = getCurrentItems().find(d => d.id === contextMenuTargetId);
        hideContextMenu();
        if (dial) openModal(dial);
    });

    function moveSelectedBy(offset) {
        const id = contextMenuTargetId;
        const items = getCurrentItems();
        const from = items.findIndex(item => item.id === id);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= items.length) return;
        items.splice(to, 0, items.splice(from, 1)[0]);
        hideContextMenu();
        saveDials();
        renderCurrentItems();
        (currentFolderId ? folderGrid : rootGrid).querySelector(`[data-id="${CSS.escape(id)}"] .dial-open-btn`)?.focus();
    }
    contextMoveUp.addEventListener('click', (e) => { e.stopPropagation(); moveSelectedBy(-1); });
    contextMoveDown.addEventListener('click', (e) => { e.stopPropagation(); moveSelectedBy(1); });
    contextMoveOut.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = contextMenuTargetId;
        const folder = dials.find(item => item.id === currentFolderId);
        const index = folder?.children.findIndex(item => item.id === id) ?? -1;
        if (index < 0) return;
        dials.push(folder.children.splice(index, 1)[0]);
        hideContextMenu();
        saveDials();
        renderFolder(currentFolderId);
        renderRoot();
        folderCloseBtn.focus();
    });

    contextDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = contextMenuTargetId;
        const target = getCurrentItems().find(d => d.id === targetId);
        hideContextMenu();
        if (!target) return;
        const message = target.isFolder && (target.children || []).length > 0
            ? `Excluir a pasta "${target.name}" e os ${target.children.length} atalho(s) dentro dela?`
            : `Excluir "${target.name}"?`;
        if (!confirm(message)) return;
        if (currentFolderId) {
            const folder = dials.find(d => d.id === currentFolderId);
            folder.children = folder.children.filter(d => d.id !== targetId);
        } else {
            dials = dials.filter(d => d.id !== targetId);
        }
        saveDials();
        if (currentFolderId) renderFolder(currentFolderId);
        else renderRoot();
        (currentFolderId ? folderGrid : rootGrid).querySelector('.add-btn')?.focus();
    });

    // Page Context Menu Actions
    menuEditTheme.addEventListener('click', (e) => {
        e.stopPropagation();
        hidePageContextMenu();
        openDialog(settingsModal, document.getElementById('choose-wallpaper-btn'));
    });

    menuAddDial.addEventListener('click', (e) => {
        e.stopPropagation();
        hidePageContextMenu();
        openModal();
    });

    menuBookmarks.addEventListener('click', () => {
        chrome.tabs.update({ url: 'chrome://bookmarks/' });
    });

    menuHistory.addEventListener('click', () => {
        chrome.tabs.update({ url: 'chrome://history/' });
    });
    document.getElementById('settings-bookmarks').addEventListener('click', () => menuBookmarks.click());
    document.getElementById('settings-history').addEventListener('click', () => menuHistory.click());

    // Drop Zone outside folder (anywhere in the overlay background)
    folderOverlay.addEventListener('dragover', (e) => {
        if (e.target === folderOverlay) {
            e.preventDefault();
            folderOverlay.classList.add('drag-over-background');
        }
    });
    folderOverlay.addEventListener('dragleave', (e) => {
        if (e.target === folderOverlay) {
            folderOverlay.classList.remove('drag-over-background');
        }
    });
    folderOverlay.addEventListener('drop', (e) => {
        folderOverlay.classList.remove('drag-over-background');
        if (e.target === folderOverlay) {
            e.preventDefault();
            moveDraggedItemOutOfFolder();
        }
    });

    // Visible "solte aqui para tirar da pasta" pill
    const outOfFolderDrop = document.getElementById('out-of-folder-drop');
    outOfFolderDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        outOfFolderDrop.classList.add('drag-over');
    });
    outOfFolderDrop.addEventListener('dragleave', () => {
        outOfFolderDrop.classList.remove('drag-over');
    });
    outOfFolderDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        outOfFolderDrop.classList.remove('drag-over');
        moveDraggedItemOutOfFolder();
    });

    function moveDraggedItemOutOfFolder() {
        if (!draggedId || !currentFolderId) return;
        const folder = dials.find(d => d.id === currentFolderId);
        if (!folder) return;
        const itemIndex = folder.children.findIndex(d => d.id === draggedId);
        if (itemIndex !== -1) {
            const item = folder.children.splice(itemIndex, 1)[0];
            dials.push(item);
            saveDials();
            renderFolder(currentFolderId);
            renderRoot(); // Update background root too
        }
    }

    // --- Settings Logic ---
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    const settingsTopCloseBtn = document.getElementById('settings-top-close-btn');
    const chooseWallpaperBtn = document.getElementById('choose-wallpaper-btn');
    const wallpaperUpload = document.getElementById('wallpaper-upload');
    const removeWallpaperBtn = document.getElementById('remove-wallpaper-btn');
    const wallpaperSizeSelect = document.getElementById('wallpaper-size');

    function loadWallpaper() {
        chrome.storage.local.get(['wallpaper', 'wallpaperSize'], function(result) {
            if (result.wallpaper) {
                document.body.style.backgroundImage = 'url(' + result.wallpaper + ')';
                const size = result.wallpaperSize || 'cover';
                wallpaperSizeSelect.value = size;
                
                if (size === 'cover') {
                    document.body.style.backgroundSize = 'cover';
                    document.body.style.backgroundPosition = 'center';
                    document.body.style.backgroundRepeat = 'no-repeat';
                } else if (size === 'contain') {
                    document.body.style.backgroundSize = 'contain';
                    document.body.style.backgroundPosition = 'center';
                    document.body.style.backgroundRepeat = 'no-repeat';
                } else if (size === 'repeat') {
                    document.body.style.backgroundSize = 'auto';
                    document.body.style.backgroundPosition = 'top left';
                    document.body.style.backgroundRepeat = 'repeat';
                }
            } else {
                document.body.style.backgroundImage = 'radial-gradient(circle at center, #2a2a2a 0%, #121212 100%)';
                document.body.style.backgroundSize = 'cover';
            }
        });
    }

    settingsBtn.addEventListener('click', () => {
        openDialog(settingsModal, chooseWallpaperBtn);
    });

    settingsCloseBtn.addEventListener('click', () => closeDialog(settingsModal));
    settingsTopCloseBtn.addEventListener('click', () => closeDialog(settingsModal));
    
    chooseWallpaperBtn.addEventListener('click', () => {
        wallpaperUpload.click();
    });

    wallpaperUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                chrome.storage.local.set({ 
                    wallpaper: event.target.result,
                    wallpaperSize: wallpaperSizeSelect.value
                }, loadWallpaper);
            };
            reader.readAsDataURL(file);
        }
    });

    wallpaperSizeSelect.addEventListener('change', (e) => {
        chrome.storage.local.set({ wallpaperSize: e.target.value }, loadWallpaper);
    });

    removeWallpaperBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['wallpaper', 'wallpaperSize'], loadWallpaper);
    });

    // --- Accent Color ---
    const DEFAULT_ACCENT = '#6a3ceb';
    const accentColorInput = document.getElementById('accent-color');
    const resetColorBtn = document.getElementById('reset-color-btn');

    function applyAccentColor(color) {
        document.documentElement.style.setProperty('--primary-color', color);
        const red = parseInt(color.slice(1, 3), 16);
        const green = parseInt(color.slice(3, 5), 16);
        const blue = parseInt(color.slice(5, 7), 16);
        document.documentElement.style.setProperty('--primary-contrast',
            (red * 0.299 + green * 0.587 + blue * 0.114) > 160 ? '#171717' : '#ffffff');
        accentColorInput.value = color;
    }

    function loadAccentColor() {
        chrome.storage.local.get(['accentColor'], (result) => {
            applyAccentColor(result.accentColor || DEFAULT_ACCENT);
        });
    }

    accentColorInput.addEventListener('input', (e) => {
        applyAccentColor(e.target.value);
        chrome.storage.local.set({ accentColor: e.target.value });
    });

    resetColorBtn.addEventListener('click', () => {
        applyAccentColor(DEFAULT_ACCENT);
        chrome.storage.local.remove(['accentColor']);
    });

    // --- Export / Import ---
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importInput = document.getElementById('import-input');

    exportBtn.addEventListener('click', () => {
        const payload = { version: 1, exportedAt: new Date().toISOString(), speedDials: dials };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `speed-dial-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            let parsed;
            try {
                parsed = JSON.parse(event.target.result);
            } catch (err) {
                alert('Arquivo inválido: não é um JSON válido.');
                return;
            }
            const importedDials = Array.isArray(parsed) ? parsed : parsed?.speedDials;
            const validDials = validateImportedDials(importedDials);
            if (!validDials) {
                alert('Arquivo inválido: verifique os atalhos, pastas e endereços.');
                return;
            }
            if (!confirm(`Importar ${validDials.length} item(ns)? Isso substituirá todos os atalhos atuais.`)) return;
            dials = validDials;
            saveDials();
            renderRoot();
        };
        reader.readAsText(file);
        importInput.value = '';
    });

    loadWallpaper();
    loadAccentColor();
}

// --- Drag and Drop Logic ---
let draggedItem = null;
let draggedId = null;
let dragTargetFolderId = null;

function handleDragStart(e) {
    draggedItem = this;
    draggedId = this.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
    setTimeout(() => {
        this.classList.add('dragging');
        if (currentFolderId) folderOverlay.classList.add('dragging-item');
    }, 0);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const targetItem = e.target.closest('.dial-item');
    document.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
    dragTargetFolderId = null;

    if (targetItem && targetItem !== draggedItem) {
        const isFolder = targetItem.classList.contains('folder');
        const draggedData = getCurrentItems().find(d => d.id === draggedId);
        
        if (isFolder && (!draggedData || !draggedData.isFolder)) {
            targetItem.classList.add('drag-target');
            dragTargetFolderId = targetItem.dataset.id;
        } else {
            const rect = targetItem.getBoundingClientRect();
            const next = ((e.clientX - rect.left) > rect.width / 2);
            const grid = currentFolderId ? folderGrid : rootGrid;
            if (next && targetItem.nextSibling) {
                grid.insertBefore(draggedItem, targetItem.nextSibling);
            } else {
                grid.insertBefore(draggedItem, targetItem);
            }
        }
    }
    return false;
}

function handleDragEnter(e) { e.preventDefault(); }
function handleDragLeave(e) {
    const targetItem = e.target.closest('.dial-item');
    if (targetItem) targetItem.classList.remove('drag-target');
}

function handleDrop(e) { e.stopPropagation(); return false; }

function handleDragEnd(e) {
    this.classList.remove('dragging');
    folderOverlay.classList.remove('dragging-item');
    document.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
    
    if (dragTargetFolderId) {
        const items = getCurrentItems();
        const draggedIndex = items.findIndex(d => d.id === draggedId);
        const targetFolder = dials.find(d => d.id === dragTargetFolderId);
        
        if (draggedIndex !== -1 && targetFolder && !currentFolderId) {
            const itemData = items.splice(draggedIndex, 1)[0];
            if (!targetFolder.children) targetFolder.children = [];
            targetFolder.children.push(itemData);
            saveDials();
            renderRoot();
        }
    } else {
        saveNewOrder();
    }
    
    draggedItem = null;
    dragTargetFolderId = null;
}

function saveNewOrder() {
    const grid = currentFolderId ? folderGrid : rootGrid;
    const currentDialEls = grid.querySelectorAll('.dial-item');
    const newOrderIds = Array.from(currentDialEls).map(el => el.dataset.id);
    const items = getCurrentItems();
    const newItems = newOrderIds.map(id => items.find(d => d.id === id)).filter(Boolean);
    
    if (currentFolderId) {
        const folder = dials.find(d => d.id === currentFolderId);
        folder.children = newItems;
    } else {
        dials = newItems;
    }
    saveDials();
}

init();
