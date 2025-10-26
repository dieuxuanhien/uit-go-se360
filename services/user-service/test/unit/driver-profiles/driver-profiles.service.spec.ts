import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DriverProfilesService } from '../../../src/driver-profiles/driver-profiles.service';
import { DriverProfilesRepository } from '../../../src/driver-profiles/driver-profiles.repository';
import { DatabaseService } from '../../../src/database/database.service';
import { CreateDriverProfileDto } from '../../../src/driver-profiles/dto/create-driver-profile.dto';

describe('DriverProfilesService', () => {
  let service: DriverProfilesService;
  let repository: DriverProfilesRepository;
  let prisma: DatabaseService;

  const mockDriverUser = {
    id: 'user-1',
    email: 'driver@test.com',
    role: 'DRIVER',
    firstName: 'John',
    lastName: 'Doe',
    phoneNumber: '+1234567890',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPassengerUser = {
    ...mockDriverUser,
    id: 'user-2',
    role: 'PASSENGER',
  };

  const mockCreateDto: CreateDriverProfileDto = {
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    vehicleYear: 2022,
    vehiclePlate: '51A-12345',
    vehicleColor: 'Silver',
    licenseNumber: 'DL123456789',
  };

  const mockDriverProfile = {
    id: 'profile-1',
    userId: 'user-1',
    ...mockCreateDto,
    approvalStatus: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: mockDriverUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverProfilesService,
        {
          provide: DriverProfilesRepository,
          useValue: {
            create: jest.fn(),
            findByUserId: jest.fn(),
            findByVehiclePlate: jest.fn(),
            findByLicenseNumber: jest.fn(),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DriverProfilesService>(DriverProfilesService);
    repository = module.get<DriverProfilesRepository>(DriverProfilesRepository);
    prisma = module.get<DatabaseService>(DatabaseService);
  });

  describe('createProfile', () => {
    it('should create driver profile successfully for DRIVER user', async () => {
      jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValue(mockDriverUser as any);
      jest.spyOn(repository, 'findByUserId').mockResolvedValue(null);
      jest.spyOn(repository, 'findByVehiclePlate').mockResolvedValue(null);
      jest.spyOn(repository, 'findByLicenseNumber').mockResolvedValue(null);
      jest
        .spyOn(repository, 'create')
        .mockResolvedValue(mockDriverProfile as any);

      const result = await service.createProfile('user-1', mockCreateDto);

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.approvalStatus).toBe('PENDING');
      expect(result.user).toBeDefined();
    });

    it('should throw ForbiddenException for PASSENGER users', async () => {
      jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValue(mockPassengerUser as any);

      await expect(
        service.createProfile('user-2', mockCreateDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if profile already exists for user', async () => {
      jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValue(mockDriverUser as any);
      jest
        .spyOn(repository, 'findByUserId')
        .mockResolvedValue(mockDriverProfile as any);

      await expect(
        service.createProfile('user-1', mockCreateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate vehicle plate', async () => {
      jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValue(mockDriverUser as any);
      jest.spyOn(repository, 'findByUserId').mockResolvedValue(null);
      jest
        .spyOn(repository, 'findByVehiclePlate')
        .mockResolvedValue(mockDriverProfile as any);

      await expect(
        service.createProfile('user-1', mockCreateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate license number', async () => {
      jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValue(mockDriverUser as any);
      jest.spyOn(repository, 'findByUserId').mockResolvedValue(null);
      jest.spyOn(repository, 'findByVehiclePlate').mockResolvedValue(null);
      jest
        .spyOn(repository, 'findByLicenseNumber')
        .mockResolvedValue(mockDriverProfile as any);

      await expect(
        service.createProfile('user-1', mockCreateDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getProfile', () => {
    it('should return profile for existing driver', async () => {
      jest
        .spyOn(repository, 'findByUserId')
        .mockResolvedValue(mockDriverProfile as any);

      const result = await service.getProfile('user-1');

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.user).toBeDefined();
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      jest.spyOn(repository, 'findByUserId').mockResolvedValue(null);

      await expect(service.getProfile('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
