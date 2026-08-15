import { Transform } from 'class-transformer';

export const trimDocumentText = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export const uppercaseDocumentType = Transform(
  ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
);

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export const parseJsonArray = Transform(({ value }: { value: unknown }) =>
  parseJson(value),
);

export const parseJsonObject = Transform(({ value }: { value: unknown }) =>
  parseJson(value),
);
