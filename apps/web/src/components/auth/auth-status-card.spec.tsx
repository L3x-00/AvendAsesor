import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthStatusCard } from './auth-status-card';

describe('AuthStatusCard', () => {
  it('presents a clear status and a single next action within the shared access layout', () => {
    render(
      <AuthStatusCard
        actionHref="/auth/sign-in"
        actionLabel="Ir a iniciar sesión"
        description="Tu cuenta está lista."
        eyebrow="Correo verificado"
        title="Correo confirmado"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Correo confirmado' })).toBeInTheDocument();
    expect(screen.getByText('Tu cuenta está lista.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
    expect(screen.getByRole('img', { name: 'AVEND ASESOR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('offers a sign-out exit where no panel is reachable', () => {
    const { container } = render(
      <AuthStatusCard
        actionHref="/"
        actionLabel="Volver al inicio"
        description="Sin permisos."
        eyebrow="Permiso requerido"
        signOutLabel="Cerrar sesión"
        title="Acceso restringido"
      />,
    );

    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    const form = container.querySelector('form');
    expect(form).toHaveAttribute('action', '/auth/sign-out');
    expect(form).toHaveAttribute('method', 'post');
  });
});
