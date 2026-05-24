import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitModule } from '../admin/unit/unit.module';
import { ResidentsModule } from '../admin/residents/residents.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UnitModule,
    ResidentsModule,
    TypeOrmModule.forFeature([AuthRefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'change-me-jwt-secret',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
