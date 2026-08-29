import { describe, expect, it } from 'vitest';
import { getAdminApiUrl } from './config';

describe('administrative API configuration', () => {
  it('accepts credential-free HTTPS origins and loopback HTTP origins', () => {
    expect(
      getAdminApiUrl({ ADMIN_API_URL: 'https://api.avend.example/' }),
    ).toBe('https://api.avend.example');
    expect(
      getAdminApiUrl({ ADMIN_API_URL: 'http://localhost:3001/' }),
    ).toBe('http://localhost:3001');
  });

  it('rejects incomplete, malformed and insecure non-loopback configuration', () => {
    expect(() => getAdminApiUrl({})).toThrow(
      'Administrative API configuration is incomplete.',
    );
    expect(() => getAdminApiUrl({ ADMIN_API_URL: 'not a url' })).toThrow(
      'Administrative API configuration is invalid.',
    );
    expect(() =>
      getAdminApiUrl({ ADMIN_API_URL: 'http://api.avend.example' }),
    ).toThrow('Administrative API configuration is invalid.');
  });

  it.each([
    'https://user:password@api.avend.example',
    'https://api.avend.example/internal',
    'https://api.avend.example?token=unsafe',
    'https://api.avend.example#unsafe',
  ])('rejects a value that is not a safe origin: %s', (value) => {
    expect(() => getAdminApiUrl({ ADMIN_API_URL: value })).toThrow(
      'Administrative API configuration is invalid.',
    );
  });
});
