let windowCount = 0;
const shortcuts = {};
const canvasHistories = {};
let closedWindowsHistory = [];

let settings = JSON.parse(localStorage.getItem('tititache_settings')) || {};
if (!settings.classes || typeof settings.classes !== 'object') {
  settings.classes = {
    "6ème A": ["Lucas", "Sarah", "Thomas", "Emma", "Hugo", "Léa", "Antoine", "Manon"],
    "5ème B": ["Alexandre", "Camille", "Gabriel", "Jade", "Louis", "Chloé"]
  };
}
if (!settings.activeClass || !settings.classes[settings.activeClass]) {
  settings.activeClass = Object.keys(settings.classes)[0] || "Classe 1";
}
settings.drawDuration = settings.drawDuration || 3;
settings.chancesCount = settings.chancesCount || 3;
settings.quoteText = settings.quoteText || "La lecture est à l'esprit ce que l'exercice est au corps.";
settings.quoteAuthor = settings.quoteAuthor || "Joseph Addison";
settings.whiteoutKey = settings.whiteoutKey || "B";
settings.classesHidden = settings.classesHidden || false;

if (!settings.classData || typeof settings.classData !== 'object') {
  settings.classData = {};
}

window.onload = () => {
  restoreClassSpecificData(settings.activeClass);
  applyClassesHiddenState();

  const durationInput = document.getElementById('setting-draw-duration');
  if (durationInput) durationInput.value = settings.drawDuration;

  const chancesInput = document.getElementById('setting-chances-count');
  if (chancesInput) chancesInput.value = settings.chancesCount;

  const quoteTextElem = document.getElementById('setting-quote-text');
  if (quoteTextElem) quoteTextElem.value = settings.quoteText;

  const quoteAuthElem = document.getElementById('setting-quote-author');
  if (quoteAuthElem) quoteAuthElem.value = settings.quoteAuthor;

  renderClassTabs();
  load30DefaultBackgrounds();
};

function saveSettings() {
  localStorage.setItem('tititache_settings', JSON.stringify(settings));
}

function updateCustomQuote() {
  const textEl = document.getElementById('setting-quote-text');
  const authEl = document.getElementById('setting-quote-author');
  if (textEl && authEl) {
    settings.quoteText = textEl.value.trim();
    settings.quoteAuthor = authEl.value.trim();
    saveSettings();
  }
}

// --- SYSTÈME DE MODALE INTERNE ---
let modalCallback = null;

function showCustomModal(title, desc, isPrompt, defaultValue, callback) {
  const modal = document.getElementById('custom-modal');
  const titleEl = document.getElementById('custom-modal-title');
  const descEl = document.getElementById('custom-modal-desc');
  const inputEl = document.getElementById('custom-modal-input');
  const cancelBtn = document.getElementById('custom-modal-cancel');

  titleEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${title}`;
  descEl.textContent = desc;
  
  if (isPrompt) {
    inputEl.style.display = 'block';
    inputEl.value = defaultValue || '';
    cancelBtn.style.display = 'inline-block';
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
  } else {
    inputEl.style.display = 'none';
    cancelBtn.style.display = 'none';
  }

  modal.style.display = 'flex';
  modalCallback = callback;
}

function closeCustomModal(confirmed) {
  const modal = document.getElementById('custom-modal');
  modal.style.display = 'none';
  const inputVal = document.getElementById('custom-modal-input').value;
  if (modalCallback) {
    modalCallback(confirmed, inputVal);
    modalCallback = null;
  }
}

function confirmCustomModal(confirmed) {
  closeCustomModal(confirmed);
}

// --- MASQUER / AFFICHER LES CLASSES ---
function toggleHideClasses() {
  settings.classesHidden = !settings.classesHidden;
  saveSettings();
  applyClassesHiddenState();
}

function applyClassesHiddenState() {
  const classBar = document.getElementById('class-bar');
  const desktop = document.getElementById('desktop');
  const restoreBtn = document.getElementById('restore-classes-btn');
  const btnText = document.getElementById('hide-classes-text');
  const btnIcon = document.querySelector('#hide-classes-btn i');

  if (settings.classesHidden) {
    if (classBar) classBar.classList.add('hidden');
    if (desktop) desktop.classList.add('expanded');
    if (restoreBtn) restoreBtn.classList.add('visible');
    if (btnText) btnText.textContent = "Afficher les classes";
    if (btnIcon) btnIcon.className = "fa-solid fa-eye";
  } else {
    if (classBar) classBar.classList.remove('hidden');
    if (desktop) desktop.classList.remove('expanded');
    if (restoreBtn) restoreBtn.classList.remove('visible');
    if (btnText) btnText.textContent = "Masquer les classes";
    if (btnIcon) btnIcon.className = "fa-solid fa-eye-slash";
  }
}

// --- SAUVEGARDE GLOBALE & HISTORIQUE ---
function saveCurrentClassData() {
  const activeCls = settings.activeClass;
  if (!settings.classData[activeCls]) settings.classData[activeCls] = {};
  
  const windowsList = [];
  document.querySelectorAll('.window').forEach(win => {
    const typeClass = Array.from(win.classList).find(c => c.startsWith('window-') && c !== 'window-no-resize');
    if (typeClass) {
      const type = typeClass.replace('window-', '');
      let extraData = extractWindowExtraData(win, type);

      windowsList.push({
        type: type,
        top: win.style.top,
        left: win.style.left,
        width: win.style.width,
        height: win.style.height,
        extra: extraData
      });
    }
  });

  settings.classData[activeCls].openWindows = windowsList;
  settings.classData[activeCls].bgType = settings.bgType || 'color';
  settings.classData[activeCls].bgVal = settings.bgVal || '#f8fafc';
  
  saveSettings();
}

function extractWindowExtraData(win, type) {
  let extraData = {};
  if (type === 'notes') {
    const editor = win.querySelector('.wysiwyg-editor');
    if (editor) extraData.html = editor.innerHTML;
  } else if (type === 'traffic') {
    const activeLight = win.querySelector('.traffic-light.active');
    if (activeLight) {
      if (activeLight.classList.contains('red')) extraData.color = 'red';
      else if (activeLight.classList.contains('orange')) extraData.color = 'orange';
      else extraData.color = 'green';
    }
  } else if (type === 'scoreboard') {
    const select = win.querySelector('select');
    if (select) extraData.scoreMode = select.value;
    if (scoresData[win.id]) extraData.scores = scoresData[win.id];
  } else if (type === 'silence') {
    const lostBars = [];
    win.querySelectorAll('.chance-bar').forEach((bar, idx) => {
      if (bar.classList.contains('lost')) lostBars.push(idx);
    });
    extraData.lostChances = lostBars;
  } else if (type === 'draw') {
    const canvas = win.querySelector('canvas');
    if (canvas) extraData.drawingData = canvas.toDataURL();
  }
  return extraData;
}

function closeWindowWithHistory(winElement) {
  const typeClass = Array.from(winElement.classList).find(c => c.startsWith('window-') && c !== 'window-no-resize');
  if (typeClass) {
    const type = typeClass.replace('window-', '');
    const winInfo = {
      type: type,
      top: winElement.style.top,
      left: winElement.style.left,
      width: winElement.style.width,
      height: winElement.style.height,
      extra: extractWindowExtraData(winElement, type)
    };
    closedWindowsHistory.push(winInfo);
    if (closedWindowsHistory.length > 10) closedWindowsHistory.shift();
  }
  saveCurrentClassData();
  winElement.remove();
}

function restoreClassSpecificData(className) {
  document.querySelectorAll('.window').forEach(w => w.remove());

  if (!settings.classData[className]) {
    settings.classData[className] = {
      openWindows: [],
      bgType: 'color',
      bgVal: '#f8fafc'
    };
  }
  
  const data = settings.classData[className];
  
  if (data.bgType === 'image') {
    setBgImage(data.bgVal, false);
  } else {
    setBgColor(data.bgVal, false);
  }

  if (data.openWindows && Array.isArray(data.openWindows)) {
    data.openWindows.forEach(winInfo => {
      createWindow(winInfo.type, winInfo.extra, winInfo.top, winInfo.left, winInfo.width, winInfo.height);
    });
  }
}

function load30DefaultBackgrounds() {
  const grid = document.getElementById('default-bg-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const defaultBgs = [
    { type: 'color', val: '#f8fafc', title: 'Gris Épuré' },
    { type: 'color', val: '#0f172a', title: 'Sombre Nuit' },
    { type: 'color', val: '#fef3c7', title: 'Jaune Papier' },
    { type: 'color', val: '#dcfce7', title: 'Vert Doux' },
    { type: 'color', val: '#e0e7ff', title: 'Bleu Ciel' },
    'https://picsum.photos/id/1073/800/600',
    'https://picsum.photos/id/1062/800/600',
    'https://picsum.photos/id/24/800/600',
    'https://picsum.photos/id/1041/800/600',
    'https://picsum.photos/id/1039/800/600',
    'https://picsum.photos/id/10/800/600',
    'https://picsum.photos/id/1025/800/600',
    'https://picsum.photos/id/1069/800/600',
    'https://picsum.photos/id/1070/800/600',
    'https://picsum.photos/id/1084/800/600',
    'https://picsum.photos/id/119/800/600',
    'https://picsum.photos/id/133/800/600',
    'https://picsum.photos/id/145/800/600',
    'https://picsum.photos/id/160/800/600',
    'https://picsum.photos/id/180/800/600',
    'https://picsum.photos/id/190/800/600',
    'https://picsum.photos/id/200/800/600',
    'https://picsum.photos/id/219/800/600',
    'https://picsum.photos/id/225/800/600',
    'https://picsum.photos/id/238/800/600',
    'https://picsum.photos/id/250/800/600'
  ];

  defaultBgs.forEach(item => {
    const thumb = document.createElement('div');
    thumb.className = 'bg-thumb';
    if (typeof item === 'object') {
      thumb.style.backgroundColor = item.val;
      thumb.title = item.title;
      thumb.onclick = () => setBgColor(item.val);
    } else {
      thumb.style.backgroundImage = `url('${item}')`;
      thumb.onclick = () => setBgImage(item);
    }
    grid.appendChild(thumb);
  });
}

function playDingDong() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc1 = ctx.createOscillator(), gain1 = ctx.createGain();
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.5, ctx.currentTime); gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc1.connect(gain1); gain1.connect(ctx.destination); osc1.start(); osc1.stop(ctx.currentTime + 0.8);

    setTimeout(() => {
      const osc2 = ctx.createOscillator(), gain2 = ctx.createGain();
      osc2.type = 'sine'; osc2.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain2.gain.setValueAtTime(0.6, ctx.currentTime); gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc2.connect(gain2); gain2.connect(ctx.destination); osc2.start(); osc2.stop(ctx.currentTime + 1.2);
    }, 300);
  } catch(e) {}
}

function openClassModal() {
  showCustomModal("Nouvelle classe", "Entrez le nom de votre classe :", true, "", (confirmed, val) => {
    if (confirmed && val && val.trim()) {
      const name = val.trim();
      saveCurrentClassData();
      if (!settings.classes[name]) {
        settings.classes[name] = [];
      }
      settings.activeClass = name;
      saveSettings();
      renderClassTabs();
      restoreClassSpecificData(name);

      setTimeout(() => {
        const dropdown = document.getElementById(`dropdown-${escapeClassName(name)}`);
        if (dropdown) dropdown.classList.add('open');
      }, 100);
    }
  });
}

function renderClassTabs() {
  const container = document.getElementById('class-tabs');
  if (!container) return;
  container.innerHTML = '';

  for (const className in settings.classes) {
    const wrapper = document.createElement('div');
    wrapper.className = 'class-tab-wrapper';

    const isActive = (className === settings.activeClass);
    const students = settings.classes[className] || [];
    const safeClassNameId = escapeClassName(className);
    const escapedName = escapeStringLiteral(className);

    wrapper.innerHTML = `
      <div class="class-tab ${isActive ? 'active' : ''}" onclick="selectClass('${escapedName}')">
        <span>${className}</span>
        <span class="class-tab-dropdown-btn" onclick="toggleStudentsMenu('${escapedName}', event)" title="Voir/ajouter des élèves">
          Élèves (${students.length}) <i class="fa-solid fa-chevron-down"></i>
        </span>
        <i class="fa-solid fa-xmark delete-class-btn" onclick="deleteClass('${escapedName}', event)"></i>
      </div>

      <div class="students-dropdown-menu" id="dropdown-${safeClassNameId}" onclick="event.stopPropagation()">
        <div class="dropdown-header">
          <span>Élèves de ${className}</span>
          <button class="btn-subtle" onclick="addStudentToClass('${escapedName}', event)">+ Ajouter</button>
        </div>
        <div class="students-list-scroll">
          ${students.length === 0 ? '<div style="font-size:0.75rem; color:#94a3b8; text-align:center; padding:8px;">Aucun élève</div>' : 
            students.map((st, idx) => `
              <div class="student-item-row">
                <span>${st}</span>
                <i class="fa-solid fa-trash" onclick="removeStudentFromClass('${escapedName}',${idx}, event)"></i>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
    container.appendChild(wrapper);
  }
}

function escapeClassName(name) {
  return 'c_' + btoa(unescape(encodeURIComponent(name))).replace(/[^a-zA-Z0-9]/g, '');
}

function escapeStringLiteral(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function toggleStudentsMenu(className, e) {
  if (e) e.stopPropagation();
  const dropdownId = `dropdown-${escapeClassName(className)}`;
  const targetDropdown = document.getElementById(dropdownId);
  
  document.querySelectorAll('.students-dropdown-menu').forEach(d => {
    if (d !== targetDropdown) d.classList.remove('open');
  });
  
  if (targetDropdown) {
    targetDropdown.classList.toggle('open');
  }
}

window.addEventListener('click', (e) => {
  if (!e.target.closest('.class-tab-wrapper')) {
    document.querySelectorAll('.students-dropdown-menu').forEach(d => d.classList.remove('open'));
  }
});

function selectClass(className) {
  if (settings.activeClass !== className) {
    saveCurrentClassData();
    settings.activeClass = className;
    saveSettings();
    renderClassTabs();
    restoreClassSpecificData(className);
  }
}

function deleteClass(className, e) {
  e.stopPropagation();
  showCustomModal("Confirmation", `Supprimer la classe ${className} ?`, false, "", (confirmed) => {
    if (confirmed) {
      delete settings.classes[className];
      delete settings.classData[className];
      const remaining = Object.keys(settings.classes);
      if (remaining.length > 0) selectClass(remaining[0]);
      else { settings.classes["Classe 1"] = []; selectClass("Classe 1"); }
    }
  });
}

function addStudentToClass(className, e) {
  if (e) e.stopPropagation();
  showCustomModal("Ajouter un élève", `Entrez le nom de l'élève pour ${className} :`, true, "", (confirmed, val) => {
    if (confirmed && val && val.trim()) {
      if (!settings.classes[className]) settings.classes[className] = [];
      settings.classes[className].push(val.trim());
      saveSettings();
      renderClassTabs();
      setTimeout(() => {
        const dropdown = document.getElementById(`dropdown-${escapeClassName(className)}`);
        if (dropdown) dropdown.classList.add('open');
      }, 50);
    }
  });
}

function removeStudentFromClass(className, index, e) {
  if (e) e.stopPropagation();
  if (settings.classes[className]) {
    settings.classes[className].splice(index, 1);
    saveSettings();
    renderClassTabs();
    setTimeout(() => {
      const dropdown = document.getElementById(`dropdown-${escapeClassName(className)}`);
      if (dropdown) dropdown.classList.add('open');
    }, 50);
  }
}

function setupWhiteoutKey() {
  showCustomModal("Mode Tableau", `Entrez la lettre ou touche pour activer/désactiver le mode tableau (actuelle : ${settings.whiteoutKey}) :`, true, settings.whiteoutKey, (confirmed, val) => {
    if (confirmed && val && val.trim().length === 1) {
      settings.whiteoutKey = val.trim().toUpperCase();
      saveSettings();
      showCustomModal("Succès", `Mode tableau configuré sur la touche [ ${settings.whiteoutKey} ]`, false, "", null);
    }
  });
}

function toggleWhiteoutMode() {
  const screen = document.getElementById('whiteout-screen');
  screen.classList.toggle('active');
}

// --- GESTION DES RACCOURCIS GLOBAUX (CTRL+Z / CTRL+Y) ---
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
    const activeWin = document.activeElement.closest('.window');
    
    // Si on est dans une fenêtre de dessin, Ctrl+Z / Ctrl+Y gèrent les traits
    if (activeWin && activeWin.classList.contains('window-draw')) {
      e.preventDefault();
      const winId = activeWin.id;
      if (e.key.toLowerCase() === 'z') undoCanvas(winId);
      else redoCanvas(winId);
      return;
    }

    // Sinon, hors champ texte, Ctrl+Z restaure la dernière fenêtre fermée
    if (!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      if (e.key.toLowerCase() === 'z' && closedWindowsHistory.length > 0) {
        e.preventDefault();
        const lastWin = closedWindowsHistory.pop();
        createWindow(lastWin.type, lastWin.extra, lastWin.top, lastWin.left, lastWin.width, lastWin.height);
        saveCurrentClassData();
        return;
      }
    }
  }

  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
  const key = e.key.toUpperCase();

  if (key === settings.whiteoutKey) {
    e.preventDefault();
    toggleWhiteoutMode();
    return;
  }

  for (const winId in shortcuts) {
    if (shortcuts[winId] === key) {
      e.preventDefault();
      const win = document.getElementById(winId);
      if (win) win.style.display = (win.style.display === 'none') ? 'flex' : 'none';
    }
  }
});

function setShortcut(winId) {
  showCustomModal("Raccourci", "Appuyez sur une touche pour afficher/masquer cette fenêtre :", true, "", (confirmed, val) => {
    if (confirmed && val && val.trim()) {
      const key = val.trim().toUpperCase();
      shortcuts[winId] = key === ' ' ? 'SPACE' : key;
      const badge = document.getElementById(`badge-${winId}`);
      if (badge) badge.textContent = shortcuts[winId];
    }
  });
}

function toggleSettingsSidebar() { document.getElementById('settings-sidebar').classList.toggle('open'); }
function toggleBgSidebar() { document.getElementById('bg-sidebar').classList.toggle('open'); }

const dropOverlay = document.getElementById('drop-overlay');
window.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.style.display = 'flex'; });
dropOverlay.addEventListener('dragleave', () => { dropOverlay.style.display = 'none'; });
dropOverlay.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.style.display = 'none';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (event) => setBgImage(event.target.result);
    reader.readAsDataURL(file);
  }
});

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => setBgImage(event.target.result);
    reader.readAsDataURL(file);
  }
}

function searchImages() {
  const query = document.getElementById('bg-search-input').value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = '<div style="font-size:0.8rem; color:#64748b; grid-column:span 2; text-align:center;">Recherche de photos...</div>';

  setTimeout(() => {
    resultsDiv.innerHTML = '';
    for (let i = 1; i <= 4; i++) {
      const imgUrl = `https://picsum.photos/id/${150 + i + Math.floor(Math.random()*50)}/800/600`;
      const thumb = document.createElement('div');
      thumb.className = 'bg-thumb';
      thumb.style.backgroundImage = `url('${imgUrl}')`;
      thumb.onclick = () => setBgImage(imgUrl);
      resultsDiv.appendChild(thumb);
    }
  }, 400);
}

function setBgColor(color, save = true) {
  document.body.style.backgroundImage = 'none';
  document.body.style.backgroundColor = color;
  settings.bgType = 'color';
  settings.bgVal = color;
  if (save) {
    if (!settings.classData[settings.activeClass]) settings.classData[settings.activeClass] = {};
    settings.classData[settings.activeClass].bgType = 'color';
    settings.classData[settings.activeClass].bgVal = color;
    saveSettings();
  }
}

function setBgImage(url, save = true) {
  document.body.style.backgroundImage = `url('${url}')`;
  settings.bgType = 'image';
  settings.bgVal = url;
  if (save) {
    if (!settings.classData[settings.activeClass]) settings.classData[settings.activeClass] = {};
    settings.classData[settings.activeClass].bgType = 'image';
    settings.classData[settings.activeClass].bgVal = url;
    saveSettings();
  }
}

// --- CRÉATION DE FENÊTRES ---
function createWindow(type, extraData = null, customTop = null, customLeft = null, customWidth = null, customHeight = null) {
  if (type === 'silence' && document.querySelector('.window-silence-type')) {
    showCustomModal("Information", "Une fenêtre de chances est déjà ouverte !", false, "", null);
    return;
  }

  windowCount++;
  const winId = `window-${windowCount}`;
  const win = document.createElement('div');
  
  win.className = `window active-window ${type === 'silence' || type === 'traffic' ? 'window-no-resize' : ''} window-${type}`;
  win.id = winId;
  
  win.style.top = customTop || (55 + (windowCount * 15) % 150) + 'px';
  win.style.left = customLeft || (40 + (windowCount * 25) % 300) + 'px';
  if (customWidth) win.style.width = customWidth;
  if (customHeight) win.style.height = customHeight;

  if (!customWidth && !customHeight) {
    if (type === 'silence' || type === 'traffic') {
      win.style.width = '260px';
      win.style.height = '270px';
    } else if (type === 'scoreboard') {
      win.style.width = '380px';
      win.style.height = '320px';
    } else if (type === 'dice') {
      win.style.width = '320px';
      win.style.height = '320px';
    } else if (type === 'timer') {
      win.style.width = '330px';
      win.style.height = '340px';
    } else if (type === 'notes') {
      win.style.width = '380px';
      win.style.height = '280px';
    }
  }

  let title = '', contentHtml = '';

  switch(type) {
    case 'timer':
      title = '<i class="fa-solid fa-hourglass-half"></i> Minuteur';
      contentHtml = `
        <div class="timer-interactive-wrapper">
          <div class="timer-ring-display" id="circ-${winId}">
            <div class="timer-digits-container">
              <div class="timer-col">
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 'm10', 1)">+</button>
                <span id="m10-${winId}">0</span>
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 'm10', -1)">-</button>
              </div>
              <div class="timer-col">
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 'm1', 1)">+</button>
                <span id="m1-${winId}">5</span>
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 'm1', -1)">-</button>
              </div>
              <span class="timer-separator">:</span>
              <div class="timer-col">
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 's10', 1)">+</button>
                <span id="s10-${winId}">0</span>
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 's10', -1)">-</button>
              </div>
              <div class="timer-col">
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 's1', 1)">+</button>
                <span id="s1-${winId}">0</span>
                <button class="timer-col-btn" onclick="adjustTimerUnit('${winId}', 's1', -1)">-</button>
              </div>
            </div>
          </div>
          <div class="timer-action-buttons">
            <button id="btn-start-${winId}" class="timer-action-btn btn-start-idle" onclick="startTimer('${winId}')">
              <i class="fa-solid fa-play"></i> Lancer
            </button>
            <button id="btn-pause-${winId}" class="timer-action-btn btn-pause-idle" onclick="pauseTimer('${winId}')">
              <i class="fa-solid fa-pause"></i> Pause
            </button>
            <button id="btn-reset-${winId}" class="timer-action-btn btn-reset-idle" onclick="resetTimer('${winId}')">
              <i class="fa-solid fa-rotate-right"></i> Réinitialiser
            </button>
          </div>
        </div>`;
      break;

    case 'chrono':
      title = '<i class="fa-solid fa-stopwatch"></i> Chronomètre';
      contentHtml = `
        <div class="display-time" id="disp-${winId}">00:00.00</div>
        <div class="btn-group">
          <button onclick="startChrono('${winId}')">Start</button>
          <button onclick="pauseChrono('${winId}')">Pause</button>
          <button class="btn-neutral" onclick="resetChrono('${winId}')">Reset</button>
        </div>`;
      break;

    case 'notes':
      title = '<i class="fa-solid fa-pen-to-square"></i> Texte';
      let notesHtml = (extraData && extraData.html) ? extraData.html : 'Écrivez votre texte ici...';
      contentHtml = `
        <div class="wysiwyg-toolbar">
          <button onclick="execCmd('bold')"><b>B</b></button>
          <button onclick="execCmd('italic')"><i>I</i></button>
          <button onclick="execCmd('underline')"><u>U</u></button>
          <input type="color" title="Couleur du texte" onchange="execCmd('foreColor', this.value)">
          <input type="color" title="Surligner" value="#ffff00" onchange="execCmd('hiliteColor', this.value)">
        </div>
        <div class="wysiwyg-editor scalable-text" id="edit-${winId}" contenteditable="true" oninput="saveCurrentClassData()">${notesHtml}</div>`;
      break;

    case 'draw':
      title = '<i class="fa-solid fa-paintbrush"></i> Ardoise / Dessin';
      contentHtml = `
        <div class="draw-toolbar">
          <input type="color" id="color-${winId}" value="#2563eb">
          <input type="range" id="size-${winId}" min="2" max="20" value="4">
          <button onclick="undoCanvas('${winId}')" class="btn-neutral" title="Annuler (Ctrl+Z)"><i class="fa-solid fa-rotate-left"></i></button>
          <button onclick="redoCanvas('${winId}')" class="btn-neutral" title="Rétablir (Ctrl+Y)"><i class="fa-solid fa-rotate-right"></i></button>
          <button onclick="clearCanvas('${winId}')" class="btn-neutral"><i class="fa-solid fa-trash"></i> Effacer</button>
        </div>
        <canvas class="draw-canvas" id="canvas-${winId}"></canvas>`;
      break;

    case 'randomizer':
      title = '<i class="fa-solid fa-dice"></i> Tirage Élève';
      contentHtml = `
        <div class="random-box">
          <p style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">Classe active : <b style="color:#2563eb;">${settings.activeClass}</b></p>
          <button onclick="pickStudent('${winId}')" style="width:100%;">Tirer un élève au sort 🎲</button>
          <div class="selected-student scalable-text" id="res-${winId}">-</div>
        </div>`;
      break;

    case 'groups':
      title = '<i class="fa-solid fa-people-group"></i> Groupes Aléatoires';
      contentHtml = `
        <div style="text-align:center; display:flex; flex-direction:column; height:100%;">
          <div>
            <label>Taille des groupes :</label>
            <input type="number" id="group-size-${winId}" value="3" min="2" max="10" style="width:50px; padding:4px;"> élèves
            <button onclick="generateGroups('${winId}')" style="margin-top:8px; width:100%;">Créer les groupes 🎲</button>
          </div>
          <div class="groups-result-grid" id="groups-res-${winId}" style="flex-grow:1; overflow-y:auto; margin-top:8px;"></div>
        </div>`;
      break;

    case 'dice':
      title = '<i class="fa-solid fa-dice-three"></i> Dé 3D & Pièce';
      contentHtml = `
        <div class="dice-3d-wrapper">
          <div class="scene">
            <div class="cube" id="cube-${winId}">
              <div class="cube-face front">1</div>
              <div class="cube-face back">6</div>
              <div class="cube-face right">2</div>
              <div class="cube-face left">5</div>
              <div class="cube-face top">3</div>
              <div class="cube-face bottom">4</div>
            </div>
            <div class="coin" id="coin-${winId}" style="display: none;">
              <div class="coin-face coin-front">Pile</div>
              <div class="coin-face coin-back">Face</div>
            </div>
          </div>
          <div class="btn-group" style="margin-top:15px; width:100%;">
            <button onclick="roll3DDice('${winId}')" style="flex:1;">Lancer le Dé 3D 🎲</button>
            <button onclick="flipCoin3D('${winId}')" class="btn-neutral" style="flex:1;">Pile ou Face 🪙</button>
          </div>
        </div>`;
      break;

    case 'quotes':
      title = '<i class="fa-solid fa-quote-left"></i> Citation du jour';
      contentHtml = `<div class="scalable-text" style="text-align:center; padding:15px; font-style:italic; color:#334155; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%;">« ${settings.quoteText} »<br><b style="font-style:normal; font-size:0.8rem; color:#2563eb; display:block; margin-top:8px;">— ${settings.quoteAuthor}</b></div>`;
      break;

    case 'silence':
      title = '<i class="fa-solid fa-shield-halved"></i> Chances';
      let barsHtml = '';
      const count = settings.chancesCount || 3;
      const lostChances = (extraData && extraData.lostChances) ? extraData.lostChances : [];
      for (let i = 1; i <= count; i++) {
        const isLost = lostChances.includes(i - 1);
        barsHtml += `<div class="chance-bar ${isLost ? 'lost' : ''}" onclick="loseChance(this); saveCurrentClassData();">${isLost ? 'Perdu' : `Chance ${i}`}</div>`;
      }
      contentHtml = `
        <div class="chances-container" id="chances-list-${winId}">
          ${barsHtml}
          <button onclick="resetChances('${winId}'); saveCurrentClassData();" class="btn-neutral" style="margin-top:5px; width:100%;">Réinitialiser</button>
        </div>`;
      break;

    case 'traffic':
      title = '<i class="fa-solid fa-traffic-light"></i> Feu de signal';
      let tColor = (extraData && extraData.color) ? extraData.color : 'green';
      contentHtml = `
        <div class="traffic-container">
          <div class="traffic-light red ${tColor === 'red' ? 'active' : ''}" onclick="setTrafficLight(this, 'red'); saveCurrentClassData();"></div>
          <div class="traffic-light orange ${tColor === 'orange' ? 'active' : ''}" onclick="setTrafficLight(this, 'orange'); saveCurrentClassData();"></div>
          <div class="traffic-light green ${tColor === 'green' ? 'active' : ''}" onclick="setTrafficLight(this, 'green'); saveCurrentClassData();"></div>
        </div>`;
      break;

    case 'scoreboard':
      title = '<i class="fa-solid fa-trophy"></i> Scores';
      if (extraData && extraData.scores) scoresData[winId] = extraData.scores;
      let savedMode = (extraData && extraData.scoreMode) ? extraData.scoreMode : 'groups';
      contentHtml = `
        <div class="scoreboard-wrapper">
          <div class="scoreboard-mode-select">
            <label style="font-size:0.8rem; font-weight:bold; color:#475569;">Mode :</label>
            <select id="score-mode-${winId}" onchange="switchScoreMode('${winId}'); saveCurrentClassData();" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; font-size:0.85rem; outline:none;">
              <option value="groups" ${savedMode === 'groups' ? 'selected' : ''}>Par Groupes</option>
              <option value="individual" ${savedMode === 'individual' ? 'selected' : ''}>Élève Individuel</option>
            </select>
          </div>
          <div class="scoreboard-body" id="score-content-${winId}"></div>
        </div>`;
      break;
  }

  win.innerHTML = `
    <div class="window-header">
      <span class="window-title">${title} <span class="shortcut-badge" id="badge-${winId}"></span></span>
      <div class="window-controls">
        <button onclick="setShortcut('${winId}')" title="Définir un raccourci"><i class="fa-solid fa-minus"></i></button>
        <button class="btn-close" onclick="closeWindowWithHistory(this.closest('.window'))"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
    <div class="window-content">${contentHtml}</div>`;

  document.getElementById('desktop').appendChild(win);
  makeWindowDraggable(win);

  if (type === 'draw') {
    setTimeout(() => {
      initCanvas(winId);
      if (extraData && extraData.drawingData) {
        const canvas = document.getElementById(`canvas-${winId}`);
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = extraData.drawingData;
        img.onload = () => { ctx.drawImage(img, 0, 0); saveCanvasState(winId); };
      }
    }, 100);
  }

  if (type === 'scoreboard') switchScoreMode(winId);
  if (type === 'timer') {
    if (!timerData[winId]) {
      timerData[winId] = { totalSec: 300, initialSec: 300, interval: null, state: 'idle' };
    }
    updateTimerDisplay(winId);
  }

  saveCurrentClassData();
};

// --- MINUTEUR ---
const timerData = {};

function getTimerSecFromCols(id) {
  const m10 = parseInt(document.getElementById(`m10-${id}`)?.textContent || 0);
  const m1 = parseInt(document.getElementById(`m1-${id}`)?.textContent || 0);
  const s10 = parseInt(document.getElementById(`s10-${id}`)?.textContent || 0);
  const s1 = parseInt(document.getElementById(`s1-${id}`)?.textContent || 0);
  return ((m10 * 10 + m1) * 60) + (s10 * 10 + s1);
}

function setColsFromSec(id, totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const m10 = Math.floor(m / 10);
  const m1 = m % 10;
  const s10 = Math.floor(s / 10);
  const s1 = s % 10;

  if (document.getElementById(`m10-${id}`)) document.getElementById(`m10-${id}`).textContent = m10;
  if (document.getElementById(`m1-${id}`)) document.getElementById(`m1-${id}`).textContent = m1;
  if (document.getElementById(`s10-${id}`)) document.getElementById(`s10-${id}`).textContent = s10;
  if (document.getElementById(`s1-${id}`)) document.getElementById(`s1-${id}`).textContent = s1;
}

function adjustTimerUnit(id, unit, delta) {
  pauseTimer(id);
  let totalSec = getTimerSecFromCols(id);
  let m = Math.floor(totalSec / 60);
  let s = totalSec % 60;
  let m10 = Math.floor(m / 10);
  let m1 = m % 10;
  let s10 = Math.floor(s / 10);
  let s1 = s % 10;

  if (unit === 'm10') m10 = Math.max(0, Math.min(9, m10 + delta));
  if (unit === 'm1') m1 = Math.max(0, Math.min(9, m1 + delta));
  if (unit === 's10') s10 = Math.max(0, Math.min(5, s10 + delta));
  if (unit === 's1') s1 = Math.max(0, Math.min(9, s1 + delta));

  const newTotal = ((m10 * 10 + m1) * 60) + (s10 * 10 + s1);
  timerData[id] = { totalSec: newTotal, initialSec: newTotal, interval: null, state: 'idle' };
  setColsFromSec(id, newTotal);
  updateTimerDisplay(id);
}

function startTimer(id) {
  if (timerData[id] && timerData[id].state === 'running') return;
  
  let totalSec = getTimerSecFromCols(id);
  if (totalSec <= 0) return;

  if (!timerData[id] || timerData[id].totalSec <= 0) {
    timerData[id] = { totalSec: totalSec, initialSec: totalSec, interval: null, state: 'idle' };
  } else if (!timerData[id].initialSec || timerData[id].initialSec < totalSec) {
    timerData[id].initialSec = totalSec;
  }

  timerData[id].state = 'running';
  updateTimerButtonsState(id, 'running');

  const startTime = Date.now();
  const startSec = timerData[id].totalSec;

  timerData[id].interval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const currentSec = Math.max(0, startSec - elapsedSec);
    timerData[id].totalSec = currentSec;
    setColsFromSec(id, currentSec);
    updateTimerDisplay(id);

    if (currentSec <= 0) {
      clearInterval(timerData[id].interval);
      timerData[id].interval = null;
      timerData[id].state = 'ended';
      updateTimerButtonsState(id, 'ended');
      playDingDong();
      showCustomModal("Temps écoulé", "⏱️ Le minuteur est arrivé à son terme !", false, "", null);
    }
  }, 100);
}

function pauseTimer(id) {
  if (timerData[id] && timerData[id].state === 'running') {
    clearInterval(timerData[id].interval);
    timerData[id].interval = null;
    timerData[id].state = 'paused';
    updateTimerButtonsState(id, 'paused');
  }
}

function resetTimer(id) {
  pauseTimer(id);
  let totalSec = timerData[id] && timerData[id].initialSec ? timerData[id].initialSec : 300;
  timerData[id] = { totalSec: totalSec, initialSec: totalSec, interval: null, state: 'idle' };
  setColsFromSec(id, totalSec);
  updateTimerDisplay(id);
  updateTimerButtonsState(id, 'idle');
}

function updateTimerDisplay(id) {
  const data = timerData[id];
  if (!data) return;
  const circ = document.getElementById(`circ-${id}`);
  if (circ && data.initialSec > 0) {
    const progress = (data.totalSec / data.initialSec) * 360;
    circ.style.background = `conic-gradient(#2563eb ${progress}deg, #f1f5f9 0deg)`;
  }
}

function updateTimerButtonsState(id, state) {
  const btnStart = document.getElementById(`btn-start-${id}`);
  const btnPause = document.getElementById(`btn-pause-${id}`);
  const btnReset = document.getElementById(`btn-reset-${id}`);
  if (!btnStart || !btnPause || !btnReset) return;

  btnStart.className = "timer-action-btn btn-start-idle";
  btnPause.className = "timer-action-btn btn-pause-idle";
  btnReset.className = "timer-action-btn btn-reset-idle";

  if (state === 'running') {
    btnStart.classList.add('active-running');
  } else if (state === 'paused') {
    btnPause.classList.add('active-paused');
  } else if (state === 'ended') {
    btnReset.classList.add('active-ended');
  }
}

// --- DÉ 3D ET PIÈCE ---
function roll3DDice(winId) {
  const cube = document.getElementById(`cube-${winId}`);
  const coin = document.getElementById(`coin-${winId}`);
  if (!cube || !coin) return;
  cube.style.display = 'block';
  coin.style.display = 'none';

  const finalValue = Math.floor(Math.random() * 6) + 1;
  const rotations = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 }
  };
  const rot = rotations[finalValue];
  const duration = settings.drawDuration || 3;
  const extraX = (Math.floor(Math.random() * 3) + 4) * 360;
  const extraY = (Math.floor(Math.random() * 3) + 4) * 360;

  cube.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.85, 0.35, 1.2)`;
  cube.style.transform = `rotateX(${rot.x + extraX}deg) rotateY(${rot.y + extraY}deg)`;
}

function flipCoin3D(winId) {
  const cube = document.getElementById(`cube-${winId}`);
  const coin = document.getElementById(`coin-${winId}`);
  if (!cube || !coin) return;
  cube.style.display = 'none';
  coin.style.display = 'block';

  const isHeads = Math.random() < 0.5;
  const duration = settings.drawDuration || 3;
  const extraRot = (Math.floor(Math.random() * 4) + 6) * 360;
  const targetRot = isHeads ? extraRot : extraRot + 180;

  coin.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.85, 0.35, 1.2)`;
  coin.style.transform = `rotateY(${targetRot}deg)`;
}

// --- SCORES & GROUPES ---
const scoresData = {};
function switchScoreMode(winId) {
  const modeElem = document.getElementById(`score-mode-${winId}`);
  if (!modeElem) return;
  const mode = modeElem.value;
  const container = document.getElementById(`score-content-${winId}`);
  if (!container) return;
  container.innerHTML = '';
  if (!scoresData[winId]) scoresData[winId] = {};

  if (mode === 'groups') {
    const students = settings.classes[settings.activeClass] || [];
    let groupCount = Math.ceil(students.length / 3) || 3;
    let groupNames = [];
    for (let i = 1; i <= groupCount; i++) groupNames.push(`Groupe ${i}`);

    container.innerHTML = `
      <div class="score-scroll-list">
        ${groupNames.map(grp => {
          const key = 'grp_' + grp;
          const val = scoresData[winId][key] || 0;
          return `
            <div class="score-row-item">
              <span><b>${grp}</b></span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="score-badge-num" id="score-box-${winId}-${key}">${val}</span>
                <button onclick="updateScoreVal('${winId}', '${key}', 1)">+</button>
                <button class="btn-neutral" onclick="updateScoreVal('${winId}', '${key}', -1)">-</button>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  } else if (mode === 'individual') {
    const students = settings.classes[settings.activeClass] || [];
    if (students.length === 0) {
      container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-size:0.85rem;">Aucun élève !</div>`;
      return;
    }
    container.innerHTML = `
      <div class="score-scroll-list">
        ${students.map((st, idx) => {
          const key = 'st_' + idx;
          const val = scoresData[winId][key] || 0;
          return `
            <div class="score-row-item">
              <span>${st}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="score-badge-num" id="score-box-${winId}-${key}">${val}</span>
                <button onclick="updateScoreVal('${winId}', '${key}', 1)">+</button>
                <button class="btn-neutral" onclick="updateScoreVal('${winId}', '${key}', -1)">-</button>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }
}

function updateScoreVal(winId, key, delta) {
  if (!scoresData[winId]) scoresData[winId] = {};
  let current = scoresData[winId][key] || 0;
  current = Math.max(0, current + delta);
  scoresData[winId][key] = current;
  const box = document.getElementById(`score-box-${winId}-${key}`);
  if (box) box.textContent = current;
  saveCurrentClassData();
}

// --- ARDOISE / DESSIN & HISTORIQUE ---
function initCanvas(winId) {
  const canvas = document.getElementById(`canvas-${winId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  if (!canvasHistories[winId]) {
    canvasHistories[winId] = { undoList: [], redoList: [] };
    saveCanvasState(winId);
  }

  let drawing = false;
  const startDraw = (e) => { drawing = true; draw(e); };
  const stopDraw = () => { 
    if (drawing) {
      drawing = false; 
      ctx.beginPath();
      saveCanvasState(winId);
      saveCurrentClassData();
    }
  };

  const draw = (e) => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    ctx.lineWidth = document.getElementById(`size-${winId}`).value;
    ctx.lineCap = 'round';
    ctx.strokeStyle = document.getElementById(`color-${winId}`).value;
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
  };

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('touchstart', startDraw);
  canvas.addEventListener('touchend', stopDraw);
  canvas.addEventListener('touchmove', draw);

  const resizeObserver = new ResizeObserver(() => {
    if (!canvas || !canvas.parentElement) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.drawImage(tempCanvas, 0, 0);
  });
  resizeObserver.observe(canvas.parentElement);
}

function saveCanvasState(winId) {
  const canvas = document.getElementById(`canvas-${winId}`);
  if (!canvas) return;
  if (!canvasHistories[winId]) canvasHistories[winId] = { undoList: [], redoList: [] };
  
  canvasHistories[winId].undoList.push(canvas.toDataURL());
  canvasHistories[winId].redoList = [];
}

function undoCanvas(winId) {
  const hist = canvasHistories[winId];
  if (!hist || hist.undoList.length <= 1) return;
  
  const canvas = document.getElementById(`canvas-${winId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const currentState = hist.undoList.pop();
  hist.redoList.push(currentState);

  const previousState = hist.undoList[hist.undoList.length - 1];
  const img = new Image();
  img.src = previousState;
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    saveCurrentClassData();
  };
}

function redoCanvas(winId) {
  const hist = canvasHistories[winId];
  if (!hist || hist.redoList.length === 0) return;

  const canvas = document.getElementById(`canvas-${winId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const nextState = hist.redoList.pop();
  hist.undoList.push(nextState);

  const img = new Image();
  img.src = nextState;
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    saveCurrentClassData();
  };
}

function clearCanvas(winId) {
  const canvas = document.getElementById(`canvas-${winId}`);
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveCanvasState(winId);
    saveCurrentClassData();
  }
}

// --- AUTRES ---
function execCmd(command, value = null) { document.execCommand(command, false, value); saveCurrentClassData(); }

function generateGroups(winId) {
  const students = settings.classes[settings.activeClass] || [];
  const size = parseInt(document.getElementById(`group-size-${winId}`).value) || 3;
  const container = document.getElementById(`groups-res-${winId}`);
  if (students.length === 0) {
    container.innerHTML = "<p style='color:#ef4444; text-align:center;'>Aucun élève !</p>";
    return;
  }
  const shuffled = [...students].sort(() => Math.random() - 0.5);
  container.innerHTML = '';
  let groupIndex = 1;
  for (let i = 0; i < shuffled.length; i += size) {
    const group = shuffled.slice(i, i + size);
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `<h5>Groupe ${groupIndex}</h5>` + group.map(st => `<div>• ${st}</div>`).join('');
    container.appendChild(card);
    groupIndex++;
  }
}

function makeWindowDraggable(elmnt) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = elmnt.querySelector('.window-header');
  header.onmousedown = (e) => {
    e.preventDefault();
    document.querySelectorAll('.window').forEach(w => w.classList.remove('active-window'));
    elmnt.classList.add('active-window');
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  };
  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    let newTop = elmnt.offsetTop - pos2;
    if (newTop < (settings.classesHidden ? 0 : 45)) newTop = (settings.classesHidden ? 0 : 45);
    elmnt.style.top = newTop + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
  }
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    saveCurrentClassData();
  }
}

setInterval(() => {
  const now = new Date();
  document.getElementById('live-clock').textContent = now.toTimeString().split(' ')[0];
}, 1000);

function loseChance(bar) { bar.classList.add('lost'); bar.innerHTML = 'Perdu'; }
function resetChances(winId) {
  const bars = document.querySelectorAll(`#${winId} .chance-bar`);
  bars.forEach((bar, idx) => { bar.classList.remove('lost'); bar.innerHTML = `Chance ${idx + 1}`; });
}
function updateChancesCount(val) { settings.chancesCount = parseInt(val) || 3; saveSettings(); }

function pickStudent(id) {
  const students = settings.classes[settings.activeClass] || [];
  const resDiv = document.getElementById(`res-${id}`);
  if (students.length === 0) { resDiv.textContent = "Aucun élève !"; return; }
  let duration = (settings.drawDuration || 3) * 1000;
  let elapsed = 0;
  const interval = setInterval(() => {
    const randomStudent = students[Math.floor(Math.random() * students.length)];
    resDiv.textContent = randomStudent;
    elapsed += 60;
    if (elapsed >= duration) clearInterval(interval);
  }, 60);
}

const chronos = {};
function startChrono(id) {
  if (chronos[id]) return;
  let centis = parseInt(document.getElementById(`disp-${id}`).dataset.time || 0);
  chronos[id] = setInterval(() => {
    centis++;
    document.getElementById(`disp-${id}`).dataset.time = centis;
    const m = String(Math.floor(centis / 6000)).padStart(2, '0');
    const s = String(Math.floor((centis % 6000) / 100)).padStart(2, '0');
    const c = String(centis % 100).padStart(2, '0');
    document.getElementById(`disp-${id}`).textContent = `${m}:${s}.${c}`;
  }, 10);
}
function pauseChrono(id) { clearInterval(chronos[id]); chronos[id] = null; }
function resetChrono(id) {
  pauseChrono(id);
  document.getElementById(`disp-${id}`).dataset.time = 0;
  document.getElementById(`disp-${id}`).textContent = "00:00.00";
}

function setTrafficLight(element, color) {
  const container = element.parentElement;
  container.querySelectorAll('.traffic-light').forEach(light => light.classList.remove('active'));
  element.classList.add('active');
}