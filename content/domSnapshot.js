/**
 * @typedef {Object} DomNodeSummary
 * @property {string} selector
 * @property {string} tag
 * @property {string} text
 * @property {string} role
 * @property {string} ariaLabel
 * @property {boolean} clickable
 * @property {{top:number,left:number,width:number,height:number}} bbox
 */

const SNAPSHOT_MAX_TEXT = 160;
const SPACE_REGEX = /\s+/g;

function isElementVisible(el, rect) {
  if (!rect || rect.width === 0 || rect.height === 0) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
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

function isLikelyClickable(el) {
  const tag = el.tagName?.toLowerCase();
  if (!tag) {
    return false;
  }
  if (['button', 'a', 'input', 'select', 'textarea', 'label'].includes(tag)) {
    return true;
  }
  const role = el.getAttribute?.('role');
  if (role && ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'].includes(role)) {
    return true;
  }
  const tabindex = el.getAttribute?.('tabindex');
  if (tabindex === null || tabindex === undefined || tabindex === '') {
    return false;
  }
  const numeric = Number(tabindex);
  return Number.isFinite(numeric) && numeric >= 0;
}

function buildUniqueSelector(el) {
  if (!el || !el.tagName) {
    return '';
  }
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let selector = node.tagName.toLowerCase();
    if (node.id) {
      selector += `#${CSS.escape(node.id)}`;
      parts.unshift(selector);
      break;
    }
    const siblings = Array.from(node.parentNode?.children || []);
    const sameTagSiblings = siblings.filter((sib) => sib.tagName === node.tagName);
    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(node) + 1;
      selector += `:nth-of-type(${index})`;
    }
    parts.unshift(selector);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function summarizeText(el) {
  const text = el.innerText || el.textContent || '';
  return text.trim().replace(SPACE_REGEX, ' ').slice(0, SNAPSHOT_MAX_TEXT);
}

function summarizeAria(el) {
  const role = el.getAttribute?.('role') || '';
  const ariaLabel = el.getAttribute?.('aria-label') || '';
  if (ariaLabel) {
    return { role, ariaLabel };
  }
  const labelledBy = el.getAttribute?.('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy.trim());
    return { role, ariaLabel: labelEl ? summarizeText(labelEl) : '' };
  }
  return { role, ariaLabel: '' };
}

function shouldSkipForSnapshot(el, overlayIdSet, skipSelectors) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) {
    return true;
  }
  if (overlayIdSet.size && overlayIdSet.has(el.id)) {
    return true;
  }
  if (skipSelectors.length && el.closest) {
    try {
      if (el.closest(skipSelectors.join(', '))) {
        return true;
      }
    } catch (error) {
      // Invalid selector – ignore.
    }
  }
  return false;
}

/**
 * Captures a summarized view of the DOM for later retrieval/AI processing.
 * @param {{root?: Element, overlayIds?: string[], skipSelectors?: string[]}} [options]
 * @returns {DomNodeSummary[]}
 */
export function snapshotDomNodes(options = {}) {
  const {
    root = document.body || document.documentElement,
    overlayIds = [],
    skipSelectors = []
  } = options;

  if (!root) {
    return [];
  }

  const overlayIdSet = new Set(overlayIds);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      return shouldSkipForSnapshot(node, overlayIdSet, skipSelectors)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });

  /** @type {DomNodeSummary[]} */
  const results = [];
  let current = walker.nextNode();
  while (current) {
    const el = /** @type {HTMLElement} */ (current);
    const rect = el.getBoundingClientRect();
    if (!isElementVisible(el, rect)) {
      current = walker.nextNode();
      continue;
    }
    const selector = buildUniqueSelector(el);
    if (!selector) {
      current = walker.nextNode();
      continue;
    }
    const text = summarizeText(el);
    if (!text && !isLikelyClickable(el)) {
      current = walker.nextNode();
      continue;
    }
    const { role, ariaLabel } = summarizeAria(el);
    results.push({
      selector,
      tag: el.tagName.toLowerCase(),
      text,
      role,
      ariaLabel,
      clickable: isLikelyClickable(el),
      bbox: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    });
    current = walker.nextNode();
  }
  return results;
}
