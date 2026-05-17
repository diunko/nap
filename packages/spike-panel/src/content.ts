// Mark that content script loaded
document.body.dataset.napLoaded = 'true';

// Listen for navigation messages from side panel
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'navigate' && msg.url) {
    window.location.href = msg.url;
  }
});

// Inject a trigger button for Playwright tests.
// Clicking it sends a message to the service worker which opens the side panel.
// This satisfies Chrome's "user gesture" requirement for sidePanel.open().
const btn = document.createElement('button');
btn.id = 'nap-open-panel';
btn.style.cssText = 'position:fixed;bottom:0;right:0;z-index:999999;opacity:0.01;width:1px;height:1px;';
btn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open_side_panel' });
});
document.body.appendChild(btn);
