import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

const withSession = { data: { user: { id: 'docente-1' } }, error: null };
const withoutSession = { data: { user: null }, error: null };

import { GET } from './route';

function callback(query: string) {
  return GET(new NextRequest(`https://avend.test/auth/callback?${query}`));
}

function destination(response: Response): string {
  const location = response.headers.get('location');
  if (!location) throw new Error('La respuesta no redirige.');
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

describe('auth callback', () => {
  beforeEach(() => {
    mocks.createServerSupabaseClient.mockReset();
    mocks.createServerSupabaseClient.mockImplementation(async () => ({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        getUser: mocks.getUser,
      },
    }));
    mocks.exchangeCodeForSession.mockReset();
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue(withSession);
  });

  describe('cambio de correo (next=/profile)', () => {
    it('el primer enlace aceptado vuelve a Mi perfil pidiendo abrir el otro, sin pantalla de error', async () => {
      const response = await callback(
        'next=/profile&message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email',
      );

      expect(destination(response)).toBe('/profile?correo=pendiente');
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('un enlace vencido o ya usado vuelve a Mi perfil con un aviso propio', async () => {
      const response = await callback(
        'next=/profile&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      );

      expect(destination(response)).toBe('/profile?correo=error');
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('si el canje funciona, confirma que el correo quedó actualizado', async () => {
      const response = await callback('next=/profile&code=abc');

      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('abc');
      expect(destination(response)).toBe('/profile?correo=actualizado');
    });

    it('sin verificador (otro dispositivo o sesión cerrada) pide revisar en vez de afirmar un error', async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({
        error: { name: 'AuthPKCECodeVerifierMissingError' },
      });

      const response = await callback('next=/profile&code=abc');

      expect(destination(response)).toBe('/profile?correo=revisar');
    });

    it('si el canje lanza una excepción también pide revisar', async () => {
      mocks.exchangeCodeForSession.mockRejectedValue(new Error('network'));

      const response = await callback('next=/profile&code=abc');

      expect(destination(response)).toBe('/profile?correo=revisar');
    });

    it('sin código ni mensaje lo trata como enlace no válido dentro de Mi perfil', async () => {
      const response = await callback('next=/profile');

      expect(destination(response)).toBe('/profile?correo=error');
    });

    it('un canje correcto va a Mi perfil sin consultar la sesión previa', async () => {
      mocks.getUser.mockResolvedValue(withoutSession);

      const response = await callback('next=/profile&code=abc');

      expect(destination(response)).toBe('/profile?correo=actualizado');
      expect(mocks.getUser).not.toHaveBeenCalled();
    });
  });

  describe('cambio de correo sin sesión en este navegador', () => {
    beforeEach(() => {
      mocks.getUser.mockResolvedValue(withoutSession);
    });

    it('el primer enlace abierto en otro dispositivo lleva a la página pública de «Falta un paso»', async () => {
      const response = await callback(
        'next=/profile&message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email',
      );

      expect(destination(response)).toBe('/auth/callback/correo?resultado=pendiente');
    });

    it('el segundo enlace sin verificador lleva a la página pública que pide revisar', async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({
        error: { name: 'AuthPKCECodeVerifierMissingError' },
      });

      const response = await callback('next=/profile&code=abc');

      expect(destination(response)).toBe('/auth/callback/correo?resultado=revisar');
    });

    it('un enlace vencido lleva a la página pública con su aviso', async () => {
      const response = await callback(
        'next=/profile&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      );

      expect(destination(response)).toBe('/auth/callback/correo?resultado=error');
    });

    it('si no se puede comprobar la sesión, usa la página pública', async () => {
      mocks.getUser.mockRejectedValue(new Error('network'));

      const response = await callback('next=/profile&message=ok');

      expect(destination(response)).toBe('/auth/callback/correo?resultado=pendiente');
    });

    it('si Auth responde con error al pedir el usuario, usa la página pública', async () => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: { name: 'AuthSessionMissingError' },
      });

      const response = await callback('next=/profile&message=ok');

      expect(destination(response)).toBe('/auth/callback/correo?resultado=pendiente');
    });

    it('si no se puede crear el cliente, pide revisar en la página pública', async () => {
      mocks.createServerSupabaseClient.mockRejectedValue(new Error('config'));

      const response = await callback('next=/profile&code=abc');

      expect(destination(response)).toBe('/auth/callback/correo?resultado=revisar');
    });
  });

  describe('otros destinos conservan el comportamiento anterior', () => {
    it('canjea el código y continúa al destino permitido', async () => {
      const response = await callback('next=/auth/update-password&code=abc');

      expect(destination(response)).toBe('/auth/update-password');
    });

    it('sin código muestra la pantalla de enlace no disponible', async () => {
      const response = await callback('next=/auth/confirmed&message=hola');

      expect(destination(response)).toBe('/auth/code-error');
    });

    it('si el canje falla muestra la pantalla de enlace no disponible', async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({ error: { name: 'AuthApiError' } });

      const response = await callback('next=/auth/confirmed&code=abc');

      expect(destination(response)).toBe('/auth/code-error');
    });

    it('un destino no permitido termina en la pantalla de enlace no disponible', async () => {
      const response = await callback('next=/admin&code=abc');

      expect(destination(response)).toBe('/auth/code-error');
    });
  });
});
