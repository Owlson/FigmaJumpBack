// code.js
(function() {
  // Показываем UI с начальным размером
  figma.showUI(__html__, { width: 320, height: 400 });

  const HISTORY_KEY = 'navHistory';
  const MAX_ENTRIES = 20;
  let locked = false;

  // Получить историю из Client Storage
  async function getHistory() {
    const raw = await figma.clientStorage.getAsync(HISTORY_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  // Сохранить историю в Client Storage
  async function saveHistory(arr) {
    await figma.clientStorage.setAsync(HISTORY_KEY, arr);
  }

  // Добавить запись в историю, если не заблокировано
  async function addEntry(entry) {
    if (locked) {
      return getHistory();
    }
    let history = await getHistory();
    // Удаляем дубликаты
    history = history.filter(e =>
      !(e.pageId === entry.pageId && e.nodeId === entry.nodeId)
    );
    history.unshift(entry);
    // Ограничиваем длину
    if (history.length > MAX_ENTRIES) {
      history = history.slice(0, MAX_ENTRIES);
    }
    await saveHistory(history);
    return history;
  }

  // Обновить UI-панель с текущей историей
  async function updateHistoryUI() {
    const history = await getHistory();
    figma.ui.postMessage({ type: 'history', history });
  }

  // Отправить UI состояние lock
  function sendLockState() {
    figma.ui.postMessage({ type: 'lockState', locked });
  }

  // Инициализация при запуске плагина
  (async function init() {
    const sel = figma.currentPage.selection.length > 0
      ? figma.currentPage.selection[0]
      : null;
    const entry = {
      pageId:    figma.currentPage.id,
      pageName:  figma.currentPage.name,
      nodeId:    sel ? sel.id   : undefined,
      nodeName:  sel ? sel.name : undefined,
      nodeType:  sel ? sel.type : 'PAGE',
      timestamp: new Date().toISOString()
    };
    await addEntry(entry);
    await updateHistoryUI();
    sendLockState();
  })();

  // При каждом изменении выделения пользователя
  figma.on('selectionchange', async () => {
    const sel = figma.currentPage.selection.length > 0
      ? figma.currentPage.selection[0]
      : null;
    const entry = {
      pageId:    figma.currentPage.id,
      pageName:  figma.currentPage.name,
      nodeId:    sel ? sel.id   : undefined,
      nodeName:  sel ? sel.name : undefined,
      nodeType:  sel ? sel.type : 'PAGE',
      timestamp: new Date().toISOString()
    };
    await addEntry(entry);
    await updateHistoryUI();
  });

  // Обработка сообщений из UI
  figma.ui.onmessage = async msg => {
    switch (msg.type) {
      case 'getHistory':
        await updateHistoryUI();
        break;

      case 'getLockState':
        sendLockState();
        break;

      case 'toggleLock':
        locked = msg.locked;
        sendLockState();
        break;

      case 'navigateTo': {
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
        break;
      }

      case 'removeEntry': {
        const history = await getHistory();
        history.splice(msg.index, 1);
        await saveHistory(history);
        await updateHistoryUI();
        break;
      }

      case 'clearHistory':
        await saveHistory([]);
        await updateHistoryUI();
        break;

      case 'resize':
        // Изменяем только высоту окна плагина
        figma.ui.resize(320, msg.height);
        break;
    }
  };
})();
