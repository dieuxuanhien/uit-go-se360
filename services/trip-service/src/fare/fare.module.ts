import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FareCalculatorService } from './fare-calculator.service';
import fareConfig from '../config/fare.config';

@Module({
  imports: [ConfigModule.forFeature(fareConfig)],
  providers: [FareCalculatorService],
  exports: [FareCalculatorService],
})
export class FareModule {}
