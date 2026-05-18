/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import { ResidentsService } from '../residents/residents.service';
import { UnitService } from '../unit/unit.service';

function makeResident(overrides: Partial<any> = {}) {
  return { email: 'user@test.com', role: 'resident', google_id: null, name: null, picture: null, ...overrides };
}

function makeUnit(overrides: Partial<any> = {}) {
  return { id: 1, unit_no: 'A-101', ...overrides };
}

function makeRefreshRecord(overrides: Partial<any> = {}) {
  return {
    token_hash: 'hashed',
    user_sub: 'user@test.com',
    revoked_at: null,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let refreshTokenRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; createQueryBuilder: jest.Mock };
  let residentsService: { findByEmail: jest.Mock; updateProfile: jest.Mock };
  let unitService: { findByResidentEmail: jest.Mock; findOne: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    refreshTokenRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
    };

    residentsService = {
      findByEmail: jest.fn(),
      updateProfile: jest.fn().mockResolvedValue(undefined),
    };

    unitService = {
      findByResidentEmail: jest.fn().mockResolvedValue([makeUnit()]),
      findOne: jest.fn(),
    };

    jwtService = { signAsync: jest.fn().mockResolvedValue('mock.jwt.token') };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'test-client-id';
        if (key === 'JWT_EXPIRES_IN_SECONDS') return '3600';
        if (key === 'JWT_REFRESH_EXPIRES_IN_SECONDS') return '604800';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: UnitService, useValue: unitService },
        { provide: ResidentsService, useValue: residentsService },
        { provide: getRepositoryToken(AuthRefreshToken), useValue: refreshTokenRepo },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── devLogin ──────────────────────────────────────────────────────────────────

  describe('devLogin', () => {
    const OLD_ENV = process.env;

    beforeEach(() => { process.env = { ...OLD_ENV, NODE_ENV: 'development' }; });
    afterEach(() => { process.env = OLD_ENV; });

    it('returns tokens for a registered resident', async () => {
      residentsService.findByEmail.mockResolvedValue(makeResident());

      const result = await service.devLogin('user@test.com');
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.refreshToken).toBeDefined();
    });

    it('throws UnauthorizedException for unregistered email', async () => {
      residentsService.findByEmail.mockResolvedValue(null);
      await expect(service.devLogin('unknown@test.com')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException in production', async () => {
      process.env.NODE_ENV = 'production';
      await expect(service.devLogin('user@test.com')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── selectUnit ────────────────────────────────────────────────────────────────

  describe('selectUnit', () => {
    it('issues new tokens with selected unit in payload', async () => {
      unitService.findByResidentEmail.mockResolvedValue([makeUnit({ id: 2, unit_no: 'B-201' })]);
      const user = { sub: 'user@test.com', role: 'resident' as const, unitId: null, unitNo: null };

      const result = await service.selectUnit(user, 2);
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.unitNo).toBe('B-201');
    });

    it('throws ForbiddenException when unit is not assigned to user', async () => {
      unitService.findByResidentEmail.mockResolvedValue([makeUnit({ id: 1 })]);
      const user = { sub: 'user@test.com', role: 'resident' as const, unitId: null, unitNo: null };

      await expect(service.selectUnit(user, 99)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── refresh ───────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('revokes old token and issues new token pair', async () => {
      const record = makeRefreshRecord();
      refreshTokenRepo.findOne.mockResolvedValue(record);
      residentsService.findByEmail.mockResolvedValue(makeResident());

      const result = await service.refresh('some-refresh-token');
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(record.revoked_at).toBeDefined();
    });

    it('throws UnauthorizedException for unknown refresh token', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);
      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for already-revoked token', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(makeRefreshRecord({ revoked_at: new Date() }));
      await expect(service.refresh('revoked-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired token', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(
        makeRefreshRecord({ expires_at: new Date(Date.now() - 1000) }),
      );
      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes the specific refresh token when provided', async () => {
      const record = makeRefreshRecord();
      refreshTokenRepo.findOne.mockResolvedValue(record);
      const user = { sub: 'user@test.com', role: 'resident' as const, unitId: 1, unitNo: 'A-101' };

      const result = await service.logout(user, 'some-token');
      expect(result).toEqual({ loggedOut: true });
      expect(record.revoked_at).toBeDefined();
    });

    it('revokes all tokens when no refresh token provided', async () => {
      const user = { sub: 'user@test.com', role: 'resident' as const, unitId: 1, unitNo: 'A-101' };
      const result = await service.logout(user);
      expect(result).toEqual({ loggedOut: true });
      expect(refreshTokenRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  // ── me ────────────────────────────────────────────────────────────────────────

  describe('me', () => {
    it('returns user info with assigned units', async () => {
      unitService.findByResidentEmail.mockResolvedValue([makeUnit()]);
      const user = { sub: 'user@test.com', role: 'resident' as const, unitId: 1, unitNo: 'A-101' };

      const result = await service.me(user);
      expect(result.email).toBe('user@test.com');
      expect(result.units).toHaveLength(1);
    });

    it('returns empty units array for admin users', async () => {
      const user = { sub: 'admin@test.com', role: 'admin' as const, unitId: null, unitNo: null };
      const result = await service.me(user);
      expect(result.units).toHaveLength(0);
      expect(unitService.findByResidentEmail).not.toHaveBeenCalled();
    });
  });
});
