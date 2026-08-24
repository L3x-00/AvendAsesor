import { FaqMemoryService } from './faq-memory.service';

describe('FaqMemoryService', () => {
  const fingerprintSecret = 'faq-memory-test-secret-with-32-characters';
  const service = new FaqMemoryService({
    get: jest.fn().mockReturnValue(fingerprintSecret),
  } as never);

  it('creates a deterministic fingerprint from a bounded canonical question', () => {
    const first = service.prepare('  ¿Cómo solicito una licencia?  ');
    const second = service.prepare('¿CÓMO SOLICITO UNA LICENCIA?');

    expect(first?.questionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second?.questionFingerprint).toBe(first?.questionFingerprint);
  });

  it('redacts common direct identifiers before persisting a candidate', () => {
    const observation = service.prepare(
      'Mi correo docente@example.com, DNI 12/345/678, código 12 34 56 78, tarjeta 4111 1111 1111 1111 y RUC 20123456789 requieren una licencia; llámame al 987 654 321.',
    );

    expect(observation?.questionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(observation?.questionFingerprint).not.toContain(
      'docente@example.com',
    );
    expect(observation?.questionFingerprint).not.toContain('12/345/678');
    expect(observation?.questionFingerprint).not.toContain('12 34 56 78');
    expect(observation?.questionFingerprint).not.toContain(
      '4111 1111 1111 1111',
    );
    expect(observation?.questionFingerprint).not.toContain('20123456789');
    expect(observation?.questionFingerprint).not.toContain('987 654 321');
  });

  it('does not create memory candidates for secrets or oversized content', () => {
    expect(service.prepare('Mi contraseña es confidencial')).toBeNull();
    expect(service.prepare('x'.repeat(1_001))).toBeNull();
  });

  it('does not record anything when the server fingerprint secret is absent', () => {
    const unconfigured = new FaqMemoryService({
      get: jest.fn().mockReturnValue(undefined),
    } as never);

    expect(unconfigured.prepare('¿Cómo solicito una licencia?')).toBeNull();
  });
});
