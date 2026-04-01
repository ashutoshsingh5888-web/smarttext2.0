/**
 * SmartText Expansion Engine
 * Core logic for detecting and expanding text shortcuts
 * 
 * Features:
 * - Real-time shortcut detection with debounce
 * - Framework-compatible event handling (React/Vue/Angular)
 * - IME composition support
 * - Cursor position management
 * - Visual feedback animations
 */

export class ExpansionEngine {
  constructor(options = {}) {
    this.settings = options.settings || {};
    this.shortcuts = options.shortcuts || [];
    this.isProcessing = false;
    this.debounceTimer = null;
    this.debounceDelay = options.debounceDelay || 120;
    
    // Bind methods
    this.handleInput = this.handleInput.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  /**
   * Initialize event listeners on the document
   */
  init() {
    // Primary input handler with capture phase for framework compatibility
    document.addEventListener('input', this.handleInput, { capture: true });
    
    // Trigger key handler for Space/Tab/Enter
    document.addEventListener('keydown', this.handleKeydown, { capture: true });
    
    // IME composition handling for international keyboards
    this.setupIMEHandlers();
    
    // Listen for settings/shortcuts updates from background
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.shortcuts?.newValue) {
        this.shortcuts = changes.shortcuts.newValue;
      }
      if (changes.settings?.newValue) {
        this.settings = changes.settings.newValue;
      }
    });
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    document.removeEventListener('input', this.handleInput, { capture: true });
    document.removeEventListener('keydown', this.handleKeydown, { capture: true });
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  /**
   * Setup IME (Input Method Editor) composition handlers
   * For languages like Chinese, Japanese, Korean
   */
  setupIMEHandlers() {
    let isComposing = false;
    
    document.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    
    document.addEventListener('compositionend', (event) => {
      isComposing = false;
      // Delay to let the composed text settle
      setTimeout(() => this.handleInput(event), 100);
    });
    
    // Prevent expansion during composition
    this.isComposing = () => isComposing;
  }

  /**
   * Debounced input handler
   */
  handleInput(event) {
    if (this.isProcessing || !this.settings.enabled || this.isComposing?.()) return;
    
    const target = event.target;
    if (!this.isEditableElement(target)) return;
    if (target.type === 'password') return; // Never expand in password fields
    
    // Debounce to avoid excessive processing
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.processExpansion(target);
    }, this.debounceDelay);
  }

  /**
   * Handle trigger keys (Space, Tab, Enter)
   */
  handleKeydown(event) {
    if (!this.settings.enabled || this.isProcessing) return;
    
    const triggerKeys = this.settings.triggerKeys || [' ', 'Tab', 'Enter'];
    if (!triggerKeys.includes(event.key)) return;
    
    // Allow modifier keys to bypass expansion
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    
    const target = event.target;
    if (!this.isEditableElement(target) || target.type === 'password') return;
    
    // Small delay to let the key character be inserted first
    setTimeout(() => this.processExpansion(target), 50);
  }

  /**
   * Check if element is editable
   */
  isEditableElement(el) {
    if (!el) return false;
    return el.tagName === 'INPUT' || 
           el.tagName === 'TEXTAREA' || 
           el.isContentEditable === true;
  }

  /**
   * Main expansion processing logic
   */
  processExpansion(element) {
    if (this.isProcessing) return;
    
    const { value, cursorPos } = this.getElementState(element);
    const textBeforeCursor = value.substring(0, cursorPos);
    
    // Extract the last "word" (trigger candidate)
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (!lastWord || lastWord.length < 1) return;
    
    // Find matching shortcut
    const shortcut = this.findMatchingShortcut(lastWord);
    if (!shortcut) return;
    
    // Check domain restrictions
    if (shortcut.restricted && !this.matchesCurrentDomain(shortcut.domains)) {
      return;
    }
    
    // Perform expansion
    this.expand(element, shortcut, cursorPos);
  }

  /**
   * Find a shortcut matching the trigger text
   */
  findMatchingShortcut(trigger) {
    const compareKey = (key) => {
      if (this.settings.caseSensitive) {
        return key === trigger;
      }
      return key.toLowerCase() === trigger.toLowerCase();
    };
    
    return this.shortcuts.find(s => compareKey(s.key));
  }

  /**
   * Check if current domain matches allowed domains
   */
  matchesCurrentDomain(allowedDomains) {
    if (!allowedDomains || allowedDomains.length === 0) return true;
    
    const currentDomain = window.location.hostname;
    return allowedDomains.some(allowed => {
      if (currentDomain === allowed) return true;
      if (currentDomain.endsWith('.' + allowed)) return true;
      return false;
    });
  }

  /**
   * Get current value and cursor position from element
   */
  getElementState(element) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return {
        value: element.value,
        cursorPos: element.selectionStart ?? element.value.length
      };
    } else if (element.isContentEditable) {
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return { value: element.textContent || '', cursorPos: 0 };
      
      const range = sel.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      
      return {
        value: element.textContent || '',
        cursorPos: preCaretRange.toString().length
      };
    }
    return { value: '', cursorPos: 0 };
  }

  /**
   * Execute the text expansion
   */
  expand(element, shortcut, cursorPos) {
    this.isProcessing = true;
    
    // Process variables and formatting
    let expanded = this.processContent(shortcut.text);
    
    // Get element state
    const { value } = this.getElementState(element);
    const triggerStart = cursorPos - shortcut.key.length;
    const before = value.substring(0, triggerStart);
    const after = value.substring(cursorPos);
    
    // Handle cursor placeholder
    const cursorIndex = expanded.indexOf('{{cursor}}');
    expanded = expanded.replace('{{cursor}}', '');
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      // Plain text field expansion
      this.expandPlainText(element, before, expanded, after, cursorIndex, triggerStart);
    } else if (element.isContentEditable) {
      // Rich text / contentEditable expansion
      this.expandRichText(element, before, expanded, after, cursorIndex, triggerStart);
    }
    
    // Visual feedback
    if (this.settings.showAnimation) {
      this.showExpansionFeedback(element);
    }
    
    // Reset processing flag after brief delay
    setTimeout(() => { this.isProcessing = false; }, 150);
  }

  /**
   * Process variables and formatting in expansion text
   */
  processContent(text) {
    // Process variables first (before formatting)
    text = this.processVariables(text);
    
    // Then apply formatting
    text = this.processFormatting(text);
    
    return text;
  }

  /**
   * Replace variable placeholders with dynamic values
   */
  processVariables(text) {
    const now = new Date();
    
    return text
      .replace(/\{\{date\}\}/g, now.toLocaleDateString())
      .replace(/\{\{time\}\}/g, now.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      }))
      .replace(/\{\{datetime\}\}/g, now.toLocaleString())
      .replace(/\{\{email\}\}/g, this.settings.userEmail || '[your-email]')
      // {{cursor}} preserved for later handling
      .replace(/\{\{cursor\}\}/g, '{{cursor}}');
  }

  /**
   * Apply markdown-like formatting
   */
  processFormatting(text) {
    // Bold: **text** → <strong>text</strong>
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *text* → <em>text</em>
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Code: `text` → <code>text</code>
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');
    
    // Line breaks: \n → <br> (for rich text) or actual newline
    text = text.replace(/\\n/g, '<br>');
    
    return text;
  }

  /**
   * Expand in plain text input/textarea
   */
  expandPlainText(element, before, expanded, after, cursorIndex, triggerStart) {
    const newValue = before + expanded + after;
    element.value = newValue;
    
    // Dispatch input event for framework reactivity
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Calculate and set cursor position
    let newCursorPos;
    if (cursorIndex >= 0) {
      newCursorPos = triggerStart + cursorIndex;
    } else {
      newCursorPos = triggerStart + expanded.length;
    }
    
    // Ensure cursor position is valid
    newCursorPos = Math.max(0, Math.min(newCursorPos, newValue.length));
    element.setSelectionRange(newCursorPos, newCursorPos);
  }

  /**
   * Expand in contentEditable (rich text) elements
   */
  expandRichText(element, before, expanded, after, cursorIndex, triggerStart) {
    // Get current selection
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    
    const range = sel.getRangeAt(0);
    
    // Delete the trigger text
    range.setStart(range.endContainer, range.endOffset - shortcut.key.length);
    range.deleteContents();
    
    // Insert expanded content
    const fragment = document.createDocumentFragment();
    if (expanded.includes('<')) {
      // Has HTML - parse and insert nodes
      const temp = document.createElement('div');
      temp.innerHTML = expanded;
      while (temp.firstChild) {
        fragment.appendChild(temp.firstChild);
      }
    } else {
      // Plain text
      fragment.appendChild(document.createTextNode(expanded));
    }
    range.insertNode(fragment);
    
    // Position cursor
    if (cursorIndex >= 0) {
      this.setCursorAtOffset(element, triggerStart + cursorIndex);
    } else {
      // Move cursor to end of inserted content
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    // Dispatch events for framework compatibility
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Set cursor position in contentEditable by character offset
   */
  setCursorAtOffset(element, targetOffset) {
    const sel = window.getSelection();
    const range = document.createRange();
    
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node, currentOffset = 0;
    
    while ((node = walker.nextNode())) {
      const nodeLength = node.textContent.length;
      if (currentOffset + nodeLength >= targetOffset) {
        const offsetInNode = targetOffset - currentOffset;
        range.setStart(node, Math.min(offsetInNode, nodeLength));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      currentOffset += nodeLength;
    }
    
    // Fallback: place at end
    range.selectNodeContents(element);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Show visual feedback animation on expansion
   */
  showExpansionFeedback(element) {
    const originalOutline = element.style.outline;
    element.style.outline = '2px solid #22c55e';
    element.style.transition = 'outline 0.15s ease';
    
    setTimeout(() => {
      element.style.outline = originalOutline || '';
    }, 300);
  }

  /**
   * Update engine settings/shortcuts at runtime
   */
  update(options = {}) {
    if (options.settings) this.settings = { ...this.settings, ...options.settings };
    if (options.shortcuts) this.shortcuts = options.shortcuts;
  }
}

// Export singleton instance for easy use
export const expansionEngine = new ExpansionEngine();
