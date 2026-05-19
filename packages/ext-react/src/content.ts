// Content script injected on github.com
// Handles: link navigation, URL hash parsing, config messaging to side panel

import {
  parseNapHash,
  parsePageUrl,
  deriveStateKey,
  buildNapConfig,
  type NapConfig,
} from './url-config';

console.log('[content] loaded on', window.location.href);

// Mark that content script loaded (testable)
document.body.dataset.napLoaded = 'true';

// ── Hash parsing + config ──

let currentConfig: { key: string; config: NapConfig } | null = null;

function parseAndSendConfig(): void {
  const hash = window.location.hash;
  const hashConfig = parseNapHash(hash);
  if (!hashConfig) {
    console.log('[content] no nap hash found');
    currentConfig = null;
    return;
  }

  const page = parsePageUrl(window.location.pathname);
  console.log('[content] parsed hash:', JSON.stringify(hashConfig));

  // Try to read the PR head branch from the DOM (.head-ref element)
  let mainBranch = 'main';
  if (page.prNum > 0) {
    const headRef = document.querySelector('.head-ref a, .head-ref');
    if (headRef?.textContent) {
      mainBranch = headRef.textContent.trim();
      console.log(`[content] PR head branch from DOM: ${mainBranch}`);
    }
  }

  const key = deriveStateKey(page, hashConfig);
  const config = buildNapConfig(page, hashConfig, mainBranch);

  console.log(`[content] derived state-key: ${key}`);

  currentConfig = { key, config };

  // Send to side panel (if open, it receives immediately)
  try {
    chrome.runtime.sendMessage({ type: 'nap-config', key, config });
  } catch {
    // Panel not open yet — that's fine, it will request config on mount
  }
  console.log('[content] sending nap-config message');
}

// Parse on load
parseAndSendConfig();

// Re-parse on hash changes (GitHub SPA navigation)
window.addEventListener('hashchange', () => {
  console.log('[content] hashchange detected');
  parseAndSendConfig();
});

// Also watch for GitHub SPA navigation that doesn't fire hashchange
// (pushState/replaceState don't trigger hashchange, but the URL may change)
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    console.log('[content] URL changed (SPA navigation)');
    parseAndSendConfig();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// ── Message handling ──

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[content] received message:', message.type);

  // Navigate the GitHub tab (from side panel link clicks)
  if (message.type === 'navigate' && message.url) {
    console.log('[content] navigating to', message.url);
    window.location.href = message.url;
    sendResponse({ ok: true });
    return false;
  }

  // Side panel requesting config on mount
  if (message.type === 'get-nap-config') {
    console.log('[content] responding with config:', currentConfig ? 'present' : 'null');
    sendResponse(currentConfig);
    return false;
  }

  return false;
});

// ── Trigger button (Playwright tests) ──

const btn = document.createElement('button');
btn.id = 'nap-open-panel';
btn.style.cssText = 'position:fixed;bottom:0;right:0;z-index:999999;opacity:0.01;width:1px;height:1px;';
btn.addEventListener('click', () => {
  console.log('[content] trigger button clicked, sending open_side_panel');
  chrome.runtime.sendMessage({ type: 'open_side_panel' });
});
document.body.appendChild(btn);
console.log('[content] trigger button injected');
