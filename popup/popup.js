const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const clearBtn = document.getElementById('clear');
const guideBtn = document.getElementById('guide');

const setStatus = (message, isError = false) => {
  statusEl.textContent = message || '';
  statusEl.style.color = isError ? '#ff7373' : '#bbbbbb';
};

const prependLog = (text) => {
  const timestamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${timestamp}] ${text}\n` + logEl.textContent;
};

clearBtn.addEventListener('click', () => {
  logEl.textContent = '';
  setStatus('Log cleared.');
});

guideBtn.addEventListener('click', async () => {
  setStatus('Guiding to nearest form…');
  guideBtn.disabled = true;
  try {
    const response = await sendMessageToTab({ type: 'GUIDE_TO_FORM', trigger: 'click' });
    if (response && response.awaitingClick) {
      setStatus('Click on the page to guide to the nearest form.');
    } else if (response && response.ok) {
      const label = response.label || 'form control';
      const trigger = response.trigger && response.trigger !== 'popup'
        ? ` via ${response.trigger.replace(/-/g, ' ')}`
        : '';
      setStatus(`Guided to ${label}${trigger}. Click phantom cursor to dismiss.`);
    } else if (response === null) {
      setStatus('Unable to guide on this page.', true);
    } else if (response && response.reason === 'no-form') {
      setStatus('No form controls found in view.', true);
    } else {
      setStatus('Guide command failed.', true);
    }
  } finally {
    guideBtn.disabled = false;
  }
});

const getActiveTab = async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs.length ? tabs[0] : null;
  } catch (error) {
    setStatus(`Unable to query active tab: ${error.message}`, true);
    return null;
  }
};

const sendMessageToTab = async (message) => {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('No active tab detected.', true);
    return null;
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (error?.message?.includes('Receiving end does not exist')) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch (injectionError) {
        setStatus('Cannot run on this page. Try a regular website tab.', true);
        console.warn('Injection error:', injectionError);
        return null;
      }
    }

    setStatus(error?.message || 'Failed to reach content script.', true);
    return null;
  }
};

const describeLogEntry = (payload = {}) => {
  const label = payload.el || payload.label || '?';
  switch (payload.kind) {
    case 'move':
      return `Move (${payload.x}, ${payload.y}) → ${label}`;
    case 'mousedown':
      return `Mouse down (${payload.button}) → ${label}`;
    case 'mouseup':
      return `Mouse up (${payload.button}) → ${label}`;
    case 'click':
      return `Click (${payload.button}) → ${label}`;
    case 'dblclick':
      return `Double click (${payload.button}) → ${label}`;
    case 'contextmenu':
      return `Context menu → ${label}`;
    case 'wheel':
      return `Wheel (dx:${payload.dx}, dy:${payload.dy}) → ${label}`;
    case 'toggle':
      return `Toggle borders ${payload.enabled ? 'ON' : 'OFF'}`;
    case 'guide': {
      const trigger = payload.trigger ? ` (${payload.trigger})` : '';
      return payload.error
        ? `Guide failed${trigger} (${payload.error || 'unknown'})`
        : `Guide${trigger} → ${label}`;
    }
    default:
      return JSON.stringify(payload);
  }
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'DEBUG_LOG' && message.payload) {
    prependLog(describeLogEntry(message.payload));
    if (message.payload.kind === 'guide') {
      if (message.payload.error) {
        setStatus('No form controls found in view.', true);
      } else {
        const label = message.payload.el || 'form control';
        const trigger = message.payload.trigger && message.payload.trigger !== 'popup'
          ? ` via ${message.payload.trigger.replace(/-/g, ' ')}`
          : '';
        setStatus(`Guided to ${label}${trigger}. Click phantom cursor to dismiss.`);
      }
    }
  }
});

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  setStatus(enabled ? 'Enabling borders…' : 'Disabling borders…');
  const response = await sendMessageToTab({ type: 'TOGGLE_BORDERS', enabled });
  if (response && response.acknowledged) {
    setStatus(enabled ? 'Borders enabled.' : 'Borders disabled.');
  } else {
    if (response === null) {
      // Nothing to do; error already surfaced.
      toggle.checked = !enabled;
      return;
    }
    setStatus('Unable to toggle on this page.', true);
    toggle.checked = !enabled;
  }
});

(async () => {
  const response = await sendMessageToTab({ type: 'QUERY_BORDERS' });
  if (response && typeof response.enabled === 'boolean') {
    toggle.checked = response.enabled;
    setStatus(response.enabled ? 'Borders currently on.' : 'Borders currently off.');
  } else if (!statusEl.textContent) {
    setStatus('Toggle to inject the layout overlay.');
  }
})();
