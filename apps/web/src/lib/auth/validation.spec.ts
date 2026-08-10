import { describe, expect, it } from 'vitest';
import {
  parseAuthForm,
  passwordResetSchema,
  passwordUpdateSchema,
  signInSchema,
  signUpSchema,
} from './validation';

function formData(values: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

describe('authentication form validation', () => {
  it('normalizes a valid registration payload', () => {
    const result = parseAuthForm(
      signUpSchema,
      formData({
        email: ' Docente@AVEND.pe ',
        fullName: ' Docente Demo ',
        password: 'Password1',
        passwordConfirmation: 'Password1',
      }),
    );

    expect(result).toEqual({
      data: {
        email: 'docente@avend.pe',
        fullName: 'Docente Demo',
        password: 'Password1',
        passwordConfirmation: 'Password1',
      },
      success: true,
    });
  });

  it('returns field errors for an invalid registration payload', () => {
    const result = parseAuthForm(
      signUpSchema,
      formData({
        email: 'not-an-email',
        fullName: 'A',
        password: 'weak',
        passwordConfirmation: 'different',
      }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.state).toMatchObject({
        fieldErrors: {
          email: 'Ingresa un correo electrónico válido.',
          fullName: 'Ingresa tu nombre completo.',
          password: 'La contraseña debe tener al menos 8 caracteres.',
          passwordConfirmation: 'Las contraseñas no coinciden.',
        },
        status: 'error',
      });
    }
  });

  it('requires a password when signing in', () => {
    const result = parseAuthForm(
      signInSchema,
      formData({ email: 'docente@avend.pe', password: '' }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.state.fieldErrors?.password).toBe('Ingresa tu contraseña.');
    }
  });

  it('rejects invalid recovery email addresses', () => {
    const result = parseAuthForm(
      passwordResetSchema,
      formData({ email: 'correo-invalido' }),
    );

    expect(result.success).toBe(false);
  });

  it('requires matching strong passwords when updating a password', () => {
    const result = parseAuthForm(
      passwordUpdateSchema,
      formData({ password: 'Password1', passwordConfirmation: 'Password2' }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.state.fieldErrors?.passwordConfirmation).toBe(
        'Las contraseñas no coinciden.',
      );
    }
  });
});
