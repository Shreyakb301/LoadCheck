// Blocks hostnames that point at localhost, private networks, or cloud metadata endpoints
// (169.254.169.254 and friends serve cloud credentials over plain HTTP with no auth, a classic
// SSRF target). Exported so it can be re-checked at every redirect hop, not just the URL a user
// originally typed in, since a public-looking URL can 302 to an internal one.
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();

  // The 172.x check only covers the actual private sub-range (172.16.0.0/12), not all of
  // 172.0.0.0/8, since that range also contains plenty of public IPs (e.g. Cloudflare's
  // 172.67.x.x, Google's 172.217.x.x).
  const isPrivate172 = /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  // 169.254.0.0/16: link-local, and where AWS/GCP/Azure/DigitalOcean all serve instance
  // metadata (credentials, tokens) with no auth required.
  const isLinkLocal = h.startsWith('169.254.');

  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.includes('.local') ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    isPrivate172 ||
    isLinkLocal ||
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10) ranges
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    /^fe[89ab][0-9a-f]:/.test(h)
  );
}

// Pure, network-free, and framework-free so it can run both in the browser (as an instant
// pre-check before the "Analyzing your site" UI appears) and on the server (as the
// authoritative check inside the API route, since client-side checks can be bypassed by
// anyone calling the API directly).
export function normalizeAndValidateUrl(url: string): { success: true; normalizedUrl: string } | { success: false; error: string } {
  if (!url || typeof url !== 'string') {
    return { success: false, error: 'URL is required' };
  }

  let normalizedUrl = url.trim();

  if (!normalizedUrl) {
    return { success: false, error: 'URL is required' };
  }

  // Reject other network schemes (ftp://, ws://, file://, etc.) instead of mangling them by
  // blindly prepending https:// to whatever came before the "://". A bare "host:port" like
  // "vercel.com:8080" has no "//" after its colon, so it's left alone and gets https:// added below.
  const hasNetworkScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedUrl);
  if (hasNetworkScheme && !normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    return { success: false, error: 'We can only analyze http:// and https:// URLs.' };
  }

  // Add protocol if missing
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return { success: false, error: 'That doesn\'t look like a valid URL. Include the full address, like https://example.com' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { success: false, error: 'We can only analyze http:// and https:// URLs.' };
  }

  if (isBlockedHost(parsed.hostname)) {
    return { success: false, error: 'We can only analyze public websites. Localhost and private networks aren\'t reachable from our servers.' };
  }

  return { success: true, normalizedUrl };
}
