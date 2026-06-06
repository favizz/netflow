import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import { Repository } from 'typeorm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(AuthRefreshToken)
    private readonly refreshTokenRepo: Repository<AuthRefreshToken>,
  ) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Check if the user has an active session (non-revoked refresh token)
    // This handles session revocation (e.g. after logout)
    const activeSession = await this.refreshTokenRepo.findOne({
      where: {
        user_sub: payload.sub,
        revoked_at: null,
      },
    });

    if (!activeSession) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return payload;
  }
}
