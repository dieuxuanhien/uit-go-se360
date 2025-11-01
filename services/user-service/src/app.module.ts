import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DriverProfilesModule } from './driver-profiles/driver-profiles.module';
import { RatingsModule } from './ratings/ratings.module';
import { validationSchema } from './config/validation.schema';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema,
      load: [jwtConfig],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DriverProfilesModule,
    RatingsModule,
  ],
})
export class AppModule {}
