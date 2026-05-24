import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { HealthService } from './admin/health.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: HealthService,
          useValue: { check: jest.fn() },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHealth()).toEqual({ overall: 'ok' });
    });
  });
});
