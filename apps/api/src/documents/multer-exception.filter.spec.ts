import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { MulterError } from 'multer';
import { MulterExceptionFilter } from './multer-exception.filter';

describe('MulterExceptionFilter', () => {
  function expectMappedError(
    exception: MulterError,
    expectedStatus: HttpStatus,
    expectedError: string,
  ): void {
    const response = {
      json: jest.fn(),
      status: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new MulterExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(expectedStatus);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expectedError,
        statusCode: expectedStatus,
      }),
    );
  }

  it('maps file-size failures to a safe HTTP response', () => {
    expectMappedError(
      new MulterError('LIMIT_FILE_SIZE'),
      HttpStatus.PAYLOAD_TOO_LARGE,
      'Payload Too Large',
    );
  });

  it('maps other Multer failures to a safe HTTP response', () => {
    expectMappedError(
      new MulterError('LIMIT_UNEXPECTED_FILE'),
      HttpStatus.BAD_REQUEST,
      'Bad Request',
    );
  });
});
