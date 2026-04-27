import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

interface AuthedRequest extends Request {
  user?: Record<string, unknown>;
}

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing admin token');
    }
    try {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const payload = jwt.verify(auth.slice(7), secret) as Record<string, unknown>;
      if (payload?.role !== 'admin') {
        throw new UnauthorizedException('Admin access required');
      }
      req.user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired admin token');
    }
  }
}
