// Content script injected on github.com
// Handles link navigation messages from the side panel

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'navigate') {
    // Navigate the main tab to the given URL
    window.location.href = message.url;
    sendResponse({ ok: true });
  }
  return false;
});
