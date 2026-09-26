import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const signInFields = [
  ...fields,
  {
    autoComplete: 'current-password',
    label: 'Contraseña',
    name: 'password' as const,
    type: 'password' as const,
  },
];

describe('AuthForm', () => {
  afterEach(() => window.localStorage.clear());

  it('offers to keep the session, remembers only the email and prefills it next time', async () => {
    const user = userEvent.setup();
    const received: FormData[] = [];
    const action: AuthAction = vi.fn(
      async (_state: AuthActionState, formData: FormData): Promise<AuthActionState> => {
        received.push(formData);
        return { message: 'No se pudo iniciar sesión.', status: 'error' };
      },
    );

    const { unmount } = render(
      <AuthForm
        action={action}
        description="Descripción"
        fields={signInFields}
        rememberOption
        submitLabel="Iniciar sesión"
        title="Bienvenido"
      />,
    );

    const keep = screen.getByRole('checkbox', { name: /Mantener mi sesión iniciada/ });
    expect(keep).toBeChecked();
    await user.type(screen.getByLabelText('Correo electrónico'), 'docente@avend.pe');
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(received).toHaveLength(1));
    expect(received[0].get('remember')).toBe('on');
    expect(window.localStorage.getItem('avend-remembered-email')).toBe('docente@avend.pe');
    // La contraseña nunca se guarda: eso es tarea del gestor del navegador.
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('Secreta123');
    unmount();

    render(
      <AuthForm
        action={action}
        description="Descripción"
        fields={signInFields}
        rememberOption
        submitLabel="Iniciar sesión"
        title="Bienvenido"
      />,
    );
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('docente@avend.pe');
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
  });

  it('forgets the email when the person chooses not to keep the session', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('avend-remembered-email', 'anterior@avend.pe');
    const action: AuthAction = vi.fn(async (): Promise<AuthActionState> => ({
      status: 'error',
    }));

    render(
      <AuthForm
        action={action}
        description="Descripción"
        fields={signInFields}
        rememberOption
        submitLabel="Iniciar sesión"
        title="Bienvenido"
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /Mantener mi sesión iniciada/ }));
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(window.localStorage.getItem('avend-remembered-email')).toBeNull();
  });

  it('shows a calm notice above the form when one is provided', () => {
    render(
      <AuthForm
        action={vi.fn()}
        description="Descripción"
        fields={fields}
        notice={{ text: 'Ingresa nuevamente para continuar.', title: 'Tu sesión finalizó' }}
        submitLabel="Iniciar sesión"
        title="Bienvenido"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión finalizó');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

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
