const STYLE_ID = 'ld-style';
const TOOLTIP_ID = 'ld-tooltip';
const PHANTOM_ID = 'ld-phantom-cursor';

let bordersEnabled = false;
let lastPointerEvent = null;
let lastLabel = '';
let currentAction = '';
let pendingGuide = false;
let phantomFrame = null;
let phantomClickListener = null;

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
    (document.body || document.documentElement).appendChild(tooltip);
  }
  return tooltip;
}

function ensurePhantomCursor() {
  let phantom = document.getElementById(PHANTOM_ID);
  if (!phantom) {
    phantom = document.createElement('div');
    phantom.id = PHANTOM_ID;
    phantom.style.position = 'fixed';
    phantom.style.width = '16px';
    phantom.style.height = '16px';
    phantom.style.borderRadius = '50%';
    phantom.style.border = '2px solid rgba(255, 0, 0, 0.85)';
    phantom.style.background = 'rgba(255, 255, 255, 0.1)';
    phantom.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.6)';
    phantom.style.zIndex = '2147483647';
    phantom.style.pointerEvents = 'none';
    phantom.style.left = '0';
    phantom.style.top = '0';
    phantom.style.transform = 'translate(-9999px, -9999px)';
    phantom.style.transition = 'opacity 0.2s ease';
    phantom.style.opacity = '0';
    phantom.style.display = 'none';
    phantom.style.willChange = 'transform';
    (document.body || document.documentElement).appendChild(phantom);
  }
  return phantom;
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
  const descriptor = (tag + id + classPart).slice(0, 80);
  return descriptor || tag;
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

function isExtensionNode(node) {
  if (!node) {
    return false;
  }
  if (node.id === TOOLTIP_ID || node.id === PHANTOM_ID) {
    return true;
  }
  if (typeof node.closest === 'function') {
    return Boolean(node.closest(`#${TOOLTIP_ID}, #${PHANTOM_ID}`));
  }
  return false;
}

function sendLog(payload) {
  try {
    chrome.runtime.sendMessage({ type: 'DEBUG_LOG', payload }, () => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  } catch (error) {
    // Popup may be closed; logging remains best-effort.
  }
}

function clampPoint(point) {
  const padding = 8;
  const clampedX = Math.min(Math.max(point.x, padding), window.innerWidth - padding);
  const clampedY = Math.min(Math.max(point.y, padding), window.innerHeight - padding);
  return { x: clampedX, y: clampedY };
}

function updateTooltip(event, label) {
  const tooltip = ensureTooltip();
  lastPointerEvent = event;
  lastLabel = label || lastLabel || 'unknown element';
  const text = currentAction ? `${lastLabel}\nAction: ${currentAction}` : lastLabel;
  tooltip.textContent = text;
  tooltip.style.display = 'block';

  const offsetX = 18;
  const offsetY = 24;
  const point = clampPoint({ x: event.clientX + offsetX, y: event.clientY + offsetY });

  const tooltipRect = tooltip.getBoundingClientRect();
  let left = point.x;
  let top = point.y;

  if (left + tooltipRect.width > window.innerWidth) {
    left = Math.max(8, event.clientX - tooltipRect.width - offsetX);
  }
  if (top + tooltipRect.height > window.innerHeight) {
    top = Math.max(8, event.clientY - tooltipRect.height - offsetY);
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
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

function highlightElement(el) {
  if (!el) {
    return;
  }
  const previousShadow = el.style.boxShadow;
  const previousTransition = el.style.transition;
  el.dataset.ldGuideShadow = previousShadow || '';
  el.dataset.ldGuideTransition = previousTransition || '';
  el.style.transition = 'box-shadow 0.3s ease';
  el.style.boxShadow = '0 0 0 3px rgba(255, 0, 0, 0.7)';
  setTimeout(() => {
    if (!el.isConnected) {
      return;
    }
    const storedShadow = el.dataset.ldGuideShadow;
    const storedTransition = el.dataset.ldGuideTransition;
    if (storedShadow) {
      el.style.boxShadow = storedShadow;
    } else {
      el.style.removeProperty('box-shadow');
    }
    if (storedTransition) {
      el.style.transition = storedTransition;
    } else {
      el.style.removeProperty('transition');
    }
    delete el.dataset.ldGuideShadow;
    delete el.dataset.ldGuideTransition;
  }, 900);
}

function isVisibleRect(rect) {
  if (!rect) {
    return false;
  }
  if (rect.width < 2 && rect.height < 2) {
    return false;
  }
  if (rect.bottom < 0 || rect.right < 0) {
    return false;
  }
  if (rect.top > window.innerHeight || rect.left > window.innerWidth) {
    return false;
  }
  return true;
}

function collectFormControls() {
  const selector = 'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])';
  return Array.from(document.querySelectorAll(selector))
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => isVisibleRect(rect))
    .filter(({ el }) => {
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    })
    .map(({ el, rect }) => ({
      el,
      rect,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    }));
}

function findNearestFormControl(startPoint) {
  const candidates = collectFormControls();
  if (!candidates.length) {
    return null;
  }
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.centerX - startPoint.x;
    const dy = candidate.centerY - startPoint.y;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function hidePhantomCursor(immediate = false) {
  const phantom = document.getElementById(PHANTOM_ID);
  if (!phantom) {
    return;
  }
  if (phantomClickListener) {
    phantom.removeEventListener('click', phantomClickListener);
    phantomClickListener = null;
  }
  phantom.style.pointerEvents = 'none';
  phantom.style.cursor = 'default';
  phantom.style.opacity = '0';
  if (immediate) {
    phantom.style.display = 'none';
    phantom.style.transform = 'translate(-9999px, -9999px)';
    return;
  }
  setTimeout(() => {
    phantom.style.display = 'none';
    phantom.style.transform = 'translate(-9999px, -9999px)';
  }, 220);
}

function animatePhantom(startPoint, destinationPoint, targetEl) {
  const phantom = ensurePhantomCursor();
  hidePhantomCursor(true);

  const start = clampPoint(startPoint);
  const destination = clampPoint(destinationPoint);

  if (phantomFrame) {
    cancelAnimationFrame(phantomFrame);
    phantomFrame = null;
  }

  phantom.style.display = 'block';
  phantom.style.opacity = '1';
  phantom.style.pointerEvents = 'none';
  phantom.style.cursor = 'default';

  const duration = 1200;
  const startTime = performance.now();

  const step = (timestamp) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentX = start.x + (destination.x - start.x) * eased;
    const currentY = start.y + (destination.y - start.y) * eased;
    phantom.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;

    if (progress < 1) {
      phantomFrame = requestAnimationFrame(step);
    } else {
      phantomFrame = null;
      const syntheticEvent = {
        clientX: destination.x,
        clientY: destination.y,
        target: targetEl || document.body
      };
      const label = describeElement(targetEl);
      currentAction = 'Click phantom cursor to dismiss';
      updateTooltip(syntheticEvent, label);
      highlightElement(targetEl);
      if (targetEl && typeof targetEl.focus === 'function') {
        try {
          targetEl.focus({ preventScroll: true });
        } catch (error) {
          // Focusing may fail on non-focusable elements; ignore.
        }
      }
      phantom.style.pointerEvents = 'auto';
      phantom.style.cursor = 'pointer';
      phantomClickListener = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        hidePhantomCursor();
        currentAction = '';
        hideTooltip();
      };
      phantom.addEventListener('click', phantomClickListener, { once: true });
    }
  };

  phantomFrame = requestAnimationFrame(step);
}

function guideToNearestForm(originEvent, trigger = 'popup') {
  const hasOrigin = Boolean(originEvent && typeof originEvent.clientX === 'number');
  const startPoint = hasOrigin
    ? { x: originEvent.clientX, y: originEvent.clientY }
    : lastPointerEvent
      ? { x: lastPointerEvent.clientX, y: lastPointerEvent.clientY }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  let referenceTarget = hasOrigin ? originEvent.target : lastPointerEvent?.target;
  if (isExtensionNode(referenceTarget)) {
    const probe = document.elementFromPoint(startPoint.x, startPoint.y);
    referenceTarget = isExtensionNode(probe) ? document.body : probe;
  }
  if (!referenceTarget) {
    referenceTarget = document.elementFromPoint(startPoint.x, startPoint.y) || document.body;
  }

  const nearest = findNearestFormControl(startPoint);

  if (!nearest) {
    sendLog({
      t: Date.now(),
      kind: 'guide',
      el: referenceTarget ? describeElement(referenceTarget) : '',
      error: 'no-form',
      trigger
    });
    currentAction = '';
    return { ok: false, reason: 'no-form', trigger };
  }

  currentAction = 'Guiding to form…';
  const syntheticEvent = hasOrigin
    ? originEvent
    : { clientX: startPoint.x, clientY: startPoint.y, target: referenceTarget };
  updateTooltip(syntheticEvent, describeElement(referenceTarget));

  animatePhantom(startPoint, { x: nearest.centerX, y: nearest.centerY }, nearest.el);

  const targetLabel = describeElement(nearest.el);
  sendLog({
    t: Date.now(),
    kind: 'guide',
    el: targetLabel,
    trigger
  });

  return { ok: true, label: targetLabel, trigger };
}

applyBorders();
ensureTooltip();
ensurePhantomCursor();

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
  'mouseenter',
  (event) => {
    const label = describeElement(event.target);
    if (!currentAction) {
      currentAction = 'Hover';
    }
    updateTooltip(event, label);
  },
  true
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

    if (event.shiftKey && event.isTrusted && !isExtensionNode(event.target)) {
      pendingGuide = false;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      guideToNearestForm(event, 'shift-click');
      return;
    }

    if (pendingGuide && event.isTrusted) {
      pendingGuide = false;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      guideToNearestForm(event, 'popup-click');
    }
  },
  true
);

function attachStandardListener(type) {
  document.addEventListener(
    type,
    (event) => {
      const label = describeElement(event.target);
      currentAction = `${type === 'dblclick' ? 'Double click' : type === 'contextmenu' ? 'Context menu' : 'Wheel'}${
        type === 'wheel'
          ? ` (dx:${Math.round(event.deltaX)}, dy:${Math.round(event.deltaY)})`
          : type === 'dblclick'
          ? ` (${buttonName(event.button)})`
          : ''
      }`;
      updateTooltip(event, label);
      const payload = {
        t: Date.now(),
        kind: type,
        el: label
      };
      if (type === 'wheel') {
        payload.dx = Math.round(event.deltaX);
        payload.dy = Math.round(event.deltaY);
      } else if (type === 'dblclick') {
        payload.button = buttonName(event.button);
      }
      sendLog(payload);
    },
    type === 'wheel' ? { passive: true } : true
  );
}

attachStandardListener('dblclick');
attachStandardListener('contextmenu');
attachStandardListener('wheel');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TOGGLE_BORDERS') {
    bordersEnabled = Boolean(message.enabled);
    applyBorders();
    sendResponse?.({ acknowledged: true });
    sendLog({ t: Date.now(), kind: 'toggle', enabled: bordersEnabled });
    return;
  }

  if (message?.type === 'QUERY_BORDERS') {
    sendResponse?.({ enabled: bordersEnabled });
    return;
  }

  if (message?.type === 'GUIDE_TO_FORM') {
    if (message.trigger === 'click') {
      pendingGuide = true;
      currentAction = 'Click on the page to guide…';
      if (lastPointerEvent) {
        updateTooltip(lastPointerEvent, lastLabel || describeElement(lastPointerEvent.target));
      }
      sendResponse?.({ ok: true, awaitingClick: true });
      return;
    }

    const triggerLabel = message.trigger && typeof message.trigger === 'string' ? message.trigger : 'popup';
    const result = guideToNearestForm(undefined, triggerLabel);
    sendResponse?.(result);
  }
});
