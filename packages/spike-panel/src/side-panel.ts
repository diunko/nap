// Expose a probe function for Playwright — navigate via content script messaging
(window as any).__navigate = async (url: string) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'navigate', url });
  }
};

// Also try: directly update the tab URL (simpler, no content script needed)
(window as any).__navigateDirectly = async (url: string) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { url });
  }
};
