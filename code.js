// code.js
(function() {
  figma.showUI(__html__, { width: 320, height: 400 });

  const HISTORY_KEY = 'navHistory';
  const MAX_ENTRIES = 20;
  let locked = false;

  async function getHistory() {
    const raw = await figma.clientStorage.getAsync(HISTORY_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  async function saveHistory(arr) {
    await figma.clientStorage.setAsync(HISTORY_KEY, arr);
  }

  async function addEntry(entry) {
    // если залочено — просто возвращаем текущее без добавления
    if (locked) return getHistory();
    let history = await getHistory();
    history = history.filter(e =>
      !(e.pageId === entry.pageId && e.nodeId === entry.nodeId)
    );
    history.unshift(entry);
    history = history.slice(0, MAX_ENTRIES);
    await saveHistory(history);
    return history;
  }

  async function updateHistoryUI() {
    const history = await getHistory();
    figma.ui.postMessage({ type: 'history', history });
  }

  function sendLockState() {
    figma.ui.postMessage({ type: 'lockState', locked });
  }

  // 🚀 Инициализация
  (async function init() {
    const sel = figma.currentPage.selection[0] || null;
    const entry = {
      pageId:    figma.currentPage.id,
      pageName:  figma.currentPage.name,
      nodeId:    sel?.id,
      nodeName:  sel?.name,
      nodeType:  sel?.type || 'PAGE',
      timestamp: new Date().toISOString()
    };
    await addEntry(entry);
    await updateHistoryUI();
    sendLockState();
  })();

  // 🔄 При каждом изменении выделения
  figma.on('selectionchange', async () => {
    const sel = figma.currentPage.selection[0] || null;
    const entry = {
      pageId:    figma.currentPage.id,
      pageName:  figma.currentPage.name,
      nodeId:    sel?.id,
      nodeName:  sel?.name,
      nodeType:  sel?.type || 'PAGE',
      timestamp: new Date().toISOString()
    };
    await addEntry(entry);
    await updateHistoryUI();
  });

  // 💬 Сообщения из UI
  figma.ui.onmessage = async msg => {
    switch (msg.type) {
      case 'getHistory':
        return updateHistoryUI();

      case 'getLockState':
        return sendLockState();

      case 'toggleLock':
        locked = msg.locked;
        return sendLockState();

      case 'navigateTo':
        const history = await getHistory();
        const entry = history[msg.index];
        if (!entry) return;
        const page = figma.root.children.find(p => p.id === entry.pageId);
        if (!page) {
          figma.notify(`❌ Page "${entry.pageName}" not found`);
          return;
        }
        await figma.setCurrentPageAsync(page);
        if (entry.nodeId) {
          const node = page.findOne(n => n.id === entry.nodeId);
          if (node) {
            figma.currentPage.selection = [node];
            figma.viewport.scrollAndZoomIntoView([node]);
          }
        }
        return;

      case 'removeEntry':
        let h = await getHistory();
        h.splice(msg.index, 1);
        await saveHistory(h);
        return updateHistoryUI();

      case 'clearHistory':
        await saveHistory([]);
        return updateHistoryUI();

      case 'resize':
        // только вертикальный ресайз
        figma.ui.resize(320, msg.height);
        return;
    }
  };
})();
