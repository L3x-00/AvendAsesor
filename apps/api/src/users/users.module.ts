import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { UsersService } from './users.service';

@Module({
  imports: [SupabaseModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
