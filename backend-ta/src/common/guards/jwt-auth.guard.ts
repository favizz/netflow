import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

interface AuthedRequest extends Request {
  user?: Record<string, unknown>;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }
    try {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      req.user = jwt.verify(auth.slice(7), secret) as Record<string, unknown>;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
