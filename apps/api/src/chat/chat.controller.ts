import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  AuthorizationGuard,
  CurrentAuthorization,
  RequireRoles,
  RolesGuard,
  type AuthorizationContext,
} from '../authorization';
import type { ChatStreamEvent } from './chat.service';
import { ChatService } from './chat.service';
import { classifyStreamFailure } from './stream-failure';
import { ListChatConversationsQueryDto } from './dto/list-chat-conversations-query.dto';
import { StreamChatDto } from './dto/stream-chat.dto';
import { SourceDownloadQueryDto } from './dto/source-download-query.dto';

@Controller('chat')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@RequireRoles('docente', 'admin', 'superadmin')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('modules')
  listModules() {
    return this.chatService.listModules();
  }

  /** Consultas propias ya resueltas por la administración (últimos 30 días). */
  @Get('updates')
  listUpdates(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.chatService.listUpdates(authorization);
  }

  /** Panorama del tema abierto: sus documentos con un resumen corto. */
  @Get('modules/:moduleId/overview')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  moduleOverview(
    // Cualquier versión de UUID: el seed de demostración usa UUID v5.
    @Param('moduleId', new ParseUUIDPipe()) moduleId: string,
  ) {
    return this.chatService.moduleOverview(moduleId);
  }

  @Get('conversations')
  listConversations(
    @Query() dto: ListChatConversationsQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ) {
    return this.chatService.listConversations(
      dto.limit,
      dto.cursor,
      authorization,
    );
  }

  @Get('conversations/:id')
  getConversation(
    @Param('id', new ParseUUIDPipe()) conversationId: string,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ) {
    return this.chatService.getConversation(conversationId, authorization);
  }

  @Get('sources/:sourceId/download-url')
  createSourceDownloadUrl(
    @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
    @Query() query: SourceDownloadQueryDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ) {
    return this.chatService.createSourceDownloadUrl(
      sourceId,
      authorization,
      query.disposition ?? 'inline',
    );
  }

  @Delete('conversations/:id')
  deleteConversation(
    @Param('id', new ParseUUIDPipe()) conversationId: string,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ) {
    return this.chatService.deleteConversation(conversationId, authorization);
  }

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async stream(
    @Body() dto: StreamChatDto,
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Res() response: Response,
  ): Promise<void> {
    const abortController = new AbortController();
    const onClose = () => {
      if (!response.writableEnded) abortController.abort();
    };

    response.once('close', onClose);
    response.status(HttpStatus.OK);
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    let startedTurn:
      { conversationId: string; userMessageId: string } | undefined;
    try {
      for await (const event of this.chatService.stream({
        abortSignal: abortController.signal,
        authorization,
        conversationId: dto.conversationId ?? null,
        question: dto.question,
        selectedModuleId: dto.moduleId ?? null,
      })) {
        if (abortController.signal.aborted) return;
        if (event.type === 'conversation') {
          startedTurn = {
            conversationId: event.data.conversationId,
            userMessageId: event.data.userMessageId,
          };
        }
        this.writeEvent(response, event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        if (startedTurn) {
          try {
            await this.chatService.recordTechnicalFailure(
              {
                ...startedTurn,
                errorCode: this.streamFailureCode(error),
              },
              authorization,
            );
          } catch {
            // The user receives a generic failure either way; an unavailable
            // quality queue must not reveal internal persistence details.
          }
        }
        this.writeEvent(response, {
          data: { code: 'CHAT_STREAM_FAILED' },
          type: 'error',
        });
      }
    } finally {
      response.removeListener('close', onClose);
      if (!response.writableEnded) response.end();
    }
  }

  private streamFailureCode(error: unknown): string {
    return classifyStreamFailure(error);
  }

  private writeEvent(
    response: Response,
    event: ChatStreamEvent | { data: { code: string }; type: 'error' },
  ): void {
    response.write(
      `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
    );
  }
}
