// Content script injected on github.com
// Handles: link navigation (from side panel), trigger button (Playwright)

console.log('[content] loaded on', window.location.href);

// Mark that content script loaded (testable)
document.body.dataset.napLoaded = 'true';

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
