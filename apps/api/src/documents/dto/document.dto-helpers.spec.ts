import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentUploadDto } from './create-document-upload.dto';
import { UpdateDocumentMetadataDto } from './update-document-metadata.dto';
import { ListDocumentsQueryDto } from './list-documents-query.dto';

describe('document DTO transformations', () => {
  it('normalizes multipart JSON and text fields before validation', async () => {
    const dto = plainToInstance(CreateDocumentUploadDto, {
      documentType: ' normative ',
      metadata: '{"scope":"local"}',
      moduleIds: '["30dd8519-3b3a-4e64-a7dc-2b82578eab95"]',
      title: ' Documento de prueba ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      documentType: 'NORMATIVE',
      metadata: { scope: 'local' },
      moduleIds: ['30dd8519-3b3a-4e64-a7dc-2b82578eab95'],
      title: 'Documento de prueba',
    });
  });

  it('rejects malformed JSON and normalizes optional update text', async () => {
    const malformed = plainToInstance(CreateDocumentUploadDto, {
      documentType: 'NORMATIVE',
      metadata: 'not-json',
      title: 'Documento de prueba',
    });
    const update = plainToInstance(UpdateDocumentMetadataDto, {
      documentType: ' resolution ',
      title: ' Documento actualizado ',
    });

    await expect(validate(malformed)).resolves.not.toHaveLength(0);
    await expect(validate(update)).resolves.toHaveLength(0);
    expect(update).toMatchObject({
      documentType: 'RESOLUTION',
      title: 'Documento actualizado',
    });
  });

  it('coerces bounded pagination parameters', async () => {
    const valid = plainToInstance(ListDocumentsQueryDto, {
      limit: '50',
      offset: '20',
      status: 'inactive',
    });
    const invalid = plainToInstance(ListDocumentsQueryDto, {
      limit: '101',
      offset: '-1',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.not.toHaveLength(0);
    expect(valid).toMatchObject({ limit: 50, offset: 20, status: 'inactive' });
  });
});
