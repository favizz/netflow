import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

export function assertUnitAccess(user: JwtPayload, unitNo: string) {
  if (user.role === 'admin') return;

  if (user.unitNo !== unitNo) {
    throw new ForbiddenException('Cannot access another unit');
  }
}
