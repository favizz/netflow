import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
<<<<<<< HEAD
import { UnitModule } from '../unit/unit.module';
import { ResidentsModule } from '../residents/residents.module';
=======
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../admin/entities/user.entity';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
<<<<<<< HEAD
    UnitModule,
    ResidentsModule,
    TypeOrmModule.forFeature([AuthRefreshToken]),
=======
    TypeOrmModule.forFeature([AuthRefreshToken, User]),
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
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
