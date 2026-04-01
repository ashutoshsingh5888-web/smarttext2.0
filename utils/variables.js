// Smart variables processing
export function processVariables(text, settings) {
  return text
    .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
    .replace(/\{\{time\}\}/g, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{\{datetime\}\}/g, new Date().toLocaleString())
    .replace(/\{\{email\}\}/g, settings.userEmail || '[your-email]')
    // {{cursor}} is handled separately during expansion
    .replace(/\{\{cursor\}\}/g, '{{cursor}}');
}
