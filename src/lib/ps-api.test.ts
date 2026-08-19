import { describe, it, expect } from 'vitest';
import { checkReachable } from './ps-api';

// These hit real DNS/network (there's no meaningful way to unit test "does this domain exist"
// without a resolver), so they're slower and depend on network access being available.
// normalizeAndValidateUrl's own tests live in url-validation.test.ts since that check moved to
// a standalone module so the client can run it too.
describe('checkReachable', () => {
  it('reports a domain that does not exist as such, distinct from other connection failures', async () => {
    const result = await checkReachable('https://this-domain-should-never-exist-loadcheck-test.invalid');
    expect(result.reachable).toBe(false);
    if (!result.reachable) {
      expect(result.error).toMatch(/doesn't exist/i);
    }
  });

  it('reports a real, reachable domain as reachable', async () => {
    const result = await checkReachable('https://example.com');
    expect(result).toEqual({ reachable: true });
  });

  it('follows a legitimate redirect (http -> https) rather than treating it as blocked', async () => {
    const result = await checkReachable('http://github.com');
    expect(result).toEqual({ reachable: true });
  });
}, 15000);
