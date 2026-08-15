import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminShell } from './admin-shell';

describe('AdminShell', () => {
  it('renders clear navigation for the two protected administrative resources', () => {
    render(
      <AdminShell description="Descripción" title="Administración">
        <p>Contenido administrativo</p>
      </AdminShell>,
    );

    expect(screen.getByRole('heading', { name: 'Administración' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Módulos' })).toHaveAttribute(
      'href',
      '/admin/modules',
    );
    expect(screen.getByRole('link', { name: 'Documentos' })).toHaveAttribute(
      'href',
      '/admin/documents',
    );
  });
});
