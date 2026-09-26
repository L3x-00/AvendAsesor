import { describe, expect, it } from 'vitest';
import {
  applySessionPersistence,
  REMEMBER_COOKIE,
  SESSION_MARKER_COOKIE,
  sessionPreferenceCookies,
  shouldPersistSession,
  signInPathFor,
} from './session-preferences';

describe('session preferences', () => {
  it('persists by default and only drops persistence on an explicit "0"', () => {
    expect(shouldPersistSession(undefined)).toBe(true);
    expect(shouldPersistSession('1')).toBe(true);
    expect(shouldPersistSession('0')).toBe(false);
  });

  it('turns auth cookies into browser-session cookies when not remembered', () => {
    const options = {
      expires: new Date('2027-01-01'),
      httpOnly: true,
      maxAge: 400,
      path: '/',
    };

    expect(applySessionPersistence(options, true)).toBe(options);
    expect(applySessionPersistence(options, false)).toEqual({
      httpOnly: true,
      path: '/',
    });
  });

  it('always honours a deletion so signing out clears the cookie', () => {
    const deletion = { maxAge: 0, path: '/' };

    expect(applySessionPersistence(deletion, false)).toBe(deletion);
  });

  it('marks the device session with the same lifetime as the choice', () => {
    const remembered = sessionPreferenceCookies(true, true);
    const forgotten = sessionPreferenceCookies(false, false);

    expect(remembered).toEqual([
      expect.objectContaining({ name: REMEMBER_COOKIE, value: '1' }),
      expect.objectContaining({
        name: SESSION_MARKER_COOKIE,
        options: expect.objectContaining({ maxAge: expect.any(Number), secure: true }),
        value: '1',
      }),
    ]);
    expect(forgotten[0]).toMatchObject({ name: REMEMBER_COOKIE, value: '0' });
    expect(forgotten[1].options.maxAge).toBeUndefined();
    for (const cookie of [...remembered, ...forgotten]) {
      expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'lax' });
    }
  });

  it('points to a calm "session expired" notice only when there was a session', () => {
    expect(signInPathFor(false)).toBe('/auth/sign-in');
    expect(signInPathFor(true)).toBe('/auth/sign-in?sesion=caducada');
  });
});
