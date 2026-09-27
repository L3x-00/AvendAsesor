import { ServiceUnavailableException } from '@nestjs/common';
import { classifyAiProviderFailure } from './ai-provider-failure';

describe('classifyAiProviderFailure', () => {
  it.each([
    [401, 'AI_PROVIDER_AUTH'],
    [402, 'AI_PROVIDER_CREDITS'],
    [403, 'AI_PROVIDER_FORBIDDEN'],
    [404, 'AI_PROVIDER_MODEL_NOT_FOUND'],
    [408, 'AI_PROVIDER_TIMEOUT'],
    [429, 'AI_PROVIDER_RATE_LIMIT'],
    [500, 'AI_PROVIDER_UNAVAILABLE'],
    [503, 'AI_PROVIDER_UNAVAILABLE'],
    [504, 'AI_PROVIDER_TIMEOUT'],
  ])('traduce el estado HTTP %i a %s', (status, expected) => {
    expect(classifyAiProviderFailure({ status })).toBe(expected);
  });

  it('señala la falta de configuración del gateway de IA', () => {
    expect(
      classifyAiProviderFailure(
        new ServiceUnavailableException('The AI gateway is not configured.'),
      ),
    ).toBe('AI_GATEWAY_NOT_CONFIGURED');
  });

  it('traduce fallos de conexión por su nombre', () => {
    expect(
      classifyAiProviderFailure(
        Object.assign(new Error('timeout'), {
          name: 'APIConnectionTimeoutError',
        }),
      ),
    ).toBe('AI_PROVIDER_TIMEOUT');
    expect(
      classifyAiProviderFailure(
        Object.assign(new Error('sin red'), { name: 'APIConnectionError' }),
      ),
    ).toBe('AI_PROVIDER_UNREACHABLE');
  });

  it('no clasifica errores que no son del proveedor', () => {
    expect(classifyAiProviderFailure(new Error('database down'))).toBeNull();
    expect(
      classifyAiProviderFailure(
        new ServiceUnavailableException(
          'The chat store is temporarily unavailable.',
        ),
      ),
    ).toBeNull();
    expect(classifyAiProviderFailure(undefined)).toBeNull();
  });
});
