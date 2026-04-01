// Background service worker - handles messages between popup, content script, and storage

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize default shortcuts
    const defaults = [
      {
        id: crypto.randomUUID(),
        key: 'sig',
        text: 'Best regards,\n{{date}}\n{{email}}',
        createdAt: new Date().toISOString(),
        domains: [],
        restricted: false
      }
    ];
    await chrome.storage.sync.set({ shortcuts: defaults, settings: getDefaultSettings() });
    chrome.tabs.create({ url: 'onboarding/onboarding.html' });
  }
});

function getDefaultSettings() {
  return {
    enabled: true,
    caseSensitive: false,
    showAnimation: true,
    triggerKeys: [' ', '\t', '\n'],
    userEmail: ''
  };
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getShortcuts':
      chrome.storage.sync.get(['shortcuts'], (result) => {
        sendResponse({ shortcuts: result.shortcuts || [] });
      });
      return true;
    case 'saveShortcut':
      chrome.storage.sync.get(['shortcuts'], async (result) => {
        const shortcuts = result.shortcuts || [];
        const exists = shortcuts.find(s => s.key === request.shortcut.key && s.id !== request.shortcut.id);
        if (exists) {
          sendResponse({ error: 'Shortcut key already exists' });
          return;
        }
        const updated = request.shortcut.id 
          ? shortcuts.map(s => s.id === request.shortcut.id ? request.shortcut : s)
          : [...shortcuts, { ...request.shortcut, id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
        await chrome.storage.sync.set({ shortcuts: updated });
        sendResponse({ success: true });
      });
      return true;
    case 'deleteShortcut':
      chrome.storage.sync.get(['shortcuts'], async (result) => {
        const updated = (result.shortcuts || []).filter(s => s.id !== request.id);
        await chrome.storage.sync.set({ shortcuts: updated });
        sendResponse({ success: true });
      });
      return true;
    case 'getSettings':
      chrome.storage.sync.get(['settings'], (result) => {
        sendResponse({ settings: { ...getDefaultSettings(), ...result.settings } });
      });
      return true;
    case 'saveSettings':
      chrome.storage.sync.set({ settings: request.settings });
      sendResponse({ success: true });
      return true;
    case 'getStats':
      chrome.storage.sync.get(['shortcuts'], (result) => {
        const shortcuts = result.shortcuts || [];
        const today = new Date().toDateString();
        const createdToday = shortcuts.filter(s => new Date(s.createdAt).toDateString() === today).length;
        const totalChars = shortcuts.reduce((sum, s) => sum + s.text.length, 0);
        sendResponse({ total: shortcuts.length, createdToday, totalChars });
      });
      return true;
  }
});
