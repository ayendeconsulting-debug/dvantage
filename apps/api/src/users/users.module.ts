import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UserProfileService } from './user-profile.service';
import { UserProfileController } from './user-profile.controller';

@Module({
  imports: [DatabaseModule],
  providers: [UserProfileService],
  controllers: [UserProfileController],
})
export class UsersModule {}
