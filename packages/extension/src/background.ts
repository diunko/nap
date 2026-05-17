// Register side panel — opens when extension icon is clicked on github.com
// Guard: chrome.sidePanel may not exist in all Chromium builds (e.g. Playwright's)
console.log('[background] starting');
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log('[background] sidePanel registered');
} else {
  console.log('[background] chrome.sidePanel not available');
}
