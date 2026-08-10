import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [AuthorizationService, AuthorizationGuard, RolesGuard],
  exports: [AuthorizationService, AuthorizationGuard, RolesGuard],
})
export class AuthorizationModule {}
