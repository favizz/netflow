import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { Repository } from 'typeorm';
import { ResidentsService } from '../residents/residents.service';
import { UnitService } from '../unit/unit.service';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly unitService: UnitService,
    private readonly residentsService: ResidentsService,
    @InjectRepository(AuthRefreshToken)
    private readonly refreshTokenRepo: Repository<AuthRefreshToken>,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async devLogin(email: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Not available in production');
    }

    const resident = await this.residentsService.findByEmail(email);
    if (!resident) {
      throw new UnauthorizedException(
        'Email not registered. Contact administrator.',
      );
    }

    const units = await this.unitService.findByResidentEmail(email);
    const selectedUnit = units.length === 1 ? units[0] : null;

    const payload: JwtPayload = {
      sub: email,
      role: resident.role || 'resident',
      unitId: selectedUnit?.id ?? null,
      unitNo: selectedUnit?.unit_no ?? null,
    };

    const tokenPair = await this.issueTokenPair(payload);
    return {
      ...tokenPair,
      units: units.map((u) => ({ id: u.id, unitNo: u.unit_no })),
    };
  }

  async googleLogin(credential: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    let googleSub: string;
    let googleEmail: string;
    let googleName: string | null;
    let googlePicture: string | null;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.email) throw new Error('No email in token');
      googleSub = p.sub;
      googleEmail = p.email;
      googleName = p.name ?? null;
      googlePicture = p.picture ?? null;
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    const resident = await this.residentsService.findByEmail(googleEmail);
    if (!resident) {
      throw new UnauthorizedException(
        'Email not registered. Contact administrator.',
      );
    }

    if (!resident.google_id || resident.google_id !== googleSub) {
      await this.residentsService.updateProfile(googleEmail, {
        googleId: googleSub,
        name: googleName,
        picture: googlePicture,
      });
    }

    const units = await this.unitService.findByResidentEmail(googleEmail);
    const selectedUnit = units.length === 1 ? units[0] : null;

    const payload: JwtPayload = {
      sub: googleEmail,
      role: 'resident',
      unitId: selectedUnit?.id ?? null,
      unitNo: selectedUnit?.unit_no ?? null,
    };

    const tokenPair = await this.issueTokenPair(payload);
    return {
      ...tokenPair,
      units: units.map((u) => ({ id: u.id, unitNo: u.unit_no })),
    };
  }

  async selectUnit(user: JwtPayload, unitId: number) {
    const units = await this.unitService.findByResidentEmail(user.sub);
    const unit = units.find((u) => u.id === unitId);
    if (!unit)
      throw new ForbiddenException(
        'Unit not found or not assigned to your account',
      );

    const payload: JwtPayload = {
      sub: user.sub,
      role: 'resident',
      unitId: unit.id,
      unitNo: unit.unit_no,
    };

    const tokenPair = await this.issueTokenPair(payload);
    return {
      ...tokenPair,
      units: units.map((u) => ({ id: u.id, unitNo: u.unit_no })),
    };
  }

  async refresh(refreshToken: string) {
    const key = this.hashRefreshToken(refreshToken);
    const record = await this.refreshTokenRepo.findOne({
      where: { token_hash: key },
    });

    if (!record) throw new UnauthorizedException('Invalid refresh token');
    if (record.revoked_at)
      throw new UnauthorizedException('Refresh token already revoked');
    if (Date.now() > new Date(record.expires_at).getTime()) {
      record.revoked_at = new Date();
      await this.refreshTokenRepo.save(record);
      throw new UnauthorizedException('Refresh token expired');
    }

    record.revoked_at = new Date();
    await this.refreshTokenRepo.save(record);

    const resident = await this.residentsService.findByEmail(record.user_sub);
    const payload: JwtPayload = {
      sub: record.user_sub,
      role: resident?.role ?? 'resident',
      unitId: record.unit_id,
      unitNo: record.unit_no,
    };

    return this.issueTokenPair(payload);
  }

  async logout(user: JwtPayload, refreshToken?: string) {
    if (refreshToken) {
      const key = this.hashRefreshToken(refreshToken);
      const record = await this.refreshTokenRepo.findOne({
        where: { token_hash: key },
      });
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

  async adminGoogleLogin(credential: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    let googleSub: string;
    let googleEmail: string;
    let googleName: string | null;
    let googlePicture: string | null;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.email) throw new Error('No email in token');
      googleSub = p.sub;
      googleEmail = p.email;
      googleName = p.name ?? null;
      googlePicture = p.picture ?? null;
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    const resident = await this.residentsService.findByEmail(googleEmail);
    if (!resident || resident.role !== 'admin') {
      throw new UnauthorizedException(
        'Not authorized as admin. Contact the system administrator.',
      );
    }

    await this.residentsService.updateProfile(googleEmail, {
      googleId: googleSub,
      name: googleName,
      picture: googlePicture,
    });

    const payload: JwtPayload = {
      sub: googleEmail,
      role: 'admin',
      unitId: null,
      unitNo: null,
    };

    return this.issueTokenPair(payload);
  }

  async me(user: JwtPayload) {
    const units =
      user.role === 'admin'
        ? []
        : await this.unitService.findByResidentEmail(user.sub);
    return {
      email: user.sub,
      role: user.role,
      unitId: user.unitId,
      unitNo: user.unitNo,
      units: units.map((u) => ({ id: u.id, unitNo: u.unit_no })),
    };
  }

  private async issueTokenPair(payload: JwtPayload) {
    const accessExpiresInSeconds = Number(
      this.configService.get<string>('JWT_EXPIRES_IN_SECONDS') || 3600,
    );
    const refreshExpiresInSeconds = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS') ||
        604800,
    );

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiresInSeconds,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshKey = this.hashRefreshToken(refreshToken);

    const refreshEntity = this.refreshTokenRepo.create({
      token_hash: refreshKey,
      user_sub: payload.sub,
      unit_no: payload.unitNo ?? null,
      unit_id: payload.unitId ?? null,
      expires_at: new Date(Date.now() + refreshExpiresInSeconds * 1000),
      revoked_at: null,
    });
    await this.refreshTokenRepo.save(refreshEntity);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      unitNo: payload.unitNo,
      expiresIn: `${accessExpiresInSeconds}s`,
      refreshExpiresIn: `${refreshExpiresInSeconds}s`,
    };
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
