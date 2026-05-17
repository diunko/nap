// Register side panel — opens when extension icon is clicked on github.com
// Guard: chrome.sidePanel may not exist in all Chromium builds (e.g. Playwright's)
console.log('[background] starting');
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log('[background] sidePanel behavior set');
} else {
  console.log('[background] chrome.sidePanel not available');
}

// Listen for open_side_panel message from content script.
// This is the tested path: content script click → message → sidePanel.open().
// Chrome traces the user gesture through the message chain, so this satisfies
// the "must be called in response to a user gesture" requirement.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'open_side_panel' && sender.tab?.id) {
    console.log('[background] opening side panel for tab', sender.tab.id);
    if (chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: sender.tab.id });
    }
  }
});
