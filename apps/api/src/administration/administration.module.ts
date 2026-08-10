import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdministrationController } from './administration.controller';

@Module({
  imports: [AuthorizationModule],
  controllers: [AdministrationController],
})
export class AdministrationModule {}
