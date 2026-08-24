import { BadRequestException } from '@nestjs/common';

export interface ChatHistoryCursor {
  id: string;
  updatedAt: string;
}

const cursorPattern = /^[A-Za-z0-9_-]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidCursor(): never {
  throw new BadRequestException('The chat history cursor is invalid.');
}

export function decodeChatHistoryCursor(
  cursor: string | undefined,
): ChatHistoryCursor | null {
  if (!cursor) return null;

  if (cursor.length > 256 || !cursorPattern.test(cursor)) invalidCursor();

  let candidate: unknown;
  try {
    candidate = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    invalidCursor();
  }

  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !('id' in candidate) ||
    !('updatedAt' in candidate) ||
    typeof candidate.id !== 'string' ||
    typeof candidate.updatedAt !== 'string' ||
    !uuidPattern.test(candidate.id)
  ) {
    invalidCursor();
  }

  const updatedAt = new Date(candidate.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) invalidCursor();

  return { id: candidate.id, updatedAt: updatedAt.toISOString() };
}

export function encodeChatHistoryCursor(cursor: ChatHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
