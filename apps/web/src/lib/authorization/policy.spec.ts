import { describe, expect, it } from 'vitest';
import { isAdministrativeRole } from './policy';

describe('isAdministrativeRole', () => {
  it('allows admin and superadmin', () => {
    expect(isAdministrativeRole('admin')).toBe(true);
    expect(isAdministrativeRole('superadmin')).toBe(true);
  });

  it('rejects docente', () => {
    expect(isAdministrativeRole('docente')).toBe(false);
  });

  it('fails closed for absent, malformed or unexpected values', () => {
    expect(isAdministrativeRole(undefined)).toBe(false);
    expect(isAdministrativeRole(null)).toBe(false);
    expect(isAdministrativeRole('')).toBe(false);
    expect(isAdministrativeRole('ADMIN')).toBe(false);
    expect(isAdministrativeRole(0)).toBe(false);
    expect(isAdministrativeRole({ role: 'admin' })).toBe(false);
    expect(isAdministrativeRole(['admin'])).toBe(false);
  });
});
