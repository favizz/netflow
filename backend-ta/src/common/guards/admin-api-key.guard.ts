import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { headers: Record<string, string | undefined> }>();
    const configured = this.configService.get<string>('ADMIN_API_KEY') || 'admin-local-key';

    const headerKey = request.headers['x-admin-key'];
    const auth = request.headers['authorization'];
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;

    const isAllowed = headerKey === configured || bearer === configured;
    if (!isAllowed) {
      throw new UnauthorizedException('Admin API key is required');
    }

    return true;
  }
}
