// Markdown-like formatting processor
export function processFormatting(text, isRichText) {
  if (!isRichText) {
    // Strip formatting for plain text fields
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\\n/g, '\n');
  }
  
  // Apply HTML formatting for contentEditable
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\\n/g, '<br>');
}
