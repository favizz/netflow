import { Injectable } from '@nestjs/common';

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
}
