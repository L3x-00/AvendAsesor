import { Transform } from 'class-transformer';

export const trimText = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export const uppercaseCode = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value,
);
