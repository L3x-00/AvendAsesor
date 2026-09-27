import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { classifyStreamFailure } from './stream-failure';

describe('classifyStreamFailure', () => {
  it('prioriza la causa del proveedor de IA', () => {
    expect(classifyStreamFailure({ status: 402 })).toBe('AI_PROVIDER_CREDITS');
    expect(
      classifyStreamFailure(
        new ServiceUnavailableException('The AI gateway is not configured.'),
      ),
    ).toBe('AI_GATEWAY_NOT_CONFIGURED');
    expect(
      classifyStreamFailure(
        new ServiceUnavailableException(
          'The RAG answer provider returned no answer.',
        ),
      ),
    ).toBe('AI_PROVIDER_EMPTY_ANSWER');
  });

  it('distingue la fase de persistencia del turno', () => {
    expect(
      classifyStreamFailure(
        new ConflictException('The chat request conflicts with current data.'),
      ),
    ).toBe('CHAT_PERSISTENCE_CONFLICT');
    expect(
      classifyStreamFailure(
        new NotFoundException('The requested chat resource was not found.'),
      ),
    ).toBe('CHAT_TURN_NOT_FOUND');
    expect(
      classifyStreamFailure(
        new BadRequestException('The chat request is invalid.'),
      ),
    ).toBe('CHAT_TURN_REJECTED');
    expect(
      classifyStreamFailure(
        new ForbiddenException('The chat request is not authorized.'),
      ),
    ).toBe('CHAT_NOT_AUTHORIZED');
    expect(
      classifyStreamFailure(
        new ServiceUnavailableException(
          'The chat store is temporarily unavailable.',
        ),
      ),
    ).toBe('CHAT_STORE_UNAVAILABLE');
  });

  it('usa el código genérico cuando no reconoce la causa', () => {
    expect(classifyStreamFailure(new Error('unexpected'))).toBe(
      'CHAT_STREAM_FAILED',
    );
    expect(classifyStreamFailure(undefined)).toBe('CHAT_STREAM_FAILED');
  });
});
