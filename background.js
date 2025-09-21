const snapshotStore = new Map();

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for future initialization hooks.
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'STORE_SNAPSHOT') {
    const nodes = Array.isArray(message.nodes) ? message.nodes : null;
    const tabId = message.tabId ?? sender.tab?.id;
    if (!tabId) {
      sendResponse?.({ ok: false, error: 'Missing tab id for snapshot storage.' });
      return;
    }
    if (!nodes) {
      sendResponse?.({ ok: false, error: 'Invalid snapshot payload.' });
      return;
    }

    snapshotStore.set(tabId, {
      nodes,
      url: message.url ?? sender.tab?.url ?? '',
      capturedAt: Date.now()
    });
    sendResponse?.({ ok: true, count: nodes.length });
    return;
  }

  if (message.type === 'REQUEST_TOUR') {
    const tabId = message.tabId ?? sender.tab?.id;
    if (!tabId) {
      sendResponse?.({ ok: false, error: 'Missing tab id for tour request.' });
      return;
    }

    const snapshot = snapshotStore.get(tabId);
    if (!snapshot) {
      sendResponse?.({ ok: false, error: 'No snapshot stored for this tab.' });
      return;
    }

    const nodes = snapshot.nodes;
    const steps = nodes.slice(0, Math.min(nodes.length, 5)).map((node, index) => ({
      step: index + 1,
      selector: node.selector,
      instruction: node.text ? `Focus on ${node.text}` : `Inspect ${node.selector}`,
      hint: node.clickable ? 'Clickable element' : 'Reference element'
    }));

    sendResponse?.({
      ok: true,
      steps,
      source: {
        url: snapshot.url,
        capturedAt: snapshot.capturedAt
      }
    });
    return;
  }
});
