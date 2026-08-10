import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthService } from './auth.service';

@Module({
  imports: [SupabaseModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
