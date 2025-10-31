import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from '../../../src/trips/trips.service';
import { TripsRepository } from '../../../src/trips/trips.repository';
import { FareCalculatorService } from '../../../src/fare/fare-calculator.service';
import { TripStatus } from '@prisma/client';
import { InternalServerErrorException } from '@nestjs/common';

describe('TripsService', () => {
  let service: TripsService;
  let repository: jest.Mocked<TripsRepository>;
  let fareCalculator: jest.Mocked<FareCalculatorService>;

  const mockTrip = {
    id: 'trip-123',
    passengerId: 'passenger-456',
    driverId: null,
    status: TripStatus.REQUESTED,
    pickupLatitude: 10.762622,
    pickupLongitude: 106.660172,
    pickupAddress: 'District 1, Ho Chi Minh City',
    destinationLatitude: 10.823099,
    destinationLongitude: 106.629662,
    destinationAddress: 'Tan Binh District, Ho Chi Minh City',
    estimatedFare: 1450,
    actualFare: null,
    estimatedDistance: 8.5,
    requestedAt: new Date(),
    driverAssignedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByPassengerId: jest.fn(),
    };

    const mockFareCalculator = {
      calculateDistance: jest.fn(),
      calculateEstimatedFare: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: TripsRepository, useValue: mockRepository },
        { provide: FareCalculatorService, useValue: mockFareCalculator },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
    repository = module.get(TripsRepository);
    fareCalculator = module.get(FareCalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTrip', () => {
    const createTripDto = {
      pickupLatitude: 10.762622,
      pickupLongitude: 106.660172,
      pickupAddress: 'District 1, Ho Chi Minh City',
      destinationLatitude: 10.823099,
      destinationLongitude: 106.629662,
      destinationAddress: 'Tan Binh District, Ho Chi Minh City',
    };

    it('should successfully create trip with correct data', async () => {
      fareCalculator.calculateDistance.mockReturnValue(8.5);
      fareCalculator.calculateEstimatedFare.mockReturnValue(1450);
      repository.create.mockResolvedValue(mockTrip as any);

      const result = await service.createTrip('passenger-456', createTripDto);

      expect(result.id).toBe('trip-123');
      expect(result.passengerId).toBe('passenger-456');
      expect(result.status).toBe(TripStatus.REQUESTED);
      expect(result.estimatedFare).toBe(1450);
      expect(result.estimatedDistance).toBe(8.5);
    });

    it('should call distance calculation with correct coordinates', async () => {
      fareCalculator.calculateDistance.mockReturnValue(8.5);
      fareCalculator.calculateEstimatedFare.mockReturnValue(1450);
      repository.create.mockResolvedValue(mockTrip as any);

      await service.createTrip('passenger-456', createTripDto);

      expect(fareCalculator.calculateDistance).toHaveBeenCalledWith(
        10.762622,
        106.660172,
        10.823099,
        106.629662,
      );
    });

    it('should call fare calculation with calculated distance', async () => {
      fareCalculator.calculateDistance.mockReturnValue(8.5);
      fareCalculator.calculateEstimatedFare.mockReturnValue(1450);
      repository.create.mockResolvedValue(mockTrip as any);

      await service.createTrip('passenger-456', createTripDto);

      expect(fareCalculator.calculateEstimatedFare).toHaveBeenCalledWith(8.5);
    });

    it('should create trip with status = REQUESTED', async () => {
      fareCalculator.calculateDistance.mockReturnValue(8.5);
      fareCalculator.calculateEstimatedFare.mockReturnValue(1450);
      repository.create.mockResolvedValue(mockTrip as any);

      await service.createTrip('passenger-456', createTripDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TripStatus.REQUESTED,
        }),
      );
    });

    it('should populate estimatedFare and estimatedDistance correctly', async () => {
      fareCalculator.calculateDistance.mockReturnValue(12.3);
      fareCalculator.calculateEstimatedFare.mockReturnValue(2000);
      repository.create.mockResolvedValue({
        ...mockTrip,
        estimatedDistance: 12.3,
        estimatedFare: 2000,
      } as any);

      const result = await service.createTrip('passenger-456', createTripDto);

      expect(result.estimatedDistance).toBe(12.3);
      expect(result.estimatedFare).toBe(2000);
    });

    it('should use passengerId from authenticated user', async () => {
      fareCalculator.calculateDistance.mockReturnValue(8.5);
      fareCalculator.calculateEstimatedFare.mockReturnValue(1450);
      repository.create.mockResolvedValue(mockTrip as any);

      await service.createTrip('custom-passenger-id', createTripDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          passengerId: 'custom-passenger-id',
        }),
      );
    });

    it('should throw InternalServerErrorException if repository fails', async () => {
      fareCalculator.calculateDistance.mockReturnValue(8.5);
      fareCalculator.calculateEstimatedFare.mockReturnValue(1450);
      repository.create.mockRejectedValue(new Error('Database error'));

      await expect(
        service.createTrip('passenger-456', createTripDto),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should map Trip entity to TripResponseDto correctly', async () => {
      fareCalculator.calculateDistance.mockReturnValue(8.5);
      fareCalculator.calculateEstimatedFare.mockReturnValue(1450);
      repository.create.mockResolvedValue(mockTrip as any);

      const result = await service.createTrip('passenger-456', createTripDto);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('passengerId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('pickupLatitude');
      expect(result).toHaveProperty('estimatedFare');
      expect(result).toHaveProperty('estimatedDistance');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });
  });
});
