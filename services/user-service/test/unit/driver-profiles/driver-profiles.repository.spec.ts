import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { DriverProfilesRepository } from '../../../src/driver-profiles/driver-profiles.repository';
import { DatabaseService } from '../../../src/database/database.service';

describe('DriverProfilesRepository', () => {
  let repository: DriverProfilesRepository;
  let _databaseService: DatabaseService;

  const mockDatabaseService = {
    driverProfile: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverProfilesRepository,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    repository = module.get<DriverProfilesRepository>(DriverProfilesRepository);
    _databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const mockData = {
      userId: 'user-123',
      vehicleType: 'SEDAN',
      vehiclePlate: 'ABC-123',
      vehicleColor: 'Black',
      licenseNumber: 'LIC-12345',
    };

    const mockProfile = {
      id: 'profile-123',
      ...mockData,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'DRIVER',
      },
    };

    it('should create a driver profile successfully', async () => {
      mockDatabaseService.driverProfile.create.mockResolvedValue(mockProfile);

      const result = await repository.create(mockData as any);

      expect(result).toEqual(mockProfile);
      expect(mockDatabaseService.driverProfile.create).toHaveBeenCalledWith({
        data: mockData,
        include: { user: true },
      });
    });

    it('should throw ConflictException when vehicle plate already exists', async () => {
      mockDatabaseService.driverProfile.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['vehicle_plate'] },
      });

      await expect(repository.create(mockData as any)).rejects.toThrow(
        new ConflictException('Vehicle plate already exists'),
      );
    });

    it('should throw ConflictException when license number already exists', async () => {
      mockDatabaseService.driverProfile.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['license_number'] },
      });

      await expect(repository.create(mockData as any)).rejects.toThrow(
        new ConflictException('License number already exists'),
      );
    });

    it('should throw ConflictException when driver profile already exists for user', async () => {
      mockDatabaseService.driverProfile.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['user_id'] },
      });

      await expect(repository.create(mockData as any)).rejects.toThrow(
        new ConflictException('Driver profile already exists for this user'),
      );
    });

    it('should throw original error when not a P2002 error', async () => {
      const originalError = new Error('Database connection failed');
      mockDatabaseService.driverProfile.create.mockRejectedValue(originalError);

      await expect(repository.create(mockData as any)).rejects.toThrow(
        originalError,
      );
    });
  });

  describe('findByUserId', () => {
    it('should find driver profile by user ID', async () => {
      const mockProfile = {
        id: 'profile-123',
        userId: 'user-123',
        vehicleType: 'SEDAN',
        user: { id: 'user-123', email: 'test@example.com' },
      };

      mockDatabaseService.driverProfile.findUnique.mockResolvedValue(
        mockProfile,
      );

      const result = await repository.findByUserId('user-123');

      expect(result).toEqual(mockProfile);
      expect(mockDatabaseService.driverProfile.findUnique).toHaveBeenCalledWith(
        {
          where: { userId: 'user-123' },
          include: { user: true },
        },
      );
    });

    it('should return null when profile not found', async () => {
      mockDatabaseService.driverProfile.findUnique.mockResolvedValue(null);

      const result = await repository.findByUserId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByVehiclePlate', () => {
    it('should find driver profile by vehicle plate', async () => {
      const mockProfile = {
        id: 'profile-123',
        vehiclePlate: 'ABC-123',
        vehicleType: 'SEDAN',
      };

      mockDatabaseService.driverProfile.findUnique.mockResolvedValue(
        mockProfile,
      );

      const result = await repository.findByVehiclePlate('ABC-123');

      expect(result).toEqual(mockProfile);
      expect(mockDatabaseService.driverProfile.findUnique).toHaveBeenCalledWith(
        {
          where: { vehiclePlate: 'ABC-123' },
        },
      );
    });

    it('should return null when plate not found', async () => {
      mockDatabaseService.driverProfile.findUnique.mockResolvedValue(null);

      const result = await repository.findByVehiclePlate('XYZ-999');

      expect(result).toBeNull();
    });
  });

  describe('findByLicenseNumber', () => {
    it('should find driver profile by license number', async () => {
      const mockProfile = {
        id: 'profile-123',
        licenseNumber: 'LIC-12345',
        vehicleType: 'SEDAN',
      };

      mockDatabaseService.driverProfile.findUnique.mockResolvedValue(
        mockProfile,
      );

      const result = await repository.findByLicenseNumber('LIC-12345');

      expect(result).toEqual(mockProfile);
      expect(mockDatabaseService.driverProfile.findUnique).toHaveBeenCalledWith(
        {
          where: { licenseNumber: 'LIC-12345' },
        },
      );
    });

    it('should return null when license not found', async () => {
      mockDatabaseService.driverProfile.findUnique.mockResolvedValue(null);

      const result = await repository.findByLicenseNumber('LIC-99999');

      expect(result).toBeNull();
    });
  });
});
