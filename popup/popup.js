// Popup UI logic
document.addEventListener('DOMContentLoaded', async () => {
  let shortcuts = [];
  let editingId = null;

  // Load data
  async function refresh() {
    const [res, stats] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getShortcuts' }),
      chrome.runtime.sendMessage({ action: 'getStats' })
    ]);
    shortcuts = res.shortcuts || [];
    renderList();
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-today').textContent = stats.createdToday;
    document.getElementById('stat-chars').textContent = stats.totalChars.toLocaleString();
  }

  // Render shortcuts list
  function renderList(filter = '') {
    const list = document.getElementById('shortcuts-list');
    const filtered = shortcuts.filter(s => 
      s.key.toLowerCase().includes(filter.toLowerCase()) || 
      s.text.toLowerCase().includes(filter.toLowerCase())
    );
    
    if (filtered.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af">No shortcuts yet. Click "+ Add Shortcut" to create one!</div>';
      return;
    }
    
    list.innerHTML = filtered.map(s => `
      <div class="shortcut-item" data-id="${s.id}">
        <code>${escapeHtml(s.key)}</code>
        <span class="text" title="${escapeHtml(s.text)}">${escapeHtml(s.text.substring(0, 40))}${s.text.length > 40 ? '...' : ''}</span>
        <div class="actions">
          <button class="edit-btn" title="Edit">✏️</button>
          <button class="delete-btn" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');
    
    // Attach event listeners
    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = e.target.closest('.shortcut-item').dataset.id;
        editShortcut(id);
      };
    });
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = e.target.closest('.shortcut-item').dataset.id;
        if (confirm('Delete this shortcut?')) {
          chrome.runtime.sendMessage({ action: 'deleteShortcut', id }, refresh);
        }
      };
    });
  }

  // Show form
  document.getElementById('add-btn').onclick = () => {
    editingId = null;
    document.getElementById('edit-id').value = '';
    document.getElementById('key-input').value = '';
    document.getElementById('text-input').value = '';
    document.getElementById('restricted-check').checked = false;
    document.getElementById('domains-input').classList.add('hidden');
    document.getElementById('shortcut-form').classList.remove('hidden');
    document.getElementById('key-input').focus();
  };

  // Save shortcut
  document.getElementById('save-btn').onclick = async () => {
    const key = document.getElementById('key-input').value.trim();
    const text = document.getElementById('text-input').value;
    const restricted = document.getElementById('restricted-check').checked;
    const domains = document.getElementById('domains-input').value.split(',').map(d => d.trim()).filter(Boolean);
    
    if (!key || !text) { showToast('Please fill in all fields', true); return; }
    if (key.length > 20) { showToast('Key must be 20 characters or less', true); return; }
    
    await chrome.runtime.sendMessage({
      action: 'saveShortcut',
      shortcut: {
        id: editingId,
        key,
        text,
        restricted,
        domains
      }
    });
    
    document.getElementById('shortcut-form').classList.add('hidden');
    refresh();
    showToast('Shortcut saved!');
  };

  // Domain restriction toggle
  document.getElementById('restricted-check').onchange = (e) => {
    document.getElementById('domains-input').classList.toggle('hidden', !e.target.checked);
  };

  // Format toolbar
  document.querySelectorAll('.format-toolbar button').forEach(btn => {
    btn.onclick = () => {
      const input = document.getElementById('text-input');
      const format = btn.dataset.format;
      const variable = btn.dataset.var;
      const insert = format || variable;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const selected = input.value.substring(start, end);
      
      let replacement;
      if (format && format.includes('text')) {
        replacement = format.replace('text', selected || 'text');
      } else {
        replacement = insert + (selected ? selected : '');
      }
      
      input.value = input.value.substring(0, start) + replacement + input.value.substring(end);
      input.focus();
    };
  });

  // Search
  document.getElementById('search').oninput = (e) => renderList(e.target.value);

  // Settings link
  document.getElementById('settings-link').onclick = (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  };

  // Overlay link
  document.getElementById('overlay-link').onclick = (e) => {
    e.preventDefault();
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
      window.close();
    });
  };

  // Helper: escape HTML
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Helper: toast notification
  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Initialize
  refresh();
});
