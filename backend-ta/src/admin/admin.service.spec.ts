/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { CalibrationSetting } from './entities/calibration-setting.entity';
import { Building } from './entities/building.entity';
import { UnitService } from '../unit/unit.service';
import { PaymentsService } from '../payments/payments.service';

describe('AdminService', () => {
  let service: AdminService;
  let mockMqttClient: any;
  let mockCalRepo: any;
  let mockUnitService: any;
  let mockPaymentsService: any;

  beforeEach(async () => {
    mockMqttClient = {
      emit: jest.fn(),
    };
    mockCalRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    mockUnitService = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockPaymentsService = {
      getTransactions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(CalibrationSetting),
          useValue: mockCalRepo,
        },
        {
          provide: getRepositoryToken(Building),
          useValue: { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) },
        },
        { provide: UnitService, useValue: mockUnitService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: 'MQTT_CLIENT', useValue: mockMqttClient },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pushConfigToDevice', () => {
    it('should emit a configuration via MQTT', async () => {
      await service.pushConfigToDevice('DEV-A-101');
      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/config',
        expect.any(Buffer),
      );
    });
  });

  describe('pushOtaToDevice', () => {
    it('should emit an OTA update via MQTT', () => {
      service.pushOtaToDevice('DEV-A-101', '1.0.0', 'http://link.bin');
      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/ota',
        expect.any(Buffer),
      );
    });
  });

  describe('sendCommand', () => {
    it('should emit a command via MQTT', () => {
      service.sendCommand('DEV-A-101', 'relay', 1);
      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });
  });
});
