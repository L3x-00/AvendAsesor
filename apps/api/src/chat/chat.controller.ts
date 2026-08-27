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
import { ListChatConversationsQueryDto } from './dto/list-chat-conversations-query.dto';
import { StreamChatDto } from './dto/stream-chat.dto';

@Controller('chat')
@UseGuards(ThrottlerGuard, AuthorizationGuard, RolesGuard)
@RequireRoles('docente', 'admin', 'superadmin')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('modules')
  listModules() {
    return this.chatService.listModules();
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
    @Param('id', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ) {
    return this.chatService.getConversation(conversationId, authorization);
  }

  @Get('sources/:sourceId/download-url')
  createSourceDownloadUrl(
    @Param('sourceId', new ParseUUIDPipe({ version: '4' })) sourceId: string,
    @CurrentAuthorization() authorization: AuthorizationContext,
  ) {
    return this.chatService.createSourceDownloadUrl(sourceId, authorization);
  }

  @Delete('conversations/:id')
  deleteConversation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) conversationId: string,
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

    try {
      for await (const event of this.chatService.stream({
        abortSignal: abortController.signal,
        authorization,
        conversationId: dto.conversationId ?? null,
        question: dto.question,
        selectedModuleId: dto.moduleId ?? null,
      })) {
        if (abortController.signal.aborted) return;
        this.writeEvent(response, event);
      }
    } catch {
      if (!abortController.signal.aborted) {
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

  private writeEvent(
    response: Response,
    event: ChatStreamEvent | { data: { code: string }; type: 'error' },
  ): void {
    response.write(
      `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
    );
  }
}
