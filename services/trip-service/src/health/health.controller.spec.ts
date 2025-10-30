import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            checkConnection: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkHealth', () => {
    it('should return healthy status when database is connected', async () => {
      jest.spyOn(prismaService, 'checkConnection').mockResolvedValue(true);

      const result = await controller.checkHealth();

      expect(result).toHaveProperty('status', 'healthy');
      expect(result).toHaveProperty('service', 'trip-service');
      expect(result).toHaveProperty('version', '1.0.0');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('database', 'connected');
      expect(prismaService.checkConnection).toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException when database connection fails', async () => {
      jest.spyOn(prismaService, 'checkConnection').mockResolvedValue(false);

      await expect(controller.checkHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prismaService.checkConnection).toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException when database throws error', async () => {
      jest
        .spyOn(prismaService, 'checkConnection')
        .mockRejectedValue(new Error('Connection failed'));

      await expect(controller.checkHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should include correct fields in response', async () => {
      jest.spyOn(prismaService, 'checkConnection').mockResolvedValue(true);

      const result = await controller.checkHealth();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('service');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('database');
    });
  });
});
