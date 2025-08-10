// Figma JumpBack — main (фикс добавления записей по кликам)

const HISTORY_KEY = 'navHistory';
const MAX_ENTRIES = 20;
const UI_WIDTH = 280;
const MIN_HEIGHT = 240;

let locked = false;
let debounceTimer = null;
// Игнорируем следующее системное selectionchange после нашей навигации
let ignoreNextSelection = false;

figma.showUI(__html__, { width: UI_WIDTH, height: 400 });

// ---------- storage ----------
async function getHistory() {
  const raw = await figma.clientStorage.getAsync(HISTORY_KEY);
  return Array.isArray(raw) ? raw : [];
}
async function saveHistory(arr) {
  await figma.clientStorage.setAsync(HISTORY_KEY, arr);
}
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ---------- icon mapping ----------
function iconForNode(node) {
  try {
    if (node.type === 'FRAME' && node.layoutMode && node.layoutMode !== 'NONE') {
      return 'autolayout';
    }
    switch (node.type) {
      case 'FRAME': return 'frame';
      case 'COMPONENT': return 'component';
      case 'COMPONENT_SET': return 'component_set';
      case 'INSTANCE': return 'instance';
      case 'GROUP': return 'group';
      case 'TEXT': return 'text';
      case 'BOOLEAN_OPERATION': return 'boolean_operation';
      case 'VECTOR': return 'vector';
      case 'RECTANGLE': return 'rectangle';
      case 'ELLIPSE': return 'ellipse';
      case 'LINE': return 'line';
      case 'POLYGON': return 'polygon';
      case 'STAR': return 'star';
      case 'SHAPE_WITH_TEXT': return 'shape_with_text';
      case 'PAGE': return 'page';
      case 'SLICE': return 'slice';
      case 'SECTION': return 'frame';
      default: return 'default';
    }
  } catch (e) {
    return 'default';
  }
}

// ---------- history ops ----------
async function addEntryFromSelection() {
  if (locked) return;

  const page = figma.currentPage;
  if (!page) return;

  const selArr = page.selection;
  const sel = (selArr && selArr.length > 0) ? selArr[0] : null;
  if (!sel) return;

  // формируем запись
  const entry = {
    ts: Date.now(),
    pageId: page.id,
    pageName: page.name,
    nodeId: sel.id,
    nodeName: truncate(sel.name || sel.id, 70),
    nodeType: sel.type,
    layoutMode: sel.layoutMode || 'NONE',
    icon: iconForNode(sel)
  };

  // сохраняем (dedupe по pageId+nodeId)
  let h = await getHistory();
  h = h.filter(x => !(x.pageId === entry.pageId && x.nodeId === entry.nodeId));
  h.unshift(entry);
  if (h.length > MAX_ENTRIES) h.length = MAX_ENTRIES;
  await saveHistory(h);
  sendHistory(h);
}

// ---------- UI sync ----------
function sendHistory(h) {
  figma.ui.postMessage({ type: 'history', history: h });
}
function sendLockState() {
  figma.ui.postMessage({ type: 'lock', locked: locked });
}

// ---------- navigation ----------
async function navigateTo(entry) {
  const page = figma.root.findChild(function(p) { return p.id === entry.pageId; });
  if (!page) return;

  figma.currentPage = page;
  const node = figma.getNodeById(entry.nodeId);

  if (node) {
    // Однократно игнорируем следующее событие выделения, чтобы не писать его в историю
    ignoreNextSelection = true;
    page.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  }
}

// ---------- events ----------
figma.on('selectionchange', function() {
  // если игнор — сбрасываем и выходим
  if (ignoreNextSelection) {
    ignoreNextSelection = false;
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(addEntryFromSelection, 300);
});

// ---------- IPC ----------
figma.ui.onmessage = async function(msg) {
  if (msg && msg.type === 'ready') {
    sendLockState();
    sendHistory(await getHistory());
    // записываем стартовую селекцию, если есть
    addEntryFromSelection();
    return;
  }
  if (msg && msg.type === 'toggle-lock') {
    locked = !locked;
    sendLockState();
    return;
  }
  if (msg && msg.type === 'clear-history') {
    await saveHistory([]);
    figma.notify('JumpBack: history cleared');
    sendHistory([]);
    return;
  }
  if (msg && msg.type === 'remove-entry') {
    const idx = msg.index;
    let h = await getHistory();
    if (idx >= 0 && idx < h.length) {
      h.splice(idx, 1);
      await saveHistory(h);
      sendHistory(h);
    }
    return;
  }
  if (msg && msg.type === 'navigate') {
    await navigateTo(msg.entry);
    return;
  }
  if (msg && msg.type === 'resize') {
    const height = Math.max(MIN_HEIGHT, Math.floor(msg.height || 400));
    figma.ui.resize(UI_WIDTH, height);
    return;
  }
};

// ---------- bootstrap ----------
(async function() {
  sendLockState();
  sendHistory(await getHistory());
  // На старте: если уже что-то выделено — положим в историю
  addEntryFromSelection();
})();
