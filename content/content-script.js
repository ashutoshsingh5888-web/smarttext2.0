// Content script - detects shortcuts and expands text in real-time
import { processVariables } from '../utils/variables.js';
import { processFormatting } from '../utils/formatting.js';
import { matchesDomain } from '../utils/domain-matcher.js';

let isProcessing = false;
let settings = {};
let shortcuts = [];

// Load settings and shortcuts
async function loadData() {
  const [settingsRes, shortcutsRes] = await Promise.all([
    chrome.runtime.sendMessage({ action: 'getSettings' }),
    chrome.runtime.sendMessage({ action: 'getShortcuts' })
  ]);
  settings = settingsRes.settings;
  shortcuts = shortcutsRes.shortcuts;
}

loadData();
chrome.storage.onChanged.addListener(loadData);

// Main expansion logic
function handleInput(event) {
  if (isProcessing || !settings.enabled) return;
  
  const target = event.target;
  if (!isEditableElement(target)) return;
  
  // Skip password fields
  if (target.type === 'password') return;
  
  const value = target.value || target.textContent;
  const cursorPos = target.selectionStart || value.length;
  
  // Get last word before cursor
  const textBeforeCursor = value.substring(0, cursorPos);
  const words = textBeforeCursor.split(/\s+/);
  const lastWord = words[words.length - 1];
  
  if (!lastWord || lastWord.length < 1) return;
  
  // Find matching shortcut
  const match = findShortcut(lastWord);
  if (!match) return;
  
  // Check domain restriction
  if (match.restricted && !matchesDomain(match.domains, window.location.hostname)) {
    return;
  }
  
  expandShortcut(target, match, cursorPos);
}

function isEditableElement(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function findShortcut(trigger) {
  const searchKey = settings.caseSensitive ? trigger : trigger.toLowerCase();
  return shortcuts.find(s => {
    const key = settings.caseSensitive ? s.key : s.key.toLowerCase();
    return key === searchKey;
  });
}

function expandShortcut(element, shortcut, cursorPos) {
  isProcessing = true;
  
  // Process variables and formatting
  let expanded = processVariables(shortcut.text, settings);
  expanded = processFormatting(expanded, element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA');
  
  const value = element.value || element.textContent || '';
  const triggerStart = cursorPos - shortcut.key.length;
  const before = value.substring(0, triggerStart);
  const after = value.substring(cursorPos);
  
  // Handle cursor placeholder
  const cursorIndex = expanded.indexOf('{{cursor}}');
  expanded = expanded.replace('{{cursor}}', '');
  
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    // Plain text field
    element.value = before + expanded + after;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Set cursor position
    const newCursorPos = cursorIndex >= 0 
      ? triggerStart + cursorIndex 
      : triggerStart + expanded.length;
    element.setSelectionRange(newCursorPos, newCursorPos);
  } else {
    // ContentEditable - handle formatting
    const range = document.createRange();
    const sel = window.getSelection();
    
    // Create text node or formatted nodes
    if (expanded.includes('<')) {
      const temp = document.createElement('div');
      temp.innerHTML = expanded;
      element.innerHTML = before + temp.innerHTML + after;
    } else {
      element.textContent = before + expanded + after;
    }
    
    // Set cursor
    const textNode = findTextNode(element, triggerStart + (cursorIndex >= 0 ? cursorIndex : expanded.length));
    if (textNode) {
      range.setStart(textNode, textNode.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  
  // Visual feedback
  if (settings.showAnimation) {
    element.style.outline = '2px solid #22c55e';
    setTimeout(() => { element.style.outline = ''; }, 300);
  }
  
  setTimeout(() => { isProcessing = false; }, 150);
}

function findTextNode(element, targetOffset) {
  // Simplified cursor positioning helper
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node, total = 0;
  while ((node = walker.nextNode())) {
    if (total + node.length >= targetOffset) {
      return node;
    }
    total += node.length;
  }
  return element.firstChild;
}

// Event listeners with debounce
let debounceTimer;
document.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => handleInput(e), 120);
}, { capture: true });

// Handle trigger keys (Space, Tab, Enter)
document.addEventListener('keydown', (e) => {
  if ([' ', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
    setTimeout(() => handleInput(e), 50);
  }
}, { capture: true });

// IME composition support
let isComposing = false;
document.addEventListener('compositionstart', () => isComposing = true);
document.addEventListener('compositionend', (e) => {
  isComposing = false;
  setTimeout(() => handleInput(e), 100);
});

// Overlay toggle command
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'toggleOverlay') {
    toggleOverlay();
  }
});

function toggleOverlay() {
  const existing = document.getElementById('smarttext-overlay');
  if (existing) { existing.remove(); return; }
  
  const overlay = document.createElement('div');
  overlay.id = 'smarttext-overlay';
  overlay.innerHTML = `
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:500px;max-height:400px;background:#1f2937;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);z-index:999999;overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:16px;border-bottom:1px solid #374151;display:flex;justify-content:space-between;align-items:center;">
        <strong style="color:#fff">SmartText Shortcuts</strong>
        <button id="st-close" style="background:none;border:none;color:#9ca3af;font-size:20px;cursor:pointer">&times;</button>
      </div>
      <input type="text" id="st-search" placeholder="Search shortcuts..." style="padding:12px 16px;border:none;border-bottom:1px solid #374151;background:#111827;color:#fff;outline:none">
      <div id="st-list" style="flex:1;overflow-y:auto;padding:8px"></div>
      <div style="padding:8px 16px;font-size:11px;color:#6b7280;border-top:1px solid #374151">Press ESC to close • Alt+Shift+L to toggle</div>
    </div>
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999998" id="st-backdrop"></div>
  `;
  document.body.appendChild(overlay);
  
  // Populate list
  const list = overlay.querySelector('#st-list');
  const currentDomain = window.location.hostname;
  const filtered = shortcuts.filter(s => !s.restricted || matchesDomain(s.domains, currentDomain));
  
  function render(items) {
    list.innerHTML = items.map(s => `
      <div style="padding:10px 12px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;${s.restricted ? 'opacity:0.7' : ''}">
        <code style="background:#374151;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:12px">${escapeHtml(s.key)}</code>
        <span style="color:#d1d5db;font-size:13px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.text.substring(0, 50))}${s.text.length > 50 ? '...' : ''}</span>
        ${s.restricted ? '<span title="Domain restricted">🔒</span>' : ''}
      </div>
    `).join('') || '<div style="padding:20px;text-align:center;color:#6b7280">No shortcuts found</div>';
  }
  
  render(filtered);
  
  // Search filter
  overlay.querySelector('#st-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const results = filtered.filter(s => s.key.toLowerCase().includes(q) || s.text.toLowerCase().includes(q));
    render(results);
  });
  
  // Close handlers
  const close = () => overlay.remove();
  overlay.querySelector('#st-close').onclick = close;
  overlay.querySelector('#st-backdrop').onclick = close;
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
