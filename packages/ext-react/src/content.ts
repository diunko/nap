// Content script injected on github.com
// Handles link navigation messages from the side panel

console.log('[content] loaded on', window.location.href);

// Mark that content script loaded (testable)
document.body.dataset.napLoaded = 'true';

// Listen for navigation messages from side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[content] received message:', message.type);
  if (message.type === 'navigate' && message.url) {
    console.log('[content] navigating to', message.url);
    window.location.href = message.url;
    sendResponse({ ok: true });
  }
  return false;
});

// Inject a trigger button for Playwright tests.
// Clicking it sends a message to the service worker which opens the side panel.
// This satisfies Chrome's "user gesture" requirement for sidePanel.open().
const btn = document.createElement('button');
btn.id = 'nap-open-panel';
btn.style.cssText = 'position:fixed;bottom:0;right:0;z-index:999999;opacity:0.01;width:1px;height:1px;';
btn.addEventListener('click', () => {
  console.log('[content] trigger button clicked, sending open_side_panel');
  chrome.runtime.sendMessage({ type: 'open_side_panel' });
});
document.body.appendChild(btn);
console.log('[content] trigger button injected');
