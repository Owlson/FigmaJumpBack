(function() {
  // Ширина окна изменена на 280
  figma.showUI(__html__, { width: 280, height: 400 });

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

  async function addEntry(e) {
    if (locked) return getHistory();
    let h = await getHistory();
    h = h.filter(x => !(x.pageId===e.pageId && x.nodeId===e.nodeId));
    h.unshift(e);
    if (h.length>MAX_ENTRIES) h.length = MAX_ENTRIES;
    await saveHistory(h);
    return h;
  }

  async function updateHistoryUI() {
    const h = await getHistory();
    figma.ui.postMessage({ type:'history', history: h });
  }
  function sendLockState() {
    figma.ui.postMessage({ type:'lockState', locked });
  }

  (async ()=>{
    const sel = figma.currentPage.selection[0]||null;
    const entry = {
      pageId:    figma.currentPage.id,
      pageName:  figma.currentPage.name,
      nodeId:    sel?sel.id:undefined,
      nodeName:  sel?sel.name:undefined,
      nodeType:  sel?sel.type:'PAGE',
      layoutMode: sel && 'layoutMode' in sel ? sel.layoutMode : 'NONE',
      timestamp: new Date().toISOString()
    };
    await addEntry(entry);
    await updateHistoryUI();
    sendLockState();
  })();

  figma.on('selectionchange', async ()=>{
    const sel = figma.currentPage.selection[0]||null;
    const entry = {
      pageId:    figma.currentPage.id,
      pageName:  figma.currentPage.name,
      nodeId:    sel?sel.id:undefined,
      nodeName:  sel?sel.name:undefined,
      nodeType:  sel?sel.type:'PAGE',
      layoutMode: sel && 'layoutMode' in sel ? sel.layoutMode : 'NONE',
      timestamp: new Date().toISOString()
    };
    await addEntry(entry);
    await updateHistoryUI();
  });

  figma.ui.onmessage = async msg=>{
    switch(msg.type) {
      case 'getHistory':   return updateHistoryUI();
      case 'getLockState': return sendLockState();
      case 'toggleLock':   locked = msg.locked; return sendLockState();
      case 'clearHistory': await saveHistory([]); return updateHistoryUI();
      case 'removeEntry': {
        const h = await getHistory();
        h.splice(msg.index,1);
        await saveHistory(h);
        return updateHistoryUI();
      }
      case 'navigateTo': {
        const h = await getHistory();
        const e = h[msg.index];
        if (!e) return;
        const p = figma.root.children.find(x=>x.id===e.pageId);
        if (!p) {
          figma.notify(`❌ Page "${e.pageName}" not found`);
          return;
        }
        await figma.setCurrentPageAsync(p);
        if (e.nodeId) {
          const n = p.findOne(x=>x.id===e.nodeId);
          if (n) {
            figma.currentPage.selection = [n];
            figma.viewport.scrollAndZoomIntoView([n]);
          }
        }
        return;
      }
      case 'resize':
        return figma.ui.resize(280, msg.height);
    }
  };
})();
