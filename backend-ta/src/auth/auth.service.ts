import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../admin/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuthRefreshToken)
    private readonly refreshTokenRepo: Repository<AuthRefreshToken>,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { username: dto.username } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.user_id,
      username: user.username,
      role: user.role,
    };

    return this.issueTokenPair(payload);
  }

  async refresh(refreshToken: string) {
    const key = this.hashRefreshToken(refreshToken);
    const record = await this.refreshTokenRepo.findOne({ where: { token_hash: key } });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revoked_at) {
      throw new UnauthorizedException('Refresh token already revoked');
    }

    if (Date.now() > new Date(record.expires_at).getTime()) {
      record.revoked_at = new Date();
      await this.refreshTokenRepo.save(record);
      throw new UnauthorizedException('Refresh token expired');
    }

    record.revoked_at = new Date();
    await this.refreshTokenRepo.save(record);

    const user = await this.userRepo.findOne({ where: { user_id: record.user_sub } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const payload: JwtPayload = {
      sub: user.user_id,
      username: user.username,
      role: user.role,
    };

    return this.issueTokenPair(payload);
  }

  async logout(user: JwtPayload, refreshToken?: string) {
    if (refreshToken) {
      const key = this.hashRefreshToken(refreshToken);
      const record = await this.refreshTokenRepo.findOne({ where: { token_hash: key } });
      if (record && record.user_sub === user.sub && !record.revoked_at) {
        record.revoked_at = new Date();
        await this.refreshTokenRepo.save(record);
      }
      return { loggedOut: true };
    }

    await this.refreshTokenRepo
      .createQueryBuilder()
      .update(AuthRefreshToken)
      .set({ revoked_at: new Date() })
      .where('user_sub = :userSub', { userSub: user.sub })
      .andWhere('revoked_at IS NULL')
      .execute();

    return { loggedOut: true };
  }

  me(user: JwtPayload) {
    return {
      username: user.username,
      role: user.role,
      userId: user.sub,
    };
  }

  private async issueTokenPair(payload: JwtPayload) {
    const accessExpiresInSeconds = Number(
      this.configService.get<string>('JWT_EXPIRES_IN_SECONDS') || 3600,
    );

    const refreshExpiresInSeconds = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS') || 604800,
    );

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiresInSeconds,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshKey = this.hashRefreshToken(refreshToken);

    const refreshEntity = this.refreshTokenRepo.create({
      token_hash: refreshKey,
      user_sub: payload.sub,
      username: payload.username,
      expires_at: new Date(Date.now() + refreshExpiresInSeconds * 1000),
      revoked_at: null,
    });
    await this.refreshTokenRepo.save(refreshEntity);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      username: payload.username,
      expiresIn: `${accessExpiresInSeconds}s`,
      refreshExpiresIn: `${refreshExpiresInSeconds}s`,
    };
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
