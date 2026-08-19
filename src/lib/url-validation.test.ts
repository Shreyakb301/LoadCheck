import { describe, it, expect } from 'vitest';
import { normalizeAndValidateUrl, isBlockedHost } from './url-validation';

function expectError(result: ReturnType<typeof normalizeAndValidateUrl>): string {
  if (result.success) throw new Error(`expected an error, got normalizedUrl: ${result.normalizedUrl}`);
  return result.error;
}

describe('normalizeAndValidateUrl', () => {
  describe('missing protocol gets normalized', () => {
    it('adds https:// to a bare domain', () => {
      expect(normalizeAndValidateUrl('vercel.com')).toEqual({ success: true, normalizedUrl: 'https://vercel.com' });
    });

    it('adds https:// to a bare domain with a path', () => {
      expect(normalizeAndValidateUrl('vercel.com/pricing')).toEqual({ success: true, normalizedUrl: 'https://vercel.com/pricing' });
    });

    it('adds https:// to a www subdomain', () => {
      expect(normalizeAndValidateUrl('www.vercel.com')).toEqual({ success: true, normalizedUrl: 'https://www.vercel.com' });
    });

    it('trims surrounding whitespace before normalizing', () => {
      expect(normalizeAndValidateUrl('  vercel.com  ')).toEqual({ success: true, normalizedUrl: 'https://vercel.com' });
    });

    it('adds https:// to a bare host:port', () => {
      expect(normalizeAndValidateUrl('vercel.com:8080')).toEqual({ success: true, normalizedUrl: 'https://vercel.com:8080' });
    });
  });

  describe('protocol already present is left alone', () => {
    it('leaves an https:// URL unchanged', () => {
      expect(normalizeAndValidateUrl('https://vercel.com')).toEqual({ success: true, normalizedUrl: 'https://vercel.com' });
    });

    it('leaves an http:// URL unchanged (does not force-upgrade to https)', () => {
      expect(normalizeAndValidateUrl('http://vercel.com')).toEqual({ success: true, normalizedUrl: 'http://vercel.com' });
    });
  });

  describe('empty / missing input', () => {
    it('rejects an empty string', () => {
      expect(normalizeAndValidateUrl('')).toEqual({ success: false, error: 'URL is required' });
    });

    it('rejects a whitespace-only string', () => {
      expect(normalizeAndValidateUrl('   ')).toEqual({ success: false, error: 'URL is required' });
    });

    it('rejects null', () => {
      expect(normalizeAndValidateUrl(null as unknown as string)).toEqual({ success: false, error: 'URL is required' });
    });

    it('rejects undefined', () => {
      expect(normalizeAndValidateUrl(undefined as unknown as string)).toEqual({ success: false, error: 'URL is required' });
    });

    it('rejects a non-string value', () => {
      expect(normalizeAndValidateUrl(42 as unknown as string)).toEqual({ success: false, error: 'URL is required' });
    });
  });

  describe('malformed input', () => {
    it('rejects a string with spaces that is not a valid URL', () => {
      expect(expectError(normalizeAndValidateUrl('not a url'))).toMatch(/valid URL/i);
    });

    it('rejects a lone protocol with nothing after it', () => {
      expect(expectError(normalizeAndValidateUrl('https://'))).toMatch(/valid URL/i);
    });

    it('does not reject gibberish that happens to be structurally valid (resolvability is Google\'s job, not ours)', () => {
      // The WHATWG URL parser is lenient about hostname characters, so "!!!" parses as a
      // syntactically valid (if nonsensical) host. Whether it actually resolves is left to
      // the downstream PageSpeed API call to reject.
      expect(normalizeAndValidateUrl('!!!///???')).toEqual({ success: true, normalizedUrl: 'https://!!!///???' });
    });
  });

  describe('non-http(s) schemes are rejected, not mangled', () => {
    it('rejects ftp:// instead of turning it into https://ftp://...', () => {
      expect(normalizeAndValidateUrl('ftp://example.com')).toEqual({ success: false, error: 'We can only analyze http:// and https:// URLs.' });
    });

    it('rejects ws://', () => {
      expect(normalizeAndValidateUrl('ws://example.com')).toEqual({ success: false, error: 'We can only analyze http:// and https:// URLs.' });
    });

    it('rejects file://', () => {
      expect(normalizeAndValidateUrl('file:///etc/passwd')).toEqual({ success: false, error: 'We can only analyze http:// and https:// URLs.' });
    });
  });

  describe('localhost and private networks are blocked', () => {
    it('blocks localhost', () => {
      expect(expectError(normalizeAndValidateUrl('localhost'))).toMatch(/public websites/i);
    });

    it('blocks localhost with a port', () => {
      expect(expectError(normalizeAndValidateUrl('localhost:3000'))).toMatch(/public websites/i);
    });

    it('blocks 127.0.0.1', () => {
      expect(expectError(normalizeAndValidateUrl('127.0.0.1'))).toMatch(/public websites/i);
    });

    it('blocks a .local hostname', () => {
      expect(expectError(normalizeAndValidateUrl('my-machine.local'))).toMatch(/public websites/i);
    });

    it('blocks 192.168.x.x', () => {
      expect(expectError(normalizeAndValidateUrl('192.168.1.5'))).toMatch(/public websites/i);
    });

    it('blocks 10.x.x.x', () => {
      expect(expectError(normalizeAndValidateUrl('10.0.0.5'))).toMatch(/public websites/i);
    });

    it('blocks 172.16.x.x - 172.31.x.x (the actual private range)', () => {
      expect(expectError(normalizeAndValidateUrl('172.16.0.5'))).toMatch(/public websites/i);
      expect(expectError(normalizeAndValidateUrl('172.31.255.255'))).toMatch(/public websites/i);
    });

    it('does not block public IPs outside 172.16.0.0/12', () => {
      // 172.217.x.x (Google) and 172.67.x.x (Cloudflare) are public despite starting with "172."
      expect(normalizeAndValidateUrl('172.217.164.110')).toEqual({ success: true, normalizedUrl: 'https://172.217.164.110' });
      expect(normalizeAndValidateUrl('172.67.1.1')).toEqual({ success: true, normalizedUrl: 'https://172.67.1.1' });
      expect(normalizeAndValidateUrl('172.15.0.1')).toEqual({ success: true, normalizedUrl: 'https://172.15.0.1' });
      expect(normalizeAndValidateUrl('172.32.0.1')).toEqual({ success: true, normalizedUrl: 'https://172.32.0.1' });
    });
  });

  describe('valid public URLs pass through', () => {
    it('accepts a URL with query params and a hash', () => {
      expect(normalizeAndValidateUrl('vercel.com/page?foo=bar#section')).toEqual({
        success: true,
        normalizedUrl: 'https://vercel.com/page?foo=bar#section',
      });
    });

    it('accepts a deep subdomain', () => {
      expect(normalizeAndValidateUrl('docs.example.co.uk')).toEqual({ success: true, normalizedUrl: 'https://docs.example.co.uk' });
    });
  });
});

describe('isBlockedHost', () => {
  it('blocks cloud metadata / link-local addresses (169.254.0.0/16)', () => {
    // 169.254.169.254 is the AWS/GCP/Azure/DigitalOcean instance metadata endpoint, which
    // serves credentials over plain HTTP with no auth. A classic SSRF target.
    expect(isBlockedHost('169.254.169.254')).toBe(true);
    expect(isBlockedHost('169.254.0.1')).toBe(true);
  });

  it('blocks 0.0.0.0 and IPv6 loopback', () => {
    expect(isBlockedHost('0.0.0.0')).toBe(true);
    expect(isBlockedHost('::1')).toBe(true);
  });

  it('blocks IPv6 unique-local (fc00::/7) and link-local (fe80::/10) ranges', () => {
    expect(isBlockedHost('fd12:3456:789a::1')).toBe(true);
    expect(isBlockedHost('fc00::1')).toBe(true);
    expect(isBlockedHost('fe80::1')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isBlockedHost('LOCALHOST')).toBe(true);
    expect(isBlockedHost('FE80::1')).toBe(true);
  });

  it('does not block real public hosts', () => {
    expect(isBlockedHost('vercel.com')).toBe(false);
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('172.217.164.110')).toBe(false);
    expect(isBlockedHost('2001:4860:4860::8888')).toBe(false); // Google public DNS, IPv6
  });
});
