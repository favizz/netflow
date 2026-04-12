import { Injectable } from '@nestjs/common';
import { UnitService } from '../unit/unit.service';
import { PaymentsService } from '../payments/payments.service';

export interface AdminAccount {
  email: string;
  role: 'viewer' | 'operator' | 'super-admin';
  enabled: boolean;
  updatedAt: string;
}

@Injectable()
export class AdminService {
  private readonly accounts = new Map<string, AdminAccount>([
    [
      'ops@ta-flowmeter.local',
      {
        email: 'ops@ta-flowmeter.local',
        role: 'super-admin',
        enabled: true,
        updatedAt: new Date().toISOString(),
      },
    ],
  ]);

  constructor(
    private readonly unitService: UnitService,
    private readonly paymentsService: PaymentsService,
  ) {}

  listAccounts() {
    return [...this.accounts.values()].sort((a, b) => a.email.localeCompare(b.email));
  }

  updateAccount(email: string, payload: Partial<Pick<AdminAccount, 'enabled' | 'role'>>) {
    const current = this.accounts.get(email) || {
      email,
      role: 'viewer' as const,
      enabled: true,
      updatedAt: new Date().toISOString(),
    };

    const updated: AdminAccount = {
      ...current,
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    this.accounts.set(email, updated);
    return updated;
  }

  async getTransactions() {
    const rawTxs = await this.paymentsService.listAllTransactions();
    const units = await this.unitService.findAll();
    
    // Map unit_no to resident_email
    const unitMap = new Map(units.map(u => [u.unit_no, u.resident_email || 'Unassigned']));

    return rawTxs.map(tx => ({
      ...tx,
      user: unitMap.get(tx.unitNo) || 'Unassigned',
      date: tx.createdAt,
      type: 'Token Purchase', 
    }));
  }
}
