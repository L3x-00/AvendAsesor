import {
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { ConsultationAttachmentMulterExceptionFilter } from './consultation-attachment-multer.filter';

function createHost(): {
  host: ArgumentsHost;
  response: { json: jest.Mock; status: jest.Mock };
} {
  const response = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost,
    response,
  };
}

describe('ConsultationAttachmentMulterExceptionFilter', () => {
  const filter: ExceptionFilter =
    new ConsultationAttachmentMulterExceptionFilter();

  it('returns a bounded upload response when the attachment is too large', () => {
    const { host, response } = createHost();

    filter.catch(new MulterError('LIMIT_FILE_SIZE'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Payload Too Large',
      message: 'Los archivos adjuntos no pueden superar 10 MB.',
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  });

  it('does not disclose internals for another Multer validation failure', () => {
    const { host, response } = createHost();

    filter.catch(new MulterError('LIMIT_UNEXPECTED_FILE'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Bad Request',
      message: 'El archivo adjunto no es válido.',
      statusCode: HttpStatus.BAD_REQUEST,
    });
  });
});
