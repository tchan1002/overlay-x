const STYLE_ID = 'ld-style';
const TOOLTIP_ID = 'ld-tooltip';
let bordersEnabled = false;
let lastPointerEvent = null;
let lastLabel = '';
let currentAction = '';

function ensureStyleElement() {
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

function applyBorders() {
  const styleEl = ensureStyleElement();
  styleEl.textContent = bordersEnabled
    ? '* { outline: 1px solid red !important; }'
    : '* { outline: none !important; }';
}

function ensureTooltip() {
  let tooltip = document.getElementById(TOOLTIP_ID);
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.style.position = 'fixed';
    tooltip.style.zIndex = '2147483647';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.background = 'rgba(0, 0, 0, 0.85)';
    tooltip.style.color = '#fff';
    tooltip.style.fontSize = '12px';
    tooltip.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    tooltip.style.padding = '4px 8px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.4)';
    tooltip.style.display = 'none';
    tooltip.style.maxWidth = '280px';
    tooltip.style.whiteSpace = 'pre';
    tooltip.style.textOverflow = 'ellipsis';
    tooltip.style.overflow = 'hidden';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function describeElement(el) {
  if (!el || !el.tagName) {
    return 'unknown element';
  }
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  let classPart = '';
  if (el.className && typeof el.className === 'string') {
    classPart = '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
  }
  return (tag + id + classPart).slice(0, 80) || tag;
}

function buttonName(button) {
  switch (button) {
    case 0:
      return 'Left';
    case 1:
      return 'Middle';
    case 2:
      return 'Right';
    case 3:
      return 'Back';
    case 4:
      return 'Forward';
    default:
      return `Button ${button}`;
  }
}

function sendLog(payload) {
  try {
    chrome.runtime.sendMessage({ type: 'DEBUG_LOG', payload }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  } catch (error) {
    // Logging is best-effort; ignore runtime errors when popup is closed.
  }
}

function updateTooltip(event, label) {
  const tooltip = ensureTooltip();
  lastPointerEvent = event;
  lastLabel = label || lastLabel || 'unknown element';
  const text = currentAction
    ? `${lastLabel}\nAction: ${currentAction}`
    : lastLabel;
  tooltip.textContent = text;
  tooltip.style.display = 'block';

  const offsetX = 18;
  const offsetY = 24;
  let left = event.clientX + offsetX;
  let top = event.clientY + offsetY;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipRect = tooltip.getBoundingClientRect();

  if (left + tooltipRect.width > viewportWidth) {
    left = event.clientX - tooltipRect.width - offsetX;
  }
  if (top + tooltipRect.height > viewportHeight) {
    top = event.clientY - tooltipRect.height - offsetY;
  }

  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function refreshTooltip() {
  if (lastPointerEvent) {
    updateTooltip(lastPointerEvent, lastLabel);
  }
}

function hideTooltip() {
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

applyBorders();
ensureTooltip();

let lastMoveTs = 0;
document.addEventListener(
  'mousemove',
  (event) => {
    const now = performance.now();
    if (now - lastMoveTs < 60) {
      return;
    }
    lastMoveTs = now;
    const label = describeElement(event.target);
    currentAction = `Move (${Math.round(event.clientX)}, ${Math.round(event.clientY)})`;
    updateTooltip(event, label);
    sendLog({
      t: Date.now(),
      kind: 'move',
      el: label,
      x: Math.round(event.clientX),
      y: Math.round(event.clientY)
    });
  },
  { passive: true }
);

document.addEventListener(
  'mousedown',
  (event) => {
    const label = describeElement(event.target);
    currentAction = `Mouse down (${buttonName(event.button)})`;
    updateTooltip(event, label);
    sendLog({
      t: Date.now(),
      kind: 'mousedown',
      el: label,
      button: buttonName(event.button)
    });
  },
  true
);

document.addEventListener(
  'mouseup',
  (event) => {
    const label = describeElement(event.target);
    currentAction = `Mouse up (${buttonName(event.button)})`;
    updateTooltip(event, label);
    sendLog({
      t: Date.now(),
      kind: 'mouseup',
      el: label,
      button: buttonName(event.button)
    });
  },
  true
);

document.addEventListener(
  'click',
  (event) => {
    const label = describeElement(event.target);
    currentAction = `Click (${buttonName(event.button)})`;
    updateTooltip(event, label);
    sendLog({
      t: Date.now(),
      kind: 'click',
      el: label,
      button: buttonName(event.button)
    });
  },
  true
);

document.addEventListener(
  'dblclick',
  (event) => {
    const label = describeElement(event.target);
    currentAction = `Double click (${buttonName(event.button)})`;
    updateTooltip(event, label);
    sendLog({
      t: Date.now(),
      kind: 'dblclick',
      el: label,
      button: buttonName(event.button)
    });
  },
  true
);

document.addEventListener(
  'contextmenu',
  (event) => {
    const label = describeElement(event.target);
    currentAction = 'Context menu';
    updateTooltip(event, label);
    sendLog({
      t: Date.now(),
      kind: 'contextmenu',
      el: label
    });
  },
  true
);

document.addEventListener(
  'wheel',
  (event) => {
    const label = describeElement(event.target);
    currentAction = `Wheel (dx:${Math.round(event.deltaX)}, dy:${Math.round(event.deltaY)})`;
    updateTooltip(event, label);
    sendLog({
      t: Date.now(),
      kind: 'wheel',
      el: label,
      dx: Math.round(event.deltaX),
      dy: Math.round(event.deltaY)
    });
  },
  { passive: true }
);

document.addEventListener(
  'mouseleave',
  () => {
    hideTooltip();
    currentAction = '';
    lastPointerEvent = null;
    lastLabel = '';
  },
  { passive: true }
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TOGGLE_BORDERS') {
    bordersEnabled = Boolean(message.enabled);
    applyBorders();
    sendResponse?.({ acknowledged: true });
    sendLog({
      t: Date.now(),
      kind: 'toggle',
      enabled: bordersEnabled
    });
    return;
  }

  if (message?.type === 'QUERY_BORDERS') {
    sendResponse?.({ enabled: bordersEnabled });
  }
});
