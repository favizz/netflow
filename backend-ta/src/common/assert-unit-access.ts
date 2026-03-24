import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

export function assertUnitAccess(user: JwtPayload, unitNo: string) {
  if (user.role !== 'resident') {
    throw new ForbiddenException('Forbidden');
  }

  if (user.unitNo !== unitNo) {
    throw new ForbiddenException('Cannot access another unit');
  }
}
