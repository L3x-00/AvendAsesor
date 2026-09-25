import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NotFound from './not-found';

describe('NotFound', () => {
  it('explains the missing page in plain language and offers clear ways back', () => {
    render(<NotFound />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Error 404')).toBeInTheDocument();
    expect(
      screen.getByText(/solo la puede ver la persona que la inició/u),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Ir a mi historial' })).toHaveAttribute(
      'href',
      '/history',
    );
    // Identidad de AVEND, no la pantalla negra por defecto de Next.js.
    expect(screen.getByRole('img', { name: 'AVEND ASESOR' })).toBeInTheDocument();
  });
});
