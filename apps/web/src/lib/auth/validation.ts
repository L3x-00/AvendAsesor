import { z } from 'zod';
import type { AuthActionState, AuthFieldName } from './action-state';

const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Ingresa tu nombre completo.')
  .max(160, 'El nombre completo es demasiado extenso.');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Ingresa un correo electrónico válido.');

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .regex(/[a-z]/, 'La contraseña debe incluir una letra minúscula.')
  .regex(/[A-Z]/, 'La contraseña debe incluir una letra mayúscula.')
  .regex(/[0-9]/, 'La contraseña debe incluir un número.');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});

export const signUpSchema = z
  .object({
    email: emailSchema,
    fullName: fullNameSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .superRefine(({ password, passwordConfirmation }, context) => {
    if (password !== passwordConfirmation) {
      context.addIssue({
        code: 'custom',
        message: 'Las contraseñas no coinciden.',
        path: ['passwordConfirmation'],
      });
    }
  });

export const passwordResetSchema = z.object({
  email: emailSchema,
});

export const passwordUpdateSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .superRefine(({ password, passwordConfirmation }, context) => {
    if (password !== passwordConfirmation) {
      context.addIssue({
        code: 'custom',
        message: 'Las contraseñas no coinciden.',
        path: ['passwordConfirmation'],
      });
    }
  });

type AuthSchema = z.ZodType<Record<string, string>>;

export function parseAuthForm<T extends AuthSchema>(
  schema: T,
  formData: FormData,
):
  | { data: z.output<T>; success: true }
  | { state: AuthActionState; success: false } {
  const input = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [
      key,
      typeof value === 'string' ? value : '',
    ]),
  );
  const result = schema.safeParse(input);

  if (result.success) {
    return { data: result.data, success: true };
  }

  const fieldErrors: Partial<Record<AuthFieldName, string>> = {};

  for (const issue of result.error.issues) {
    const field = issue.path.at(0);

    if (
      typeof field === 'string' &&
      field in
        ({
          email: true,
          fullName: true,
          password: true,
          passwordConfirmation: true,
        } satisfies Record<AuthFieldName, true>) &&
      !fieldErrors[field as AuthFieldName]
    ) {
      fieldErrors[field as AuthFieldName] = issue.message;
    }
  }

  return {
    state: {
      fieldErrors,
      message: 'Revisa los campos señalados e inténtalo nuevamente.',
      status: 'error',
    },
    success: false,
  };
}
