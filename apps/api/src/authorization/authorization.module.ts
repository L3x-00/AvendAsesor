import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';
import { FeaturesGuard } from './features.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [
    AuthorizationService,
    AuthorizationGuard,
    FeaturesGuard,
    RolesGuard,
  ],
  exports: [
    AuthorizationService,
    AuthorizationGuard,
    FeaturesGuard,
    RolesGuard,
  ],
})
export class AuthorizationModule {}
