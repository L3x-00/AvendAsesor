import {
  ArgumentsHost,
  Catch,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isFileSizeError = exception.code === 'LIMIT_FILE_SIZE';

    response.status(
      isFileSizeError ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST,
    );
    response.json({
      error: isFileSizeError ? 'Payload Too Large' : 'Bad Request',
      message: isFileSizeError
        ? 'Documents cannot exceed 50 MiB.'
        : 'The uploaded file is invalid.',
      statusCode: isFileSizeError
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.BAD_REQUEST,
    });
  }
}
