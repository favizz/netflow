import { AnomalyNotificationService } from '../anomaly-notification.service';
import type { AnomalyItem } from '../anomaly.types';
import { NotificationService } from '../../notification/notification.service';
import { ResidentsService } from '../../admin/residents/residents.service';

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
    sendResidentNotification: jest.Mock;
    sendTelegram: jest.Mock;
  };
  let mockResidentsService: {
    findAdmins: jest.Mock;
  };

  beforeEach(() => {
    mockNotificationService = {
      sendResidentNotification: jest.fn().mockResolvedValue(undefined),
      sendTelegram: jest.fn().mockResolvedValue(undefined),
    };

    mockResidentsService = {
      findAdmins: jest.fn().mockResolvedValue([makeAdmin()]),
    };

    service = new AnomalyNotificationService(
      mockNotificationService as unknown as NotificationService,
      mockResidentsService as unknown as ResidentsService,
    );
  });

  describe('notifyResidentOfAnomaly', () => {
    it('calls sendResidentNotification with formatted subject and unit context', async () => {
      const anomaly = makeAnomaly({ anomalyType: 'mcb_trip' });
      await service.notifyResidentOfAnomaly(
        'resident@test.com',
        anomaly,
        'A-101',
      );

      expect(
        mockNotificationService.sendResidentNotification,
      ).toHaveBeenCalledWith(
        'resident@test.com',
        expect.stringContaining('MCB_TRIP'),
        anomaly.message,
      );
      expect(
        mockNotificationService.sendResidentNotification,
      ).toHaveBeenCalledWith(
        'resident@test.com',
        expect.stringContaining('A-101'),
        anomaly.message,
      );
    });

    it('resolves silently when sendResidentNotification throws', async () => {
      mockNotificationService.sendResidentNotification.mockRejectedValue(
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
        expect.stringContaining('JAILBREAK'),
      );
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
    it('sends a single message for one offline unit with duration', async () => {
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
      expect(messageBody).toContain('3 unit offline');
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
