import { BadRequestException } from '@nestjs/common';
import {
  decodeChatHistoryCursor,
  encodeChatHistoryCursor,
} from './chat-history-cursor';

describe('chat history cursor', () => {
  const value = {
    id: '9c8b56af-6d0c-4fef-881e-7c00907540dd',
    updatedAt: '2026-08-23T00:00:00.000Z',
  };

  it('round-trips an opaque, URL-safe keyset cursor', () => {
    expect(decodeChatHistoryCursor(encodeChatHistoryCursor(value))).toEqual(
      value,
    );
  });

  it.each(['not base64!', 'e30', 'x'.repeat(257)])(
    'rejects an invalid cursor',
    (cursor) => {
      expect(() => decodeChatHistoryCursor(cursor)).toThrow(
        BadRequestException,
      );
    },
  );
});
