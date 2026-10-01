import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EmailChangeResultPage from './page';

async function renderResult(resultado?: string | string[]) {
  render(await EmailChangeResultPage({ searchParams: Promise.resolve({ resultado }) }));
}

function expectSignInAction() {
  expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
    'href',
    '/auth/sign-in',
  );
}

describe('página pública del resultado del cambio de correo', () => {
  it('pendiente: pide abrir el otro enlace y ofrece iniciar sesión', async () => {
    await renderResult('pendiente');

    expect(screen.getByRole('heading', { name: 'Falta un paso' })).toBeInTheDocument();
    expect(
      screen.getByText(/Confirmaste uno de los enlaces; abre el otro/),
    ).toBeInTheDocument();
    expectSignInAction();
  });

  it('revisar: explica que el correo pudo cambiar y con cuál entrar', async () => {
    await renderResult('revisar');

    expect(
      screen.getByRole('heading', { name: 'Revisa tu correo de acceso' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Si ya abriste los dos enlaces, tu correo pudo cambiar: inicia sesión con tu correo nuevo/,
      ),
    ).toBeInTheDocument();
    expectSignInAction();
  });

  it('error: no ofrece recuperar la contraseña, sino iniciar sesión', async () => {
    await renderResult('error');

    expect(
      screen.getByRole('heading', { name: 'No pudimos usar ese enlace' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/venció, ya se usó o no es válido/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /recuperación/i })).toBeNull();
    expectSignInAction();
  });

  it('un resultado desconocido o repetido muestra el aviso neutro de revisar', async () => {
    await renderResult(['pendiente', 'error']);

    expect(
      screen.getByRole('heading', { name: 'Revisa tu correo de acceso' }),
    ).toBeInTheDocument();
    expectSignInAction();
  });
});
