import {
  ArgumentsHost,
  Catch,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

@Catch(MulterError)
export class ConsultationAttachmentMulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const tooLarge = exception.code === 'LIMIT_FILE_SIZE';
    response.status(
      tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST,
    );
    response.json({
      error: tooLarge ? 'Payload Too Large' : 'Bad Request',
      message: tooLarge
        ? 'Los archivos adjuntos no pueden superar 10 MB.'
        : 'El archivo adjunto no es válido.',
      statusCode: tooLarge
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.BAD_REQUEST,
    });
  }
}
