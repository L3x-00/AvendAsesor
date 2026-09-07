import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthActionState } from '@/lib/auth/action-state';
import { AuthForm, type AuthAction } from './auth-form';

const fields = [
  {
    autoComplete: 'email',
    label: 'Correo electrónico',
    name: 'email' as const,
    type: 'email' as const,
  },
];

describe('AuthForm', () => {
  it('renders accessible fields, links and returned field errors', async () => {
    const user = userEvent.setup();
    const action: AuthAction = vi.fn(async (): Promise<AuthActionState> => ({
      fieldErrors: { email: 'Ingresa un correo electrónico válido.' },
      message: 'Revisa los campos señalados.',
      status: 'error',
    }));

    render(
      <AuthForm
        action={action}
        description="Descripción"
        fields={fields}
        links={[{ href: '/auth/sign-up', label: 'Crear una cuenta' }]}
        submitLabel="Continuar"
        title="Iniciar sesión"
      />,
    );

    // La validación del navegador ya no deja enviar vacío, así que el error del
    // servidor solo se puede provocar con un correo bien formado.
    await user.type(screen.getByLabelText('Correo electrónico'), 'docente@avend.pe');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisa los campos señalados.',
    );
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByText('Ingresa un correo electrónico válido.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Crear una cuenta' })).toHaveAttribute(
      'href',
      '/auth/sign-up',
    );
  });

  it('communicates pending and success states without requiring navigation links', async () => {
    const user = userEvent.setup();
    let resolveAction: ((value: AuthActionState) => void) | undefined;
    const action: AuthAction = () =>
      new Promise<AuthActionState>((resolve) => {
        resolveAction = resolve;
      });

    render(
      <AuthForm
        action={action}
        description="Descripción"
        fields={fields}
        submitLabel="Continuar"
        title="Recuperar acceso"
      />,
    );

    await user.type(screen.getByLabelText('Correo electrónico'), 'docente@avend.pe');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    resolveAction?.({ message: 'Revisa tu correo.', status: 'success' });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Revisa tu correo.');
    });
  });

  it('marks the field and blocks the server action when the form is incomplete', async () => {
    const user = userEvent.setup();
    const action: AuthAction = vi.fn(async (): Promise<AuthActionState> => ({
      status: 'success',
    }));

    render(
      <AuthForm
        action={action}
        description="Descripción"
        fields={fields}
        submitLabel="Continuar"
        title="Iniciar sesión"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(action).not.toHaveBeenCalled();
    expect(
      screen.getByText('El correo electrónico es obligatorio.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('clears the field error as soon as the value becomes valid', async () => {
    const user = userEvent.setup();
    const action: AuthAction = vi.fn(async (): Promise<AuthActionState> => ({
      status: 'success',
    }));

    render(
      <AuthForm
        action={action}
        description="Descripción"
        fields={fields}
        submitLabel="Continuar"
        title="Iniciar sesión"
      />,
    );

    const field = screen.getByLabelText('Correo electrónico');
    await user.type(field, 'no-es-un-correo');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(
      screen.getByText('El correo electrónico no es válido.'),
    ).toBeVisible();

    await user.clear(field);
    await user.type(field, 'docente@avend.pe');

    await waitFor(() => {
      expect(
        screen.queryByText('El correo electrónico no es válido.'),
      ).not.toBeInTheDocument();
    });
  });
});
