let windowCount = 0;
const shortcuts = {};
const canvasHistories = {};
const canvasResizeObservers = {};
const studentDrawTimers = {};
const attendanceData = {};
const checklistData = {};
let closedWindowsHistory = [];

let settingsLoadIssue = false;
let recoveredSettingsRaw = "";
let storageWarningShown = false;
function loadStoredSettings() {
  try {
    const raw = localStorage.getItem('tititache_settings');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    settingsLoadIssue = true;
    try { recoveredSettingsRaw = localStorage.getItem('tititache_settings') || ""; } catch {}
    try { if (recoveredSettingsRaw) localStorage.setItem('tititache_settings_recovery', recoveredSettingsRaw); } catch {}
    return {};
  }
}
function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function normalizeSettings(value) {
  const input = isRecord(value) ? value : {};
  const candidateClasses = isRecord(input.classes) ? input.classes : null;
  const classes = {};
  if (candidateClasses) {
    for (const [name, students] of Object.entries(candidateClasses)) {
      if (name.trim() && Array.isArray(students)) classes[name.slice(0, 80)] = students.filter(student => typeof student === 'string' && student.trim()).map(student => student.trim().slice(0, 100)).slice(0, 200);
    }
  }
  if (!Object.keys(classes).length) Object.assign(classes, {
    "6ème A": ["Lucas", "Sarah", "Thomas", "Emma", "Hugo", "Léa", "Antoine", "Manon"],
    "5ème B": ["Alexandre", "Camille", "Gabriel", "Jade", "Louis", "Chloé"]
  });
  const activeClass = typeof input.activeClass === 'string' && classes[input.activeClass] ? input.activeClass : Object.keys(classes)[0];
  const classData = isRecord(input.classData) ? input.classData : {};
  const drawDuration = Number(input.drawDuration);
  const chancesCount = Number(input.chancesCount);
  const whiteoutKey = typeof input.whiteoutKey === 'string' && input.whiteoutKey.trim().length === 1 ? input.whiteoutKey.trim().toUpperCase() : 'B';
  return {
    ...input,
    classes,
    activeClass,
    classData,
    attendanceHistory: isRecord(input.attendanceHistory) ? input.attendanceHistory : {},
    randomDrawState: isRecord(input.randomDrawState) ? input.randomDrawState : {},
    toolFavorites: Array.isArray(input.toolFavorites) ? [...new Set(input.toolFavorites.filter(item => typeof item === 'string'))].slice(0, 5) : [],
    drawDuration: Number.isFinite(drawDuration) ? Math.max(1, Math.min(10, Math.round(drawDuration))) : 3,
    chancesCount: Number.isFinite(chancesCount) ? Math.max(1, Math.min(10, Math.round(chancesCount))) : 3,
    quoteText: typeof input.quoteText === 'string' && input.quoteText.trim() ? input.quoteText.slice(0, 1000) : "La lecture est à l'esprit ce que l'exercice est au corps.",
    quoteAuthor: typeof input.quoteAuthor === 'string' ? input.quoteAuthor.slice(0, 120) : "Joseph Addison",
    whiteoutKey,
    classesHidden: input.classesHidden === true
  };
}
let settings = normalizeSettings(loadStoredSettings());

function sanitizeRichText(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'SPAN', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'CODE', 'PRE']);
  const dangerous = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO']);
  const clean = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    if (dangerous.has(node.tagName)) return document.createDocumentFragment();
    if (!allowed.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      Array.from(node.childNodes).forEach(child => fragment.appendChild(clean(child)));
      return fragment;
    }
    const element = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === 'SPAN') {
      const color = node.style?.color || '';
      if (color && CSS.supports('color', color)) element.style.color = color;
      const background = node.style?.backgroundColor || '';
      if (background && CSS.supports('color', background)) element.style.backgroundColor = background;
    }
    Array.from(node.childNodes).forEach(child => element.appendChild(clean(child)));
    return element;
  };
  const fragment = document.createDocumentFragment();
  Array.from(template.content.childNodes).forEach(child => fragment.appendChild(clean(child)));
  template.content.replaceChildren(fragment);
  return template.innerHTML;
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

const ICON_VECTOR_PATHS = {
  'fa-graduation-cap':'<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  'fa-chalkboard-user':'<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4M8 8h8M8 12h5"/>',
  'fa-plus':'<path d="M12 5v14M5 12h14"/>','fa-eye':'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  'fa-eye-slash':'<path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3 3.7M6.2 6.8C3.5 8.4 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  'fa-gear':'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-3l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.5-2.6 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h3l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.5 2.6-1.4 1.1a7 7 0 0 1 0 2Z"/>',
  'fa-xmark':'<path d="m6 6 12 12M18 6 6 18"/>','fa-shield-halved':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="M12 22V2"/>',
  'fa-dice':'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
  'fa-dice-three':'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
  'fa-quote-left':'<path d="M10 11H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6c0 5-2 8-6 10M21 11h-5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6c0 5-2 8-6 10"/>',
  'fa-volume-high':'<path d="M4 10v4h4l5 4V6l-5 4H4ZM17 9a5 5 0 0 1 0 6M19 5a10 10 0 0 1 0 14"/>','fa-bell':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  'fa-palette':'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8H18a3 3 0 0 0 3-3c0-5-4-9-9-9Z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7.5" r=".8"/><circle cx="15" cy="8" r=".8"/>',
  'fa-file-image':'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5 17 5-5 3 3 2-2 4 4"/>','fa-images':'<rect x="3" y="5" width="15" height="14" rx="2"/><path d="M7 3h13a1 1 0 0 1 1 1v12M4 15l4-4 3 3 2-2 4 4"/>',
  'fa-magnifying-glass':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>','fa-cloud-arrow-up':'<path d="M7 18a5 5 0 0 1-.7-10A7 7 0 0 1 20 10a4 4 0 0 1-1 8h-2M12 21V12m-4 4 4-4 4 4"/>','fa-upload':'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  'fa-hourglass-half':'<path d="M6 2h12M6 22h12M7 2v5l5 5-5 5v5m10-20v5l-5 5 5 5v5"/>','fa-stopwatch':'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6m-3 0v3m6.5 1.5L20 5"/>','fa-pen-to-square':'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/><path d="M4 4h7"/>','fa-paintbrush':'<path d="m14 6 4 4M3 21c4 0 7-1 7-5 0-2 1-4 3-6l4-4 3 3-4 4c-2 2-4 3-6 3-4 0-5 3-7 5Z"/>',
  'fa-people-group':'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>','fa-traffic-light':'<rect x="6" y="2" width="12" height="17" rx="3"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="10.5" r="1.5"/><circle cx="12" cy="15" r="1.5"/><path d="M12 19v3"/>','fa-trophy':'<path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
  'fa-circle-question':'<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.6 2.6 0 1 1 4.7 1.5c-1.2 1.3-2.2 1.5-2.2 3M12 17h.01"/>','fa-circle-info':'<circle cx="12" cy="12" r="10"/><path d="M12 11v5m0-8h.01"/>','fa-minus':'<path d="M5 12h14"/>','fa-chevron-down':'<path d="m6 9 6 6 6-6"/>','fa-pause':'<path d="M8 5v14m8-14v14"/>','fa-play':'<path d="m7 4 13 8-13 8V4Z"/>','fa-rotate-left':'<path d="M3 10V4m0 0h6M3 4l4 4a8 8 0 1 1-2 7"/>','fa-rotate-right':'<path d="M21 10V4m0 0h-6m6 0-4 4a8 8 0 1 0 2 7"/>','fa-trash':'<path d="M3 6h18m-2 0-1 15H6L5 6m3 0V4h8v2m-6 4v7m4-7v7"/>','fa-floppy-disk':'<path d="M4 3h14l3 3v15H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/>','fa-download':'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>','fa-house':'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z"/>','fa-user-check':'<circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 9-5m2 4 2 2 5-5"/>','fa-list-check':'<path d="m3 6 2 2 3-3M11 7h10M3 13l2 2 3-3m3 1h10M3 20h5m3 0h10"/>','fa-grip':'<circle cx="5" cy="5" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="19" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/>','fa-copy':'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>','fa-window-close':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-5 4-4 4m0-4 4 4"/>','fa-expand':'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>','fa-keyboard':'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 15h8"/>','fa-chart-column':'<path d="M4 20V10h4v10m4 0V4h4v16m4 0v-8h4v8"/>','fa-arrow-left':'<path d="m14 5-7 7 7 7m-7-7h14"/>','fa-wand-magic-sparkles':'<path d="m15 4 5 5M4 20l11-11M6 4v4m-2-2h4m10 8v4m-2-2h4"/>'
};
ICON_VECTOR_PATHS['fa-compress'] = '<path d="M8 3v5H3m13-5v5h5M3 16h5v5m8 0v-5h5"/>';
function applyVectorIcons(root = document) {
  root.querySelectorAll?.('.fa-solid').forEach(icon => {
    const name = Array.from(icon.classList).find(className => ICON_VECTOR_PATHS[className]);
    if (!name) return;
    if (icon.dataset.vectorIcon === name) return;
    icon.dataset.vectorIcon = name;
    icon.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICON_VECTOR_PATHS[name];
    icon.appendChild(svg);
  });
}
const iconObserver = new MutationObserver(records => records.forEach(record => {
  if (record.type === 'attributes') applyVectorIcons(record.target.parentElement || document);
  record.addedNodes?.forEach(node => { if (node.nodeType === 1) { if (node.matches?.('.fa-solid')) applyVectorIcons(node.parentElement || document); else applyVectorIcons(node); } });
}));
iconObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

window.onload = () => {
  applyVectorIcons();
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
  initializeToolFavorites();
  renderTaskbarFavorites();
  if (settingsLoadIssue) showCustomModal("Sauvegarde à vérifier", "Les anciens réglages n’ont pas pu être lus. Une copie brute a été conservée si le navigateur l’a permis. Utilise « Exporter mes données » pour la télécharger avant de continuer.", false, "", null);
};

function saveSettings() {
  try {
    localStorage.setItem('tititache_settings', JSON.stringify(settings));
    return true;
  } catch (error) {
    if (!storageWarningShown) {
      storageWarningShown = true;
      toast("La sauvegarde locale est pleine ou indisponible. Exporte tes données avant de continuer.");
    }
    return false;
  }
}

function downloadBlob(filename, content, type = 'application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSettingsBackup() {
  const backup = { format: 'maestro-backup', version: 1, exportedAt: new Date().toISOString(), settings, recoveredRawSettings: recoveredSettingsRaw || null };
  downloadBlob(`maestro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
}

function importSettingsBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast("La sauvegarde dépasse 50 Mo."); event.target.value = ''; return; }
  const reader = new FileReader();
  reader.onerror = () => { toast("Impossible de lire cette sauvegarde."); event.target.value = ''; };
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ''));
      const candidate = parsed?.format === 'maestro-backup' ? parsed.settings : parsed;
      if (!isRecord(candidate) || !isRecord(candidate.classes) || !Object.values(candidate.classes).every(Array.isArray)) throw new Error("Le fichier ne contient pas de sauvegarde Maestro valide.");
      if (!window.confirm("Restaurer cette sauvegarde remplacera les réglages et classes affichés. Continuer ?")) return;
      document.querySelectorAll('.window').forEach(cleanupWindowResources);
      settings = normalizeSettings(candidate);
      recoveredSettingsRaw = typeof parsed.recoveredRawSettings === 'string' ? parsed.recoveredRawSettings : '';
      renderClassTabs();
      restoreClassSpecificData(settings.activeClass);
      applyClassesHiddenState();
      saveSettings();
      toast("Sauvegarde Maestro restaurée.");
    } catch (error) { toast(error.message || "Cette sauvegarde est invalide."); }
    finally { event.target.value = ''; }
  };
  reader.readAsText(file);
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

  const titleIcon = document.createElement('i');
  titleIcon.className = 'fa-solid fa-circle-info';
  titleEl.replaceChildren(titleIcon, document.createTextNode(` ${title}`));
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
    if (editor) extraData.html = sanitizeRichText(editor.innerHTML);
  } else if (type === 'timer') {
    const data = timerData[win.id];
    extraData.timer = { totalSec: data?.totalSec ?? getTimerSecFromCols(win.id), initialSec: data?.initialSec ?? getTimerSecFromCols(win.id) };
  } else if (type === 'chrono') {
    const display = win.querySelector('.display-time');
    if (display) extraData.elapsedCentis = Math.max(0, parseInt(display.dataset.time || '0', 10) || 0);
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
  } else if (type === 'attendance') {
    extraData.attendance = { date: getLocalDateKey(), statuses: attendanceData[win.id] || {} };
  } else if (type === 'checklist') {
    extraData.tasks = checklistData[win.id] || [];
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
  cleanupWindowResources(winElement);
  winElement.remove();
}

function cleanupWindowResources(winElement) {
  const id = winElement?.id;
  if (!id) return;
  if (timerData[id]?.interval) clearInterval(timerData[id].interval);
  delete timerData[id];
  if (chronos[id]) clearInterval(chronos[id]);
  delete chronos[id];
  if (studentDrawTimers[id]) clearInterval(studentDrawTimers[id]);
  delete studentDrawTimers[id];
  canvasResizeObservers[id]?.disconnect();
  delete canvasResizeObservers[id];
  delete canvasHistories[id];
  delete scoresData[id];
  delete attendanceData[id];
  delete checklistData[id];
  delete shortcuts[id];
}

function restoreClassSpecificData(className) {
  document.querySelectorAll('.window').forEach(w => { cleanupWindowResources(w); w.remove(); });

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
    data.openWindows.filter(winInfo => winInfo.type !== 'attendance-report').forEach(winInfo => {
      createWindow(winInfo.type, winInfo.extra, winInfo.top, winInfo.left, winInfo.width, winInfo.height);
    });
  }
}

function showMaestroHome() {
  document.getElementById('attendance-screen').hidden = true;
  document.getElementById('home-screen')?.classList.remove('is-hidden');
}

function openMaestroDesktop() {
  document.getElementById('attendance-screen').hidden = true;
  document.getElementById('home-screen')?.classList.add('is-hidden');
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
  container.replaceChildren();

  for (const [className, students] of Object.entries(settings.classes)) {
    const wrapper = document.createElement('div');
    wrapper.className = 'class-tab-wrapper';
    const isActive = (className === settings.activeClass);
    const safeClassNameId = escapeClassName(className);
    const tab = document.createElement('div');
    tab.className = `class-tab${isActive ? ' active' : ''}`;
    tab.onclick = () => selectClass(className);
    const name = document.createElement('span');
    name.textContent = className;
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'class-tab-dropdown-btn';
    menuButton.title = 'Voir ou ajouter des élèves';
    menuButton.textContent = `Élèves (${students.length}) `;
    const chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down';
    menuButton.appendChild(chevron);
    menuButton.onclick = event => toggleStudentsMenu(className, event);
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'fa-solid fa-xmark delete-class-btn';
    deleteButton.title = `Supprimer la classe ${className}`;
    deleteButton.onclick = event => deleteClass(className, event);
    tab.append(name, menuButton, deleteButton);

    const dropdown = document.createElement('div');
    dropdown.className = 'students-dropdown-menu';
    dropdown.id = `dropdown-${safeClassNameId}`;
    dropdown.onclick = event => event.stopPropagation();
    const header = document.createElement('div');
    header.className = 'dropdown-header';
    const headerText = document.createElement('span');
    headerText.textContent = `Élèves de ${className}`;
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn-subtle';
    addButton.textContent = '+ Ajouter';
    addButton.onclick = event => addStudentToClass(className, event);
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'btn-subtle copy-students-btn';
    copyButton.textContent = 'Copier';
    copyButton.title = `Copier la liste de ${className}`;
    copyButton.onclick = () => copyStudentList(className);
    const headerActions = document.createElement('div');
    headerActions.className = 'dropdown-header-actions';
    headerActions.append(copyButton, addButton);
    header.append(headerText, headerActions);
    const studentSearch = document.createElement('input');
    studentSearch.type = 'search'; studentSearch.className = 'student-search';
    studentSearch.placeholder = `Rechercher parmi ${students.length} élèves…`;
    studentSearch.setAttribute('aria-label', `Rechercher un élève dans ${className}`);
    studentSearch.hidden = students.length < 8;
    const list = document.createElement('div');
    list.className = 'students-list-scroll';
    const searchEmpty = document.createElement('div');
    searchEmpty.className = 'students-empty student-search-empty'; searchEmpty.textContent = 'Aucun élève trouvé.'; searchEmpty.hidden = true;
    if (!students.length) {
      const empty = document.createElement('div');
      empty.className = 'students-empty';
      empty.textContent = 'Aucun élève';
      list.appendChild(empty);
    } else students.forEach((student, index) => {
      const row = document.createElement('div');
      row.className = 'student-item-row';
      row.dataset.studentSearch = student.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
      const label = document.createElement('span');
      label.textContent = student;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fa-solid fa-trash';
      remove.title = `Retirer ${student}`;
      remove.onclick = event => removeStudentFromClass(className, index, event);
      row.append(label, remove);
      list.appendChild(row);
    });
    studentSearch.addEventListener('input', () => {
      const query = studentSearch.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
      let visible = 0;
      list.querySelectorAll('.student-item-row').forEach(row => { row.hidden = !row.dataset.studentSearch.includes(query); if (!row.hidden) visible++; });
      searchEmpty.hidden = !query || visible > 0;
    });
    list.appendChild(searchEmpty);
    dropdown.append(header, studentSearch, list);
    wrapper.append(tab, dropdown);
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
      if (settings.activeClass !== className) saveCurrentClassData();
      const wasActive = settings.activeClass === className;
      delete settings.classes[className];
      delete settings.classData[className];
      if (!Object.keys(settings.classes).length) settings.classes['Classe 1'] = [];
      if (wasActive) settings.activeClass = Object.keys(settings.classes)[0];
      saveSettings();
      renderClassTabs();
      if (wasActive) restoreClassSpecificData(settings.activeClass);
    }
  });
}

function addStudentToClass(className, e) {
  if (e) e.stopPropagation();
  showCustomModal("Ajouter des élèves", `Saisis un ou plusieurs noms pour ${className}, séparés par des virgules :`, true, "", (confirmed, val) => {
    if (confirmed && val && val.trim()) {
      if (!settings.classes[className]) settings.classes[className] = [];
      const existing = new Set(settings.classes[className].map(student => student.toLocaleLowerCase('fr')));
      const newStudents = val.split(/[\n,;]+/).map(student => student.trim()).filter(student => {
        if (!student) return false;
        const normalized = student.toLocaleLowerCase('fr');
        if (existing.has(normalized)) return false;
        existing.add(normalized);
        return true;
      });
      settings.classes[className].push(...newStudents);
      saveSettings();
      renderClassTabs();
      if (newStudents.length) toast(`${newStudents.length} élève${newStudents.length > 1 ? 's ajoutés' : ' ajouté'}.`);
      else toast('Aucun nouveau nom à ajouter.');
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

function toggleToolGrid(forceOpen) {
  const panel = document.getElementById('tool-grid-panel');
  const toggle = document.getElementById('tool-grid-toggle');
  if (!panel || !toggle) return;
  const open = typeof forceOpen === 'boolean' ? forceOpen : panel.hidden;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) setTimeout(() => document.getElementById('tool-search-input')?.focus(), 0);
  else {
    const search = document.getElementById('tool-search-input');
    if (search) { search.value = ''; filterToolGrid(''); }
  }
}

function initializeToolFavorites() {
  const savedFavorites = settings.toolFavorites || [];
  const windowTools = new Set(Array.from(document.querySelectorAll('.tool-grid-card')).map(card => card.getAttribute('onclick')?.match(/launchTool\('([^']+)'\)/)?.[1]).filter(Boolean));
  settings.toolFavorites = savedFavorites.filter(toolId => windowTools.has(toolId));
  if (settings.toolFavorites.length !== savedFavorites.length) saveSettings();
  document.querySelectorAll('.tool-grid-card').forEach(card => {
    const match = card.getAttribute('onclick')?.match(/launchTool\('([^']+)'\)/);
    if (!match) return;
    const toolId = match[1];
    card.dataset.toolId = toolId;
    if (card.parentElement?.classList.contains('tool-grid-entry')) return;
    const entry = document.createElement('div'); entry.className = 'tool-grid-entry';
    card.parentNode.insertBefore(entry, card);
    entry.appendChild(card);
    const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'tool-pin';
    pin.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); toggleToolFavorite(toolId); });
    entry.appendChild(pin);
    updateToolPin(toolId);
  });
}

function updateToolPin(toolId) {
  const card = Array.from(document.querySelectorAll('.tool-grid-card')).find(item => item.dataset.toolId === toolId);
  const pin = card?.parentElement?.querySelector('.tool-pin');
  if (!pin) return;
  const pinned = settings.toolFavorites.includes(toolId);
  pin.textContent = pinned ? '★' : '☆';
  pin.classList.toggle('is-pinned', pinned);
  pin.setAttribute('aria-label', pinned ? 'Retirer des favoris' : 'Épingler à la barre des tâches');
  pin.title = pinned ? 'Retirer des favoris' : 'Épingler à la barre des tâches';
}

function toggleToolFavorite(toolId) {
  const favorites = settings.toolFavorites;
  if (favorites.includes(toolId)) settings.toolFavorites = favorites.filter(item => item !== toolId);
  else {
    if (favorites.length >= 5) { toast('Tu peux épingler jusqu’à 5 favoris à la barre des tâches.'); return; }
    settings.toolFavorites.push(toolId);
  }
  saveSettings();
  updateToolPin(toolId);
  renderTaskbarFavorites();
}

function renderTaskbarFavorites() {
  const container = document.getElementById('taskbar-favorites');
  if (!container) return;
  container.replaceChildren();
  (settings.toolFavorites || []).forEach(toolId => {
    const card = Array.from(document.querySelectorAll('.tool-grid-card')).find(item => item.dataset.toolId === toolId);
    if (!card) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'favorite-taskbar-item';
    const label = card.querySelector('span')?.textContent || toolId;
    button.title = `Ouvrir ${label}`; button.setAttribute('aria-label', `Ouvrir ${label}`);
    const originalIcon = card.querySelector('i');
    if (originalIcon) { const icon = document.createElement('i'); icon.className = originalIcon.className; icon.setAttribute('aria-hidden', 'true'); button.appendChild(icon); }
    const text = document.createElement('span'); text.textContent = label; button.appendChild(text);
    button.addEventListener('click', () => launchTool(toolId));
    container.appendChild(button);
  });
}

function filterToolGrid(query) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cards = Array.from(document.querySelectorAll('.tool-grid-card'));
  let matches = 0;
  cards.forEach(card => {
    const terms = `${card.dataset.search || ''} ${card.textContent}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const visible = !normalizedQuery || terms.includes(normalizedQuery);
    (card.parentElement?.classList.contains('tool-grid-entry') ? card.parentElement : card).hidden = !visible;
    if (visible) matches++;
  });
  const empty = document.getElementById('tool-grid-empty');
  if (empty) empty.hidden = matches > 0;
}

function launchTool(name) {
  toggleToolGrid(false);
  const actions = {
    timer: () => createWindow('timer'), chrono: () => createWindow('chrono'), notes: () => createWindow('notes'),
    draw: () => createWindow('draw'), randomizer: () => createWindow('randomizer'),
    groups: () => createWindow('groups'), dice: () => createWindow('dice'), silence: () => createWindow('silence'),
    quotes: () => createWindow('quotes'), traffic: () => createWindow('traffic'), scoreboard: () => createWindow('scoreboard'),
    attendance: () => createWindow('attendance'), checklist: () => createWindow('checklist')
  };
  actions[name]?.();
}

function copyStudentList(className = settings.activeClass) {
  const students = settings.classes[className] || [];
  if (!students.length) { toast(`La classe ${className} ne contient aucun élève.`); return; }
  const text = students.join('\n');
  const fallbackCopy = () => {
    const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.appendChild(field); field.select();
    const copied = document.execCommand('copy'); field.remove();
    toast(copied ? 'Liste des élèves copiée.' : 'Impossible de copier la liste.');
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast('Liste des élèves copiée.')).catch(fallbackCopy);
  else fallbackCopy();
}

function closeAllWindows() {
  const windows = Array.from(document.querySelectorAll('#desktop .window'));
  if (!windows.length) { toast('Aucun outil ouvert.'); return; }
  if (!window.confirm(`Fermer les ${windows.length} fenêtres ouvertes ?`)) return;
  windows.forEach(win => { if (win.isConnected) closeWindowWithHistory(win); });
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => toast('Impossible de quitter le plein écran.'));
  else document.documentElement.requestFullscreen?.().catch(() => toast('Le plein écran n’est pas disponible dans cette fenêtre.'));
}

document.addEventListener('pointerdown', event => {
  const launcher = document.getElementById('tool-launcher');
  if (launcher && !launcher.contains(event.target)) toggleToolGrid(false);
});
window.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    toggleToolGrid(true);
    return;
  }
  if (event.key === 'Escape' && !document.getElementById('tool-grid-panel')?.hidden) toggleToolGrid(false);
});

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
  resultsDiv.replaceChildren();
  const status = document.createElement('p');
  status.className = 'search-status';
  status.textContent = 'Recherche sur Wikimedia Commons…';
  resultsDiv.appendChild(status);
  const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1200', iiextmetadatalanguage: 'fr', format: 'json', origin: '*' });
  fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
    .then(response => { if (!response.ok) throw new Error('Réponse réseau invalide'); return response.json(); })
    .then(data => {
      resultsDiv.replaceChildren();
      const pages = Object.values(data.query?.pages || {});
      if (!pages.length) { status.textContent = 'Aucune image trouvée. Essaie un autre mot-clé.'; resultsDiv.appendChild(status); return; }
      pages.forEach(page => {
        const info = page.imageinfo?.[0];
        if (!info?.thumburl || !info?.url) return;
        const card = document.createElement('article'); card.className = 'bg-result';
        const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'bg-result-preview'; preview.title = 'Utiliser cette image comme fond';
        const image = document.createElement('img'); image.src = info.thumburl; image.alt = page.title.replace(/^File:/, '').replaceAll('_', ''); image.loading = 'lazy';
        preview.addEventListener('click', () => setBgImage(info.thumburl)); preview.appendChild(image);
        const label = document.createElement('span'); label.className = 'bg-result-title'; label.textContent = image.alt; label.title = image.alt;
        const license = document.createElement('span'); license.className = 'bg-result-license'; license.textContent = info.extmetadata?.LicenseShortName?.value || 'Licence non précisée';
        const source = document.createElement('a'); source.href = info.descriptionurl; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Source et détails';
        card.append(preview, label, license, source); resultsDiv.appendChild(card);
      });
      if (!resultsDiv.children.length) { status.textContent = 'Aucune image utilisable dans ces résultats.'; resultsDiv.appendChild(status); }
    })
    .catch(() => { status.textContent = 'Recherche impossible. Vérifie la connexion Internet puis réessaie.'; resultsDiv.replaceChildren(status); });
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
  if (typeof url !== 'string' || !(url.startsWith('https://') || url.startsWith('data:image/'))) {
    toast('Cette image ne peut pas être utilisée comme fond.');
    return;
  }
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
function toggleWindowMaximize(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  const button = win.querySelector('.window-maximize');
  if (!win.classList.contains('window-maximized')) {
    win.dataset.restoreGeometry = JSON.stringify({ top: win.style.top, left: win.style.left, width: win.style.width, height: win.style.height });
    win.classList.add('window-maximized');
    if (button) { button.title = 'Restaurer la taille'; button.setAttribute('aria-label', 'Restaurer la taille'); const icon = button.querySelector('i'); if (icon) icon.className = 'fa-solid fa-compress'; }
  } else {
    win.classList.remove('window-maximized');
    try {
      const geometry = JSON.parse(win.dataset.restoreGeometry || '{}');
      for (const key of ['top', 'left', 'width', 'height']) if (typeof geometry[key] === 'string') win.style[key] = geometry[key];
    } catch {}
    delete win.dataset.restoreGeometry;
    if (button) { button.title = 'Agrandir la fenêtre'; button.setAttribute('aria-label', 'Agrandir la fenêtre'); const icon = button.querySelector('i'); if (icon) icon.className = 'fa-solid fa-expand'; }
  }
}

function createWindow(type, extraData = null, customTop = null, customLeft = null, customWidth = null, customHeight = null) {
  if (type === 'silence' && document.querySelector('.window-silence-type')) {
    showCustomModal("Information", "Une fenêtre de chances est déjà ouverte !", false, "", null);
    return;
  }

  windowCount++;
  const winId = `window-${windowCount}`;
  const win = document.createElement('div');
  
  win.className = `window active-window ${type === 'silence' || type === 'traffic' || type === 'quotes' ? 'window-no-resize' : ''} window-${type}`;
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
    } else if (type === 'attendance') {
      win.style.width = '560px';
      win.style.height = '600px';
    } else if (type === 'checklist') {
      win.style.width = '340px';
      win.style.height = '360px';
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
      let notesHtml = (extraData && extraData.html) ? sanitizeRichText(extraData.html) : 'Écrivez votre texte ici...';
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
          <p style="font-size:0.85rem; color:#64748b; margin-bottom:5px;">Classe active : <b style="color:#2563eb;">${escapeHTML(settings.activeClass)}</b></p>
          <p style="font-size:0.72rem; color:#748397; margin-bottom:8px;">Chaque élève passe une fois avant que le tirage recommence.</p>
          <button onclick="pickStudent('${winId}')" style="width:100%;">Tirer un élève au sort <span aria-hidden="true">◆</span></button>
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
            <button onclick="generateGroups('${winId}')" style="margin-top:8px; width:100%;">Créer les groupes <span aria-hidden="true">◆</span></button>
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
            <button onclick="roll3DDice('${winId}')" style="flex:1;">Lancer le Dé 3D <span aria-hidden="true">◆</span></button>
            <button onclick="flipCoin3D('${winId}')" class="btn-neutral" style="flex:1;">Pile ou Face <span aria-hidden="true">◉</span></button>
          </div>
        </div>`;
      break;

    case 'quotes':
      title = '<i class="fa-solid fa-quote-left"></i> Citation du jour';
      contentHtml = `<div class="scalable-text" style="text-align:center; padding:15px; font-style:italic; color:#334155; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%;">« ${escapeHTML(settings.quoteText)} »<br><b style="font-style:normal; font-size:0.8rem; color:#2563eb; display:block; margin-top:8px;">— ${escapeHTML(settings.quoteAuthor)}</b></div>`;
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

    case 'attendance':
      title = '<i class="fa-solid fa-user-check"></i> Suivi des présences';
      contentHtml = `<div class="attendance-panel"><div class="attendance-summary" id="attendance-summary-${winId}"></div><div class="attendance-list" id="attendance-list-${winId}"></div><div class="attendance-actions"><span id="attendance-validation-status-${winId}"></span><button type="button" class="attendance-validate" onclick="validateAttendance('${winId}')">Valider l’appel</button></div></div>`;
      break;

    case 'checklist':
      title = '<i class="fa-solid fa-list-check"></i> Liste de classe';
      contentHtml = `<div class="checklist-panel"><button class="btn-subtle checklist-add" onclick="addClassTask('${winId}')"><i class="fa-solid fa-plus"></i> Ajouter un élément</button><div class="checklist-items" id="checklist-items-${winId}"></div></div>`;
      break;
  }

  win.innerHTML = `
    <div class="window-header">
      <span class="window-title">${title} <span class="shortcut-badge" id="badge-${winId}"></span></span>
      <div class="window-controls">
        <button onclick="setShortcut('${winId}')" title="Définir un raccourci"><i class="fa-solid fa-minus"></i></button>
        <button class="window-maximize" onclick="toggleWindowMaximize('${winId}')" title="Agrandir la fenêtre" aria-label="Agrandir la fenêtre"><i class="fa-solid fa-expand"></i></button>
        <button class="btn-close" onclick="closeWindowWithHistory(this.closest('.window'))"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
    <div class="window-content">${contentHtml}</div>`;

  document.getElementById('desktop').appendChild(win);
  makeWindowDraggable(win);

  if (type === 'notes') {
    const editor = win.querySelector('.wysiwyg-editor');
    editor?.addEventListener('paste', event => {
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      event.preventDefault();
      const html = clipboard.getData('text/html');
      const plain = clipboard.getData('text/plain');
      document.execCommand(html ? 'insertHTML' : 'insertText', false, html ? sanitizeRichText(html) : plain);
      saveCurrentClassData();
    });
  }

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
  if (type === 'attendance') {
    const savedAttendance = extraData?.attendance;
    renderAttendance(winId, savedAttendance?.date === getLocalDateKey() && isRecord(savedAttendance.statuses) ? savedAttendance.statuses : {});
  }
  if (type === 'checklist') { checklistData[winId] = Array.isArray(extraData?.tasks) ? extraData.tasks : []; renderChecklist(winId); }
  if (type === 'timer') {
    const restored = extraData?.timer;
    const totalSec = Number.isFinite(restored?.totalSec) ? Math.max(0, Math.min(5999, restored.totalSec)) : 300;
    const initialSec = Number.isFinite(restored?.initialSec) ? Math.max(totalSec, Math.min(5999, restored.initialSec)) : totalSec;
    timerData[winId] = { totalSec, initialSec, interval: null, state: restored ? 'paused' : 'idle' };
    setColsFromSec(winId, totalSec);
    updateTimerDisplay(winId);
  }
  if (type === 'chrono' && Number.isFinite(extraData?.elapsedCentis)) {
    const display = win.querySelector('.display-time');
    const centis = Math.max(0, extraData.elapsedCentis);
    if (display) {
      display.dataset.time = centis;
      display.textContent = `${String(Math.floor(centis / 6000)).padStart(2, '0')}:${String(Math.floor((centis % 6000) / 100)).padStart(2, '0')}.${String(centis % 100).padStart(2, '0')}`;
    }
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
  const timer = timerData[id];
  const wasRunning = timer?.state === 'running';
  const wasPaused = timer?.state === 'paused';
  const previousTotal = wasRunning && Number.isFinite(timer.deadlineAt)
    ? Math.max(0, Math.ceil((timer.deadlineAt - Date.now()) / 1000))
    : getTimerSecFromCols(id);
  if (wasRunning && timer.interval) clearInterval(timer.interval);
  let totalSec = previousTotal;
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

  let newTotal = ((m10 * 10 + m1) * 60) + (s10 * 10 + s1);
  if (wasRunning && newTotal === 0) newTotal = 1;
  const initialSec = wasRunning
    ? Math.max(newTotal, (timer.initialSec || previousTotal) + (newTotal - previousTotal))
    : newTotal;
  timerData[id] = { totalSec: newTotal, initialSec, interval: null, deadlineAt: null, state: wasRunning || wasPaused ? 'paused' : 'idle' };
  setColsFromSec(id, newTotal);
  updateTimerDisplay(id);
  if (wasRunning) startTimer(id);
  else updateTimerButtonsState(id, wasPaused ? 'paused' : 'idle');
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

  const startSec = timerData[id].totalSec;
  timerData[id].deadlineAt = Date.now() + startSec * 1000;

  timerData[id].interval = setInterval(() => {
    const currentSec = Math.max(0, Math.ceil((timerData[id].deadlineAt - Date.now()) / 1000));
    timerData[id].totalSec = currentSec;
    setColsFromSec(id, currentSec);
    updateTimerDisplay(id);

    if (currentSec <= 0) {
      clearInterval(timerData[id].interval);
      timerData[id].interval = null;
      timerData[id].deadlineAt = null;
      timerData[id].state = 'ended';
      updateTimerButtonsState(id, 'ended');
      playDingDong();
      showCustomModal("Temps écoulé", "⏱️ Le minuteur est arrivé à son terme !", false, "", null);
    }
  }, 250);
}

function pauseTimer(id) {
  if (timerData[id] && timerData[id].state === 'running') {
    clearInterval(timerData[id].interval);
    timerData[id].interval = null;
    if (Number.isFinite(timerData[id].deadlineAt)) {
      timerData[id].totalSec = Math.max(0, Math.ceil((timerData[id].deadlineAt - Date.now()) / 1000));
      setColsFromSec(id, timerData[id].totalSec);
      updateTimerDisplay(id);
    }
    timerData[id].deadlineAt = null;
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
  container.replaceChildren();
  if (!scoresData[winId]) scoresData[winId] = {};

  const list = document.createElement('div');
  list.className = 'score-scroll-list';
  const addRow = (label, key) => {
    const row = document.createElement('div'); row.className = 'score-row-item';
    const name = document.createElement('span'); name.textContent = label;
    const controls = document.createElement('div'); controls.style.cssText = 'display:flex; align-items:center; gap:8px;';
    const badge = document.createElement('span'); badge.className = 'score-badge-num'; badge.id = `score-box-${winId}-${key}`; badge.textContent = scoresData[winId][key] || 0;
    const plus = document.createElement('button'); plus.textContent = '+'; plus.addEventListener('click', () => updateScoreVal(winId, key, 1));
    const minus = document.createElement('button'); minus.className = 'btn-neutral'; minus.textContent = '−'; minus.addEventListener('click', () => updateScoreVal(winId, key, -1));
    controls.append(badge, plus, minus); row.append(name, controls); list.appendChild(row);
  };

  if (mode === 'groups') {
    const students = settings.classes[settings.activeClass] || [];
    let groupCount = Math.ceil(students.length / 3) || 3;
    let groupNames = [];
    for (let i = 1; i <= groupCount; i++) groupNames.push(`Groupe ${i}`);

    groupNames.forEach(group => addRow(group, `grp_${group}`));
    container.appendChild(list);
  } else if (mode === 'individual') {
    const students = settings.classes[settings.activeClass] || [];
    if (students.length === 0) {
      const empty = document.createElement('div'); empty.textContent = 'Aucun élève !'; empty.style.cssText = 'text-align:center;color:#ef4444;padding:20px;font-size:0.85rem;'; container.appendChild(empty);
      return;
    }
    students.forEach((student, index) => addRow(student, `st_${index}`));
    container.appendChild(list);
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

function renderAttendance(winId, saved = attendanceData[winId] || {}) {
  const list = document.getElementById(`attendance-list-${winId}`);
  const summary = document.getElementById(`attendance-summary-${winId}`);
  if (!list || !summary) return;
  attendanceData[winId] = { ...saved };
  const todayRecord = settings.attendanceHistory?.[settings.activeClass]?.[getLocalDateKey()];
  if (!Object.keys(attendanceData[winId]).length && Array.isArray(todayRecord?.absent)) {
    todayRecord.absent.forEach(student => { attendanceData[winId][student] = false; });
  }
  list.replaceChildren();
  const students = settings.classes[settings.activeClass] || [];
  if (!students.length) {
    const empty = document.createElement('p'); empty.className = 'students-empty'; empty.textContent = 'Ajoute des élèves à cette classe pour noter les présences.'; list.appendChild(empty);
  }
  students.forEach(student => {
    const key = student;
    const present = attendanceData[winId][key] !== false;
    const row = document.createElement('div'); row.className = 'attendance-row';
    const name = document.createElement('span'); name.textContent = student;
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = `attendance-toggle ${present ? 'is-present' : 'is-absent'}`;
    toggle.textContent = present ? 'Présent' : 'Absent';
    toggle.setAttribute('aria-pressed', String(present));
    toggle.addEventListener('click', () => { attendanceData[winId][key] = !present; renderAttendance(winId); saveCurrentClassData(); });
    row.append(name, toggle); list.appendChild(row);
  });
  const presentCount = students.reduce((count, student) => count + (attendanceData[winId][student] === false ? 0 : 1), 0);
  const total = document.createElement('span');
  total.textContent = `${presentCount} présent${presentCount > 1 ? 's' : ''} · ${students.length - presentCount} absent${students.length - presentCount > 1 ? 's' : ''} · ${students.length} élèves`;
  const bulkActions = document.createElement('div'); bulkActions.className = 'attendance-bulk-actions';
  const markAll = (present) => {
    attendanceData[winId] = Object.fromEntries(students.map(student => [student, present]));
    renderAttendance(winId); saveCurrentClassData();
  };
  const allPresent = document.createElement('button'); allPresent.type = 'button'; allPresent.className = 'attendance-reset'; allPresent.textContent = 'Tout présent';
  allPresent.addEventListener('click', () => markAll(true));
  const allAbsent = document.createElement('button'); allAbsent.type = 'button'; allAbsent.className = 'attendance-reset attendance-mark-absent'; allAbsent.textContent = 'Tout absent';
  allAbsent.addEventListener('click', () => { if (window.confirm(`Marquer les ${students.length} élèves de ${settings.activeClass} comme absents ?`)) markAll(false); });
  bulkActions.append(allPresent, allAbsent);
  summary.replaceChildren(total, bulkActions);
  const status = document.getElementById(`attendance-validation-status-${winId}`);
  if (status) status.textContent = todayRecord ? `Dernier appel validé aujourd’hui à ${new Date(todayRecord.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Pense à valider l’appel pour l’enregistrer.';
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validateAttendance(winId) {
  const className = settings.activeClass;
  const students = settings.classes[className] || [];
  if (!students.length) { toast('Ajoute des élèves avant de valider l’appel.'); return; }
  const absent = students.filter(student => attendanceData[winId]?.[student] === false);
  const present = students.filter(student => !absent.includes(student));
  if (!isRecord(settings.attendanceHistory)) settings.attendanceHistory = {};
  if (!isRecord(settings.attendanceHistory[className])) settings.attendanceHistory[className] = {};
  settings.attendanceHistory[className][getLocalDateKey()] = {
    absent, present, total: students.length, validatedAt: new Date().toISOString()
  };
  saveCurrentClassData();
  renderAttendance(winId);
  if (saveSettings()) toast(`Appel validé pour ${className} : ${absent.length} absence${absent.length > 1 ? 's' : ''} enregistrée${absent.length > 1 ? 's' : ''}.`);
  if (!document.getElementById('attendance-screen')?.hidden) renderAttendanceReport('home-attendance');
}

function openAttendanceDashboard() {
  document.getElementById('home-screen')?.classList.add('is-hidden');
  document.getElementById('attendance-screen').hidden = false;
  initializeAttendanceReport('home-attendance');
}

function initializeAttendanceReport(winId) {
  const classSelect = document.getElementById(`attendance-class-${winId}`);
  if (!classSelect) return;
  const previousValue = classSelect.value;
  classSelect.replaceChildren();
  const all = document.createElement('option'); all.value = ''; all.textContent = 'Toutes les classes'; classSelect.appendChild(all);
  const names = new Set([...Object.keys(settings.classes), ...Object.keys(settings.attendanceHistory || {})]);
  names.forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; classSelect.appendChild(option); });
  if (names.has(previousValue)) classSelect.value = previousValue;
  renderAttendanceReport(winId);
}

function attendanceWeekStart(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function attendanceIsoWeek(date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((utc - yearStart) / 86400000) + 1) / 7), year: utc.getUTCFullYear() };
}

function renderAttendanceReport(winId) {
  const chart = document.getElementById(`attendance-chart-${winId}`);
  const periodSelect = document.getElementById(`attendance-period-${winId}`);
  const classSelect = document.getElementById(`attendance-class-${winId}`);
  const kpis = document.getElementById(`attendance-kpis-${winId}`);
  const empty = document.getElementById(`attendance-report-empty-${winId}`);
  if (!chart || !periodSelect || !classSelect || !kpis || !empty) return;
  const period = periodSelect.value;
  const selectedClass = classSelect.value;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let buckets = [];
  if (period === 'day') {
    for (let offset = 13; offset >= 0; offset--) {
      const date = new Date(today); date.setDate(date.getDate() - offset);
      buckets.push({ key: getLocalDateKey(date), label: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), date });
    }
  } else if (period === 'week') {
    const monday = attendanceWeekStart(today);
    for (let offset = 11; offset >= 0; offset--) {
      const date = new Date(monday); date.setDate(date.getDate() - offset * 7);
      const iso = attendanceIsoWeek(date);
      buckets.push({ key: getLocalDateKey(date), label: `S${iso.week}`, detail: String(iso.year), date });
    }
  } else {
    for (let offset = 11; offset >= 0; offset--) {
      const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      buckets.push({ key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''), detail: String(date.getFullYear()), date });
    }
  }
  const byKey = new Map(buckets.map(bucket => [bucket.key, { ...bucket, absences: 0, present: 0, total: 0, calls: 0 }]));
  Object.entries(settings.attendanceHistory || {}).forEach(([className, records]) => {
    if (selectedClass && className !== selectedClass) return;
    if (!isRecord(records)) return;
    Object.entries(records).forEach(([dateKey, record]) => {
      if (!isRecord(record)) return;
      const [year, month, day] = dateKey.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const bucketKey = period === 'day' ? dateKey : period === 'week' ? getLocalDateKey(attendanceWeekStart(date)) : `${year}-${String(month).padStart(2, '0')}`;
      const bucket = byKey.get(bucketKey);
      if (!bucket) return;
      const absentCount = Array.isArray(record.absent) ? record.absent.length : 0;
      const totalCount = Number.isFinite(record.total) ? record.total : absentCount + (Array.isArray(record.present) ? record.present.length : 0);
      bucket.absences += absentCount;
      bucket.total += totalCount;
      bucket.present += Array.isArray(record.present) ? record.present.length : Math.max(0, totalCount - absentCount);
      bucket.calls++;
    });
  });
  const series = Array.from(byKey.values());
  const totalAbsences = series.reduce((sum, bucket) => sum + bucket.absences, 0);
  const totalPresent = series.reduce((sum, bucket) => sum + bucket.present, 0);
  const totalCount = series.reduce((sum, bucket) => sum + bucket.total, 0);
  const totalCalls = series.reduce((sum, bucket) => sum + bucket.calls, 0);
  const rate = totalCount ? `${Math.round(totalPresent / totalCount * 100)} %` : '—';
  kpis.replaceChildren();
  [[totalAbsences, 'Absences enregistrées'], [totalCalls, 'Appels validés'], [rate, 'Taux de présence']].forEach(([value, label]) => {
    const card = document.createElement('div'); card.className = 'attendance-kpi';
    const number = document.createElement('strong'); number.textContent = value;
    const caption = document.createElement('span'); caption.textContent = label;
    card.append(number, caption); kpis.appendChild(card);
  });
  chart.replaceChildren();
  chart.hidden = totalCalls === 0;
  const details = document.getElementById(`attendance-detail-${winId}`);
  if (details) details.replaceChildren();
  const max = Math.max(1, ...series.map(bucket => bucket.absences));
  series.forEach(bucket => {
    const column = document.createElement('button'); column.type = 'button'; column.className = 'attendance-chart-column';
    column.setAttribute('aria-label', `${bucket.label}${bucket.detail ? ` ${bucket.detail}` : ''} : ${bucket.absences} absence${bucket.absences === 1 ? '' : 's'}. Afficher le détail.`);
    column.addEventListener('click', () => renderAttendanceBucketDetails(winId, period, bucket, selectedClass));
    const value = document.createElement('span'); value.className = 'attendance-chart-value'; value.textContent = String(bucket.absences);
    const track = document.createElement('div'); track.className = 'attendance-chart-track';
    const bar = document.createElement('div'); bar.className = 'attendance-chart-bar'; bar.style.height = `${bucket.absences ? Math.max(6, bucket.absences / max * 100) : 3}%`; bar.title = `${bucket.absences} absence${bucket.absences > 1 ? 's' : ''}`;
    track.appendChild(bar);
    const label = document.createElement('span'); label.className = 'attendance-chart-label'; label.textContent = bucket.label; label.title = bucket.detail ? `${bucket.label} ${bucket.detail}` : bucket.label;
    column.append(value, track, label); chart.appendChild(column);
  });
  empty.hidden = totalCalls > 0;
}

function renderAttendanceBucketDetails(winId, period, bucket, selectedClass) {
  const panel = document.getElementById(`attendance-detail-${winId}`);
  if (!panel) return;
  const records = [];
  Object.entries(settings.attendanceHistory || {}).forEach(([className, classRecords]) => {
    if (selectedClass && className !== selectedClass) return;
    if (!isRecord(classRecords)) return;
    Object.entries(classRecords).forEach(([dateKey, record]) => {
      if (!isRecord(record)) return;
      const [year, month, day] = dateKey.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const key = period === 'day' ? dateKey : period === 'week' ? getLocalDateKey(attendanceWeekStart(date)) : `${year}-${String(month).padStart(2, '0')}`;
      if (key === bucket.key) records.push({ className, date, absent: Array.isArray(record.absent) ? record.absent : [] });
    });
  });
  records.sort((a, b) => a.className.localeCompare(b.className, 'fr') || a.date - b.date);
  const heading = document.createElement('h2'); heading.className = 'attendance-detail-heading';
  heading.textContent = `Détail · ${bucket.label}${bucket.detail ? ` ${bucket.detail}` : ''}`;
  const list = document.createElement('div'); list.className = 'attendance-detail-list';
  records.forEach(record => {
    const row = document.createElement('div'); row.className = 'attendance-detail-row';
    const caption = document.createElement('strong'); caption.textContent = `${record.className} · ${record.date.toLocaleDateString('fr-FR')}`;
    const names = document.createElement('span'); names.textContent = record.absent.length ? `Absents : ${record.absent.join(', ')}` : 'Aucune absence enregistrée';
    row.append(caption, names); list.appendChild(row);
  });
  if (!records.length) { const empty = document.createElement('p'); empty.className = 'attendance-detail-empty'; empty.textContent = 'Aucun appel enregistré pour cette période.'; list.appendChild(empty); }
  panel.replaceChildren(heading, list);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exportAttendanceReport(winId) {
  const period = document.getElementById(`attendance-period-${winId}`)?.value || 'day';
  const selectedClass = document.getElementById(`attendance-class-${winId}`)?.value || '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let from;
  if (period === 'day') { from = new Date(today); from.setDate(from.getDate() - 13); }
  else if (period === 'week') { from = attendanceWeekStart(today); from.setDate(from.getDate() - 77); }
  else { from = new Date(today.getFullYear(), today.getMonth() - 11, 1); }
  const rows = [['Date', 'Classe', 'Absents', 'Présents', 'Total', 'Appel validé le']];
  Object.entries(settings.attendanceHistory || {}).forEach(([className, records]) => {
    if (selectedClass && className !== selectedClass) return;
    if (!isRecord(records)) return;
    Object.entries(records).forEach(([dateKey, record]) => {
      if (!isRecord(record)) return;
      const [year, month, day] = dateKey.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      if (date < from || date > today) return;
      const absent = Array.isArray(record.absent) ? record.absent : [];
      const present = Array.isArray(record.present) ? record.present : [];
      const total = Number.isFinite(record.total) ? record.total : absent.length + present.length;
      rows.push([dateKey, className, absent.join(', '), present.join(', '), String(total), record.validatedAt || '']);
    });
  });
  if (rows.length === 1) { toast('Aucun appel à exporter pour cette période.'); return; }
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadBlob(`maestro-presences-${getLocalDateKey()}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  toast(`${rows.length - 1} appel${rows.length > 2 ? 's' : ''} exporté${rows.length > 2 ? 's' : ''} en CSV.`);
}

function renderChecklist(winId) {
  const list = document.getElementById(`checklist-items-${winId}`);
  if (!list) return;
  if (!Array.isArray(checklistData[winId])) checklistData[winId] = [];
  list.replaceChildren();
  checklistData[winId].forEach((task, index) => {
    const row = document.createElement('label'); row.className = 'checklist-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.done === true;
    checkbox.addEventListener('change', () => { checklistData[winId][index].done = checkbox.checked; saveCurrentClassData(); });
    const text = document.createElement('span'); text.textContent = task.text;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'checklist-remove'; remove.textContent = '×'; remove.title = 'Supprimer';
    remove.addEventListener('click', event => { event.preventDefault(); checklistData[winId].splice(index, 1); renderChecklist(winId); saveCurrentClassData(); });
    row.append(checkbox, text, remove); list.appendChild(row);
  });
  if (!checklistData[winId].length) { const empty = document.createElement('p'); empty.className = 'students-empty'; empty.textContent = 'Ta liste est vide pour le moment.'; list.appendChild(empty); }
}

function addClassTask(winId) {
  showCustomModal('Nouvel élément', 'Que veux-tu ajouter à la liste de classe ?', true, '', (confirmed, value) => {
    if (!confirmed || !value?.trim()) return;
    if (!Array.isArray(checklistData[winId])) checklistData[winId] = [];
    checklistData[winId].push({ text: value.trim().slice(0, 160), done: false });
    renderChecklist(winId);
    saveCurrentClassData();
  });
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
  canvasResizeObservers[winId] = resizeObserver;
  resizeObserver.observe(canvas.parentElement);
}

function saveCanvasState(winId) {
  const canvas = document.getElementById(`canvas-${winId}`);
  if (!canvas) return;
  if (!canvasHistories[winId]) canvasHistories[winId] = { undoList: [], redoList: [] };
  
  canvasHistories[winId].undoList.push(canvas.toDataURL());
  if (canvasHistories[winId].undoList.length > 30) canvasHistories[winId].undoList.shift();
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
  const shuffled = [...students];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  container.innerHTML = '';
  let groupIndex = 1;
  for (let i = 0; i < shuffled.length; i += size) {
    const group = shuffled.slice(i, i + size);
    const card = document.createElement('div');
    card.className = 'group-card';
    const heading = document.createElement('h5'); heading.textContent = `Groupe ${groupIndex}`; card.appendChild(heading);
    group.forEach(student => { const row = document.createElement('div'); row.textContent = `• ${student}`; card.appendChild(row); });
    container.appendChild(card);
    groupIndex++;
  }
}

function makeWindowDraggable(elmnt) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = elmnt.querySelector('.window-header');
  header.onmousedown = (e) => {
    if (e.target.closest('button') || elmnt.classList.contains('window-maximized')) return;
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
  const className = settings.activeClass;
  const pool = [...new Set(students)];
  let drawState = settings.randomDrawState[className];
  if (!isRecord(drawState) || !Array.isArray(drawState.pool) || !Array.isArray(drawState.remaining)) drawState = { pool: [], remaining: [] };
  let remaining = drawState.remaining.filter(student => pool.includes(student));
  const added = pool.filter(student => !drawState.pool.includes(student));
  if (!remaining.length) remaining = shuffleList(pool);
  else if (added.length) remaining = shuffleList([...remaining, ...added]);
  const selected = remaining.shift();
  settings.randomDrawState[className] = { pool, remaining };
  saveSettings();
  let duration = (settings.drawDuration || 3) * 1000;
  let elapsed = 0;
  if (studentDrawTimers[id]) clearInterval(studentDrawTimers[id]);
  const interval = setInterval(() => {
    const randomStudent = students[Math.floor(Math.random() * students.length)];
    resDiv.textContent = randomStudent;
    elapsed += 60;
    if (elapsed >= duration) { clearInterval(interval); delete studentDrawTimers[id]; resDiv.textContent = selected; }
  }, 60);
  studentDrawTimers[id] = interval;
}

function shuffleList(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  return shuffled;
}

const chronos = {};
function startChrono(id) {
  if (chronos[id]) return;
  const display = document.getElementById(`disp-${id}`);
  if (!display) return;
  const baseCentis = parseInt(display.dataset.time || 0);
  const startedAt = performance.now();
  chronos[id] = setInterval(() => {
    const centis = baseCentis + Math.floor((performance.now() - startedAt) / 10);
    document.getElementById(`disp-${id}`).dataset.time = centis;
    const m = String(Math.floor(centis / 6000)).padStart(2, '0');
    const s = String(Math.floor((centis % 6000) / 100)).padStart(2, '0');
    const c = String(centis % 100).padStart(2, '0');
    document.getElementById(`disp-${id}`).textContent = `${m}:${s}.${c}`;
  }, 50);
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
