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
  });
});
