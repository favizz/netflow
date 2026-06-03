import { AnomalyNotificationService } from '../anomaly-notification.service';
import type { AnomalyItem } from '../anomaly.types';
import { NotificationService } from '../../notification/notification.service';
import { ResidentsService } from '../../admin/residents/residents.service';
import { ConfigService } from '@nestjs/config';

function makeAnomaly(overrides: Partial<AnomalyItem> = {}): AnomalyItem {
  return {
    anomalyType: 'voltage_anomaly',
    severity: 'warning',
    target: 'both',
    message: 'Test anomaly message',
    metadata: {},
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAdmin(chatId: string | null = 'admin-chat-123') {
  return {
    email: 'admin@test.com',
    google_id: null,
    name: 'Test Admin',
    picture: null,
    role: 'admin' as const,
    telegram_chat_id: chatId,
    created_at: new Date(),
  };
}

describe('AnomalyNotificationService', () => {
  let service: AnomalyNotificationService;
  let mockNotificationService: {
    sendHtmlNotification: jest.Mock;
    sendTelegram: jest.Mock;
  };
  let mockResidentsService: {
    findAdmins: jest.Mock;
    findByEmail: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    mockNotificationService = {
      sendHtmlNotification: jest.fn().mockResolvedValue(undefined),
      sendTelegram: jest.fn().mockResolvedValue(undefined),
    };

    mockResidentsService = {
      findAdmins: jest.fn().mockResolvedValue([makeAdmin()]),
      findByEmail: jest
        .fn()
        .mockResolvedValue({ name: 'Test Resident', telegram_chat_id: null }),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    service = new AnomalyNotificationService(
      mockNotificationService as unknown as NotificationService,
      mockResidentsService as unknown as ResidentsService,
      mockConfigService as unknown as ConfigService,
    );
  });

  describe('notifyResidentOfAnomaly', () => {
    it('calls sendHtmlNotification with subject containing the anomaly title and unit number', async () => {
      const anomaly = makeAnomaly({ anomalyType: 'mcb_trip' });
      await service.notifyResidentOfAnomaly(
        'resident@test.com',
        anomaly,
        'A-101',
      );

      expect(
        mockNotificationService.sendHtmlNotification,
      ).toHaveBeenCalledTimes(1);
      const [email, subject] = mockNotificationService.sendHtmlNotification.mock
        .calls[0] as string[];
      expect(email).toBe('resident@test.com');
      expect(subject).toContain('A-101');
      // Subject uses human-readable title, not type code
      expect(subject).toContain('Beban Listrik Melebihi Kapasitas MCB');
    });

    it('includes anomaly message data in the HTML email body', async () => {
      const anomaly = makeAnomaly({
        anomalyType: 'mcb_trip',
        message: 'Daya 1450 W',
      });
      await service.notifyResidentOfAnomaly(
        'resident@test.com',
        anomaly,
        'A-101',
      );

      const [, , htmlEmail] = mockNotificationService.sendHtmlNotification.mock
        .calls[0] as string[];
      expect(htmlEmail).toContain('Daya 1450 W');
    });

    it('includes per-type cause and action text in both email and telegram', async () => {
      const anomaly = makeAnomaly({ anomalyType: 'water_leak' });
      await service.notifyResidentOfAnomaly(
        'resident@test.com',
        anomaly,
        'B-202',
      );

      const [, , htmlEmail, telegramHtml] = mockNotificationService
        .sendHtmlNotification.mock.calls[0] as string[];
      expect(htmlEmail).toContain('Kemungkinan Penyebab');
      expect(htmlEmail).toContain('Tindakan yang Disarankan');
      expect(telegramHtml).toContain('Penyebab:');
      expect(telegramHtml).toContain('Tindakan:');
    });

    it('resolves silently when sendHtmlNotification throws', async () => {
      mockNotificationService.sendHtmlNotification.mockRejectedValue(
        new Error('SMTP failure'),
      );
      await expect(
        service.notifyResidentOfAnomaly(
          'resident@test.com',
          makeAnomaly(),
          'A-101',
        ),
      ).resolves.toBeUndefined();
    });

    it('enforces per-resident per-type cooldown and skips duplicate alerts', async () => {
      const anomaly = makeAnomaly({ anomalyType: 'low_electricity_token' });
      await service.notifyResidentOfAnomaly(
        'resident@test.com',
        anomaly,
        'A-101',
      );
      await service.notifyResidentOfAnomaly(
        'resident@test.com',
        anomaly,
        'A-101',
      );

      expect(
        mockNotificationService.sendHtmlNotification,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyAdminsOfAnomaly', () => {
    it('sends Telegram to all admins with telegram_chat_id on first call', async () => {
      const anomaly = makeAnomaly({
        anomalyType: 'jailbreak',
        severity: 'critical',
      });
      await service.notifyAdminsOfAnomaly(anomaly, 'A-101');

      expect(mockNotificationService.sendTelegram).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendTelegram).toHaveBeenCalledWith(
        'admin-chat-123',
        expect.stringContaining('A-101'),
      );
    });

    it('includes [Admin Alert] prefix and human-readable title in Telegram message', async () => {
      const anomaly = makeAnomaly({
        anomalyType: 'mcb_trip',
        severity: 'critical',
      });
      await service.notifyAdminsOfAnomaly(anomaly, 'A-101');

      const [, message] = mockNotificationService.sendTelegram.mock
        .calls[0] as string[];
      expect(message).toContain('[Admin Alert]');
      expect(message).toContain('Overcurrent MCB');
    });

    it('includes cause and action text in admin Telegram message', async () => {
      const anomaly = makeAnomaly({ anomalyType: 'usage_spike' });
      await service.notifyAdminsOfAnomaly(anomaly, 'A-101');

      const [, message] = mockNotificationService.sendTelegram.mock
        .calls[0] as string[];
      expect(message).toContain('Penyebab:');
      expect(message).toContain('Tindakan:');
    });

    it('respects admin alert cooldown and does not send duplicate alerts within cooldown window', async () => {
      const anomaly = makeAnomaly({ anomalyType: 'voltage_anomaly' });
      await service.notifyAdminsOfAnomaly(anomaly, 'A-101');
      await service.notifyAdminsOfAnomaly(anomaly, 'A-102');

      expect(mockNotificationService.sendTelegram).toHaveBeenCalledTimes(1);
    });

    it('fetches admin list only once within the cache expiry window', async () => {
      await service.notifyAdminsOfAnomaly(
        makeAnomaly({ anomalyType: 'mcb_trip' }),
        'A-101',
      );
      await service.notifyAdminsOfAnomaly(
        makeAnomaly({ anomalyType: 'water_leak' }),
        'A-102',
      );

      expect(mockResidentsService.findAdmins).toHaveBeenCalledTimes(1);
    });

    it('skips admins without a telegram_chat_id', async () => {
      mockResidentsService.findAdmins.mockResolvedValue([makeAdmin(null)]);
      await service.notifyAdminsOfAnomaly(makeAnomaly(), 'A-101');

      expect(mockNotificationService.sendTelegram).not.toHaveBeenCalled();
    });

    it('resolves silently when sendTelegram throws', async () => {
      mockNotificationService.sendTelegram.mockRejectedValue(
        new Error('Telegram API error'),
      );
      await expect(
        service.notifyAdminsOfAnomaly(makeAnomaly(), 'A-101'),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyAdminsOfOfflineUnits', () => {
    it('sends a single message for one offline unit containing duration', async () => {
      await service.notifyAdminsOfOfflineUnits([
        { unitNumber: 'A-101', offlineDurationMinutes: 15 },
      ]);

      expect(mockNotificationService.sendTelegram).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendTelegram).toHaveBeenCalledWith(
        'admin-chat-123',
        expect.stringContaining('A-101'),
      );
      expect(mockNotificationService.sendTelegram).toHaveBeenCalledWith(
        'admin-chat-123',
        expect.stringContaining('15 menit'),
      );
    });

    it('sends a batched summary for multiple offline units', async () => {
      await service.notifyAdminsOfOfflineUnits([
        { unitNumber: 'A-101', offlineDurationMinutes: 15 },
        { unitNumber: 'A-102', offlineDurationMinutes: 20 },
        { unitNumber: 'B-201', offlineDurationMinutes: 30 },
      ]);

      expect(mockNotificationService.sendTelegram).toHaveBeenCalledTimes(1);
      const [, messageBody] = mockNotificationService.sendTelegram.mock
        .calls[0] as [string, string];
      expect(messageBody).toContain('3 Unit Offline');
      expect(messageBody).toContain('A-101');
      expect(messageBody).toContain('A-102');
      expect(messageBody).toContain('B-201');
    });

    it('truncates the list and shows hidden count when more than 10 units are offline', async () => {
      const manyOfflineUnits = Array.from({ length: 12 }, (_, index) => ({
        unitNumber: `A-${101 + index}`,
        offlineDurationMinutes: 15,
      }));

      await service.notifyAdminsOfOfflineUnits(manyOfflineUnits);

      const [, messageBody] = mockNotificationService.sendTelegram.mock
        .calls[0] as [string, string];
      expect(messageBody).toContain('+2 lainnya');
    });

    it('does not send when offline unit list is empty', async () => {
      await service.notifyAdminsOfOfflineUnits([]);
      expect(mockNotificationService.sendTelegram).not.toHaveBeenCalled();
    });

    it('resolves silently when Telegram dispatch fails', async () => {
      mockNotificationService.sendTelegram.mockRejectedValue(
        new Error('Telegram timeout'),
      );
      await expect(
        service.notifyAdminsOfOfflineUnits([
          { unitNumber: 'A-101', offlineDurationMinutes: 15 },
        ]),
      ).resolves.toBeUndefined();
    });
  });
});
