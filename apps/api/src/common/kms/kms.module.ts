import { Module } from '@nestjs/common';
import { KmsService } from './kms.service';

@Module({
  providers: [KmsService],
  exports: [KmsService],
})
export class KmsModule {}
