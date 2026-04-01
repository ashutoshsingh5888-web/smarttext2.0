// Domain restriction matching logic
export function matchesDomain(allowedDomains, currentDomain) {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  
  return allowedDomains.some(allowed => {
    // Exact match
    if (currentDomain === allowed) return true;
    // Subdomain match: work.example.com matches example.com
    if (currentDomain.endsWith('.' + allowed)) return true;
    return false;
  });
}
