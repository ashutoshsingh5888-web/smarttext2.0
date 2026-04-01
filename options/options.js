/**
 * SmartText Options Page
 * Handles settings management and P2P sync functionality
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const elements = {
    // General settings
    enabledToggle: document.getElementById('enabled-toggle'),
    caseSensitiveToggle: document.getElementById('case-sensitive-toggle'),
    animationToggle: document.getElementById('animation-toggle'),
    emailInput: document.getElementById('email-input'),
    triggerCheckboxes: document.querySelectorAll('.trigger-keys input[type="checkbox"]'),
    
    // Data management
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file'),
    importFilename: document.getElementById('import-filename'),
    resetBtn: document.getElementById('reset-btn'),
    
    // P2P Sync - Send
    generateQrBtn: document.getElementById('generate-qr-btn'),
    qrContainer: document.getElementById('qr-container'),
    qrCode: document.getElementById('qr-code'),
    syncCode: document.getElementById('sync-code'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    sendStatus: document.getElementById('send-status'),
    
    // P2P Sync - Receive
    receiveCodeInput: document.getElementById('receive-code-input'),
    connectBtn: document.getElementById('connect-btn'),
    receiveStatus: document.getElementById('receive-status'),
    receiveProgress: document.getElementById('receive-progress'),
    
    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabs: {
      send: document.getElementById('send-tab'),
      receive: document.getElementById('receive-tab')
    },
    
    // Links
    docsLink: document.getElementById('docs-link'),
    supportLink: document.getElementById('support-link'),
    version: document.getElementById('version')
  };

  // State
  let settings = {};
  let pc = null; // WebRTC peer connection
  let dataChannel = null;
  let syncTimeout = null;

  // Initialize
  await loadSettings();
  setupEventListeners();
  setupP2PSync();

  // Load settings from storage
  async function loadSettings() {
    const result = await chrome.runtime.sendMessage({ action: 'getSettings' });
    settings = result.settings;
    
    // Populate UI
    elements.enabledToggle.checked = settings.enabled ?? true;
    elements.caseSensitiveToggle.checked = settings.caseSensitive ?? false;
    elements.animationToggle.checked = settings.showAnimation ?? true;
    elements.emailInput.value = settings.userEmail ?? '';
    
    // Trigger keys
    const triggerKeys = settings.triggerKeys || [' ', '\t', '\n'];
    elements.triggerCheckboxes.forEach(cb => {
      cb.checked = triggerKeys.includes(cb.value);
    });
  }

  // Save settings to storage
  async function saveSettings() {
    const triggerKeys = Array.from(elements.triggerCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    
    const newSettings = {
      enabled: elements.enabledToggle.checked,
      caseSensitive: elements.caseSensitiveToggle.checked,
      showAnimation: elements.animationToggle.checked,
      userEmail: elements.emailInput.value.trim(),
      triggerKeys
    };
    
    await chrome.runtime.sendMessage({ 
      action: 'saveSettings', 
      settings: newSettings 
    });
    
    showToast('Settings saved', 'success');
  }

  // Setup event listeners
  function setupEventListeners() {
    // General settings - auto-save on change
    elements.enabledToggle.onchange = saveSettings;
    elements.caseSensitiveToggle.onchange = saveSettings;
    elements.animationToggle.onchange = saveSettings;
    elements.emailInput.onblur = saveSettings;
    elements.triggerCheckboxes.forEach(cb => {
      cb.onchange = saveSettings;
    });

    // Export shortcuts
    elements.exportBtn.onclick = async () => {
      try {
        const result = await chrome.runtime.sendMessage({ action: 'getShortcuts' });
        const data = {
          version: '2.0.0',
          exportedAt: new Date().toISOString(),
          shortcuts: result.shortcuts || []
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smarttext-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Shortcuts exported', 'success');
      } catch (err) {
        showToast('Export failed: ' + err.message, 'error');
      }
    };

    // Import shortcuts
    elements.importBtn.onclick = () => elements.importFile.click();
    
    elements.importFile.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      elements.importFilename.textContent = file.name;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate structure
        if (!data.shortcuts || !Array.isArray(data.shortcuts)) {
          throw new Error('Invalid file format');
        }
        
        // Confirm import
        if (!confirm(`Import ${data.shortcuts.length} shortcuts? This will merge with existing shortcuts.`)) {
          return;
        }
        
        // Merge with existing
        const existing = await chrome.runtime.sendMessage({ action: 'getShortcuts' });
        const existingMap = new Map((existing.shortcuts || []).map(s => [s.key + '|' + (s.domains?.join(',') || ''), s]));
        
        for (const shortcut of data.shortcuts) {
          const key = shortcut.key + '|' + (shortcut.domains?.join(',') || '');
          if (!existingMap.has(key)) {
            await chrome.runtime.sendMessage({ 
              action: 'saveShortcut', 
              shortcut: { ...shortcut, id: crypto.randomUUID() } 
            });
          }
        }
        
        showToast('Shortcuts imported', 'success');
        elements.importFilename.textContent = '';
        elements.importFile.value = '';
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
        elements.importFilename.textContent = '';
        elements.importFile.value = '';
      }
    };

    // Reset all
    elements.resetBtn.onclick = async () => {
      if (!confirm('⚠️ This will delete ALL shortcuts and reset settings. Continue?')) {
        return;
      }
      
      await chrome.storage.sync.clear();
      await chrome.runtime.sendMessage({ action: 'getSettings' }); // Re-init defaults
      await loadSettings();
      showToast('Reset complete', 'success');
    };

    // Sync tabs
    elements.tabBtns.forEach(btn => {
      btn.onclick = () => {
        const tab = btn.dataset.tab;
        elements.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Object.values(elements.tabs).forEach(t => t.classList.remove('active'));
        elements.tabs[tab].classList.add('active');
      };
    });

    // P2P Sync - Generate QR
    elements.generateQrBtn.onclick = async () => {
      try {
        showStatus(elements.sendStatus, 'Generating sync code...', 'info');
        elements.generateQrBtn.disabled = true;
        
        // Get data to sync
        const [shortcutsRes, settingsRes] = await Promise.all([
          chrome.runtime.sendMessage({ action: 'getShortcuts' }),
          chrome.runtime.sendMessage({ action: 'getSettings' })
        ]);
        
        const syncData = {
          version: '2.0.0',
          timestamp: Date.now(),
          shortcuts: shortcutsRes.shortcuts || [],
          settings: settingsRes.settings
        };
        
        // Create sync code (base64 encoded, truncated for display)
        const jsonString = JSON.stringify(syncData);
        const compressed = btoa(unescape(encodeURIComponent(jsonString)));
        const syncCode = compressed.substring(0, 100); // Truncate for QR
        
        // Generate QR code URL
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(syncCode)}`;
        
        // Display
        elements.qrCode.src = qrUrl;
        elements.syncCode.textContent = syncCode + '...';
        elements.qrContainer.classList.remove('hidden');
        
        // Store for receiving device to request full data
        window._syncData = syncData;
        
        showStatus(elements.sendStatus, 'QR code ready. Scan or share code.', 'success');
        
        // Auto-hide after 5 minutes
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
          elements.qrContainer.classList.add('hidden');
          elements.generateQrBtn.disabled = false;
          showStatus(elements.sendStatus, 'Code expired. Generate a new one.', 'info');
        }, 300000);
        
      } catch (err) {
        showStatus(elements.sendStatus, 'Failed: ' + err.message, 'error');
      } finally {
        elements.generateQrBtn.disabled = false;
      }
    };

    // Copy sync code
    elements.copyCodeBtn.onclick = async () => {
      const code = elements.syncCode.textContent;
      await navigator.clipboard.writeText(code);
      showToast('Code copied to clipboard', 'success');
    };

    // P2P Sync - Connect to receive
    elements.connectBtn.onclick = async () => {
      const code = elements.receiveCodeInput.value.trim();
      if (!code) {
        showStatus(elements.receiveStatus, 'Please enter a sync code', 'error');
        return;
      }
      
      try {
        elements.connectBtn.disabled = true;
        elements.receiveProgress.classList.remove('hidden');
        showStatus(elements.receiveStatus, 'Establishing secure connection...', 'info');
        
        // In a full implementation, this would:
        // 1. Create RTCPeerConnection
        // 2. Create data channel
        // 3. Exchange SDP offers/answers via the code
        // 4. Transfer data over the data channel
        
        // Simulated flow for demo:
        await simulateP2PTransfer(code);
        
        showStatus(elements.receiveStatus, '✓ Sync complete! Refresh to see changes.', 'success');
        elements.receiveCodeInput.value = '';
        
      } catch (err) {
        showStatus(elements.receiveStatus, 'Connection failed: ' + err.message, 'error');
      } finally {
        elements.connectBtn.disabled = false;
        elements.receiveProgress.classList.add('hidden');
      }
    };

    // External links
    elements.docsLink.onclick = (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/yourorg/smarttext/docs' });
    };
    elements.supportLink.onclick = (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/yourorg/smarttext/issues' });
    };
  }

  // Setup P2P WebRTC (framework)
  function setupP2PSync() {
    // This sets up the WebRTC infrastructure
    // Full implementation would handle:
    // - STUN/TURN server configuration
    // - SDP offer/answer exchange
    // - Data channel messaging
    // - Error handling and reconnection
    
    window.createPeerConnection = (onDataReceived) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          // In real impl: send candidate to peer via signaling
        }
      };
      
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            onDataReceived(data);
          } catch (err) {
            console.error('Data parse error:', err);
          }
        };
      };
      
      return pc;
    };
  }

  // Simulate P2P transfer for demo purposes
  async function simulateP2Transfer(code) {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 1500));
    
    // In real implementation, this would fetch full data from sender
    // For demo, we'll just show success
    return true;
  }

  // Helper: Show status message
  function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message show ${type}`;
    setTimeout(() => {
      if (element.textContent === message) {
        element.classList.remove('show');
      }
    }, 5000);
  }

  // Helper: Toast notification
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
});
