import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListDocumentLibraryQueryDto } from './list-document-library-query.dto';
import { SetDocumentSituationDto } from './set-document-situation.dto';

describe('document library DTOs', () => {
  it('normalizes safe library filters and rejects unsupported sort values', async () => {
    const valid = plainToInstance(ListDocumentLibraryQueryDto, {
      documentType: 'ley',
      issuanceYear: '2026',
      issuingEntity: '  Minedu  ',
      limit: '25',
      offset: '0',
      q: '  licencia docente  ',
      sort: 'newest',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toMatchObject({
      documentType: 'LEY',
      issuanceYear: 2026,
      issuingEntity: 'Minedu',
      limit: 25,
      offset: 0,
      q: 'licencia docente',
    });

    const invalid = plainToInstance(ListDocumentLibraryQueryDto, {
      limit: '101',
      q: 'a'.repeat(201),
      sort: 'drop table documents',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('accepts typed situation input while leaving cross-field rules to the service', async () => {
    const dto = plainToInstance(SetDocumentSituationDto, {
      observation: '  Cambio comunicado por la entidad  ',
      reason: '  Nueva norma aplicable  ',
      replacementDate: '2027-01-20',
      replacementDocumentId: 'ad2a52fd-21c8-4bd5-86f4-92f0188cb0fc',
      replacementYear: '2027',
      situation: 'replaced',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      observation: 'Cambio comunicado por la entidad',
      reason: 'Nueva norma aplicable',
      replacementYear: 2027,
      situation: 'replaced',
    });
  });

  it('normalizes blank optional values and rejects non-text filters', async () => {
    const blank = plainToInstance(ListDocumentLibraryQueryDto, {
      documentType: '   ',
      issuingEntity: '   ',
      q: '   ',
    });

    await expect(validate(blank)).resolves.toHaveLength(0);
    expect(blank).toMatchObject({
      documentType: undefined,
      issuingEntity: undefined,
      q: undefined,
    });

    const invalidTypes = plainToInstance(ListDocumentLibraryQueryDto, {
      issuingEntity: 42,
      q: 42,
    });
    expect(await validate(invalidTypes)).not.toHaveLength(0);
  });

  it('turns blank replacement identifiers into absent optional fields', async () => {
    const blank = plainToInstance(SetDocumentSituationDto, {
      replacementDate: '   ',
      replacementDocumentId: '   ',
      situation: 'current',
    });

    await expect(validate(blank)).resolves.toHaveLength(0);
    expect(blank.replacementDate).toBeUndefined();
    expect(blank.replacementDocumentId).toBeUndefined();

    const invalidTypes = plainToInstance(SetDocumentSituationDto, {
      replacementDate: 42,
      replacementDocumentId: 42,
      situation: 'replaced',
    });
    expect(await validate(invalidTypes)).not.toHaveLength(0);
  });
});
