/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException } from '@nestjs/common';
import type { ConsultationCasesGateway } from './consultation-cases.gateway';
import { ConsultationCasesService } from './consultation-cases.service';

const userId = '4c8b56af-6d0c-4fef-881e-7c00907540dd';
const caseId = '5c8b56af-6d0c-4fef-881e-7c00907540dd';
const answerMessageId = '6c8b56af-6d0c-4fef-881e-7c00907540dd';
const submissionId = '7c8b56af-6d0c-4fef-881e-7c00907540dd';

function createGateway(): jest.Mocked<ConsultationCasesGateway> {
  return {
    authorizeTeacherAttachment: jest.fn(),
    createAttachmentDownloadUrl: jest.fn(),
    createTeacherCase: jest.fn(),
    decideAttachment: jest.fn(),
    getCaseDetail: jest.fn(),
    getDashboard: jest.fn(),
    getReviewPriorities: jest.fn(),
    getTopics: jest.fn(),
    linkDocument: jest.fn(),
    listCases: jest.fn(),
    registerTeacherAttachment: jest.fn(),
    removeAttachment: jest.fn(),
    unlinkDocument: jest.fn(),
    updateCase: jest.fn(),
    uploadAttachment: jest.fn(),
  };
}

function createFile(): Express.Multer.File {
  const buffer = Buffer.from('imagen válida');
  return {
    buffer,
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: 'captura.png',
    mimetype: 'image/png',
    originalname: 'captura.png',
    path: '',
    size: buffer.length,
    stream: undefined as never,
  };
}

describe('ConsultationCasesService', () => {
  let attachments: { inspect: jest.Mock };
  let gateway: jest.Mocked<ConsultationCasesGateway>;
  let service: ConsultationCasesService;

  beforeEach(() => {
    gateway = createGateway();
    gateway.createTeacherCase.mockResolvedValue({ caseId });
    gateway.createAttachmentDownloadUrl.mockResolvedValue({
      expiresAt: '2026-09-05T00:01:00.000Z',
      url: 'https://example.test/attachment',
    });
    gateway.removeAttachment.mockResolvedValue(undefined);
    gateway.registerTeacherAttachment.mockResolvedValue({
      attachmentId: '8c8b56af-6d0c-4fef-881e-7c00907540dd',
    });
    attachments = {
      inspect: jest.fn().mockReturnValue({
        extension: 'png',
        fileSizeBytes: 13,
        mimeType: 'image/png',
        originalFileName: 'captura.png',
        sha256: 'a'.repeat(64),
      }),
    };
    service = new ConsultationCasesService(gateway, attachments);
  });

  it('creates a report with its canonical answer and no attachment when none is provided', async () => {
    attachments.inspect.mockReturnValue(null);

    await expect(
      service.createTeacherReport({
        answerMessageId,
        reason: 'answer_unclear',
        submissionId,
        userId,
      }),
    ).resolves.toEqual({ caseId });

    expect(gateway.createTeacherCase).toHaveBeenCalledWith({
      answerMessageId,
      comment: null,
      conversationId: null,
      kind: 'teacher_report',
      reportReason: 'answer_unclear',
      submissionId,
      userId,
    });
    expect(gateway.uploadAttachment).not.toHaveBeenCalled();
  });

  it('stores a validated attachment on a deterministic idempotent path', async () => {
    const file = createFile();
    await service.createTeacherSuggestion({
      comment: 'Sugiero revisar esta norma.',
      conversationId: caseId,
      file,
      submissionId,
      userId,
    });

    const storagePath = `${caseId}/${'a'.repeat(64)}.png`;
    expect(gateway.authorizeTeacherAttachment).toHaveBeenCalledWith({
      attachmentKind: 'suggestion_file',
      caseId,
      userId,
    });
    expect(gateway.uploadAttachment).toHaveBeenCalledWith({
      content: file.buffer,
      mimeType: 'image/png',
      storagePath,
    });
    expect(gateway.registerTeacherAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentKind: 'suggestion_file',
        caseId,
        storagePath,
        userId,
      }),
    );
  });

  it('removes an uploaded object when attachment registration fails', async () => {
    gateway.registerTeacherAttachment.mockRejectedValue(new Error('database'));

    await expect(
      service.createTeacherReport({
        answerMessageId,
        file: createFile(),
        reason: 'other',
        submissionId,
        userId,
      }),
    ).rejects.toThrow('database');

    expect(gateway.removeAttachment).toHaveBeenCalledWith(
      `${caseId}/${'a'.repeat(64)}.png`,
    );
  });

  it('rejects an empty administrative update and delegates governed actions', async () => {
    expect(() => service.updateCase({ caseId, reviewerId: userId })).toThrow(
      BadRequestException,
    );

    await service.updateCase({
      caseId,
      changeRouting: true,
      detectedModuleId: answerMessageId,
      detectedSubmoduleId: null,
      note: '  Ruta corregida.  ',
      reviewerId: userId,
      status: 'in_review',
    });
    await service.linkDocument(userId, caseId, answerMessageId);
    await service.unlinkDocument(userId, caseId, answerMessageId);
    await service.decideAttachment({
      attachmentId: answerMessageId,
      caseId,
      disposition: 'not_incorporated',
      note: 'No es fuente oficial.',
      reviewerId: userId,
    });
    await expect(
      service.createAttachmentDownloadUrl(
        userId,
        caseId,
        answerMessageId,
        'view',
      ),
    ).resolves.toMatchObject({ url: 'https://example.test/attachment' });

    expect(gateway.updateCase).toHaveBeenCalledWith(
      expect.objectContaining({
        changeRouting: true,
        note: 'Ruta corregida.',
        status: 'in_review',
      }),
    );
    expect(gateway.linkDocument).toHaveBeenCalled();
    expect(gateway.unlinkDocument).toHaveBeenCalled();
    expect(gateway.decideAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: null,
        note: 'No es fuente oficial.',
      }),
    );
    expect(gateway.createAttachmentDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ download: false }),
    );
  });
});
