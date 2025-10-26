import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DriverProfilesController } from '../../../src/driver-profiles/driver-profiles.controller';
import { DriverProfilesService } from '../../../src/driver-profiles/driver-profiles.service';
import { CreateDriverProfileDto } from '../../../src/driver-profiles/dto/create-driver-profile.dto';
import { JwtPayload } from '../../../src/common/interfaces/jwt-payload.interface';

describe('DriverProfilesController', () => {
  let controller: DriverProfilesController;
  let service: DriverProfilesService;

  const mockDriverProfilesService = {
    createProfile: jest.fn(),
    getProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverProfilesController],
      providers: [
        {
          provide: DriverProfilesService,
          useValue: mockDriverProfilesService,
        },
      ],
    }).compile();

    controller = module.get<DriverProfilesController>(DriverProfilesController);
    service = module.get<DriverProfilesService>(DriverProfilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    const createProfileDto: CreateDriverProfileDto = {
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2022,
      vehiclePlate: 'ABC-123',
      vehicleColor: 'Black',
      licenseNumber: 'LIC-12345',
    };

    const mockProfile = {
      id: 'profile-123',
      userId: 'user-123',
      ...createProfileDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a driver profile for DRIVER role', async () => {
      const user: JwtPayload = {
        userId: 'user-123',
        email: 'driver@test.com',
        role: 'DRIVER',
      };
      mockDriverProfilesService.createProfile.mockResolvedValue(mockProfile);

      const result = await controller.createProfile(user, createProfileDto);

      expect(result).toEqual(mockProfile);
      expect(service.createProfile).toHaveBeenCalledWith(
        'user-123',
        createProfileDto,
      );
    });

    it('should throw ForbiddenException when user is not DRIVER', async () => {
      const user: JwtPayload = {
        userId: 'user-123',
        email: 'passenger@test.com',
        role: 'PASSENGER',
      };

      await expect(
        controller.createProfile(user, createProfileDto),
      ).rejects.toThrow(
        new ForbiddenException(
          'Only users with DRIVER role can create driver profiles',
        ),
      );

      expect(service.createProfile).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when role is undefined', async () => {
      const user = {
        userId: 'user-123',
        email: 'test@test.com',
        role: undefined,
      } as unknown as JwtPayload;

      await expect(
        controller.createProfile(user, createProfileDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getProfile', () => {
    const mockProfile = {
      id: 'profile-123',
      userId: 'user-123',
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2022,
      vehiclePlate: 'ABC-123',
      vehicleColor: 'Black',
      licenseNumber: 'LIC-12345',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should get driver profile for authenticated user', async () => {
      const user: JwtPayload = {
        userId: 'user-123',
        email: 'driver@test.com',
        role: 'DRIVER',
      };
      mockDriverProfilesService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getProfile(user);

      expect(result).toEqual(mockProfile);
      expect(service.getProfile).toHaveBeenCalledWith('user-123');
    });

    it('should get profile regardless of role', async () => {
      const user: JwtPayload = {
        userId: 'user-123',
        email: 'passenger@test.com',
        role: 'PASSENGER',
      };
      mockDriverProfilesService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getProfile(user);

      expect(result).toEqual(mockProfile);
      expect(service.getProfile).toHaveBeenCalledWith('user-123');
    });
  });
});
