import { describe, expect, it } from 'vitest';
import {
  EMAIL_CHANGE_RETURN_PATH,
  getAllowedAuthCallbackPath,
  getApplicationUrl,
  getAuthRedirectUrl,
  getEmailChangePublicResultPath,
  getEmailChangeResultPath,
  getSafeInternalPath,
  hasTrustedRequestOrigin,
  parseEmailChangeOutcome,
} from './site-url';

describe('authentication redirect URLs', () => {
  it('uses the local fallback outside production', () => {
    expect(getApplicationUrl({ NODE_ENV: 'test' }).toString()).toBe(
      'http://localhost:3000/',
    );
  });

  it('requires an application URL in production', () => {
    expect(() => getApplicationUrl({ NODE_ENV: 'production' })).toThrow(
      'APP_URL must be configured outside local development.',
    );
  });

  it('requires HTTPS for non-local application URLs', () => {
    expect(() =>
      getApplicationUrl({ APP_URL: 'http://staging.avend.pe', NODE_ENV: 'test' }),
    ).toThrow('APP_URL must use HTTPS outside local development.');
  });

  it('builds callbacks below the configured application URL', () => {
    const previousUrl = process.env.APP_URL;
    process.env.APP_URL = 'https://staging.avend.pe';

    try {
      expect(getAuthRedirectUrl('/auth/callback?next=/auth/confirmed')).toBe(
        'https://staging.avend.pe/auth/callback?next=/auth/confirmed',
      );
    } finally {
      process.env.APP_URL = previousUrl;
    }
  });

  it('rejects redirect targets outside the authentication area', () => {
    expect(() => getAuthRedirectUrl('/dashboard')).toThrow(
      'Authentication redirects must stay under /auth/.',
    );
  });

  it('keeps only safe internal return paths', () => {
    expect(getSafeInternalPath('/auth/update-password', '/auth/code-error')).toBe(
      '/auth/update-password',
    );
    expect(getSafeInternalPath('//attacker.example', '/auth/code-error')).toBe(
      '/auth/code-error',
    );
    expect(getSafeInternalPath('/\\attacker.example', '/auth/code-error')).toBe(
      '/auth/code-error',
    );
    expect(getSafeInternalPath(null, '/auth/code-error')).toBe('/auth/code-error');
  });

  it('permits only known callback destinations', () => {
    expect(getAllowedAuthCallbackPath('/auth/confirmed')).toBe('/auth/confirmed');
    expect(getAllowedAuthCallbackPath('/auth/update-password')).toBe(
      '/auth/update-password',
    );
    expect(getAllowedAuthCallbackPath('/profile')).toBe('/profile');
    expect(getAllowedAuthCallbackPath('/admin')).toBe('/auth/code-error');
  });

  it('builds and reads the email-change notice of Mi perfil', () => {
    expect(getAllowedAuthCallbackPath(EMAIL_CHANGE_RETURN_PATH)).toBe('/profile');
    expect(getEmailChangeResultPath('pendiente')).toBe('/profile?correo=pendiente');
    expect(getEmailChangePublicResultPath('revisar')).toBe(
      '/auth/callback/correo?resultado=revisar',
    );
    expect(parseEmailChangeOutcome('actualizado')).toBe('actualizado');
    expect(parseEmailChangeOutcome('revisar')).toBe('revisar');
    expect(parseEmailChangeOutcome('error')).toBe('error');
    expect(parseEmailChangeOutcome('otro')).toBeNull();
    expect(parseEmailChangeOutcome(['actualizado'])).toBeNull();
    expect(parseEmailChangeOutcome(undefined)).toBeNull();
  });

  it('accepts mutations only from the configured origin', () => {
    const previousUrl = process.env.APP_URL;
    process.env.APP_URL = 'https://staging.avend.pe';

    try {
      expect(hasTrustedRequestOrigin('https://staging.avend.pe')).toBe(true);
      expect(hasTrustedRequestOrigin('https://attacker.example')).toBe(false);
      expect(hasTrustedRequestOrigin(null)).toBe(false);
    } finally {
      process.env.APP_URL = previousUrl;
    }
  });
});
