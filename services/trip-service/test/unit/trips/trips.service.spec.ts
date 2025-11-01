import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from '../../../src/trips/trips.service';
import { TripsRepository } from '../../../src/trips/trips.repository';
import { FareCalculatorService } from '../../../src/fare/fare-calculator.service';
import { DriverNotificationService } from '../../../src/notifications/driver-notification.service';
import { TripStatus, UserRole } from '@prisma/client';
import {
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TripDto } from '../../../src/trips/dto/trip.dto';
import { UserDto } from '../../../src/trips/dto/user.dto';

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

  const mockPassenger = {
    id: 'passenger-456',
    email: 'passenger@example.com',
    role: UserRole.PASSENGER,
    firstName: 'John',
    lastName: 'Doe',
    phoneNumber: '+84901234567',
  };

  const mockDriver = {
    id: 'driver-789',
    email: 'driver@example.com',
    role: UserRole.DRIVER,
    firstName: 'Jane',
    lastName: 'Smith',
    phoneNumber: '+84909876543',
  };

  const mockTripWithUsers = {
    ...mockTrip,
    passenger: mockPassenger,
    driver: null,
  };

  const mockTripWithDriver = {
    ...mockTrip,
    driverId: 'driver-789',
    status: TripStatus.DRIVER_ASSIGNED,
    driver: mockDriver,
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByPassengerId: jest.fn(),
      findByIdWithUsers: jest.fn(),
      updateStatus: jest.fn(),
    };

    const mockFareCalculator = {
      calculateDistance: jest.fn(),
      calculateEstimatedFare: jest.fn(),
    };

    const mockDriverNotificationService = {
      findAndNotifyDrivers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: TripsRepository, useValue: mockRepository },
        { provide: FareCalculatorService, useValue: mockFareCalculator },
        {
          provide: DriverNotificationService,
          useValue: mockDriverNotificationService,
        },
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

  describe('getTripById', () => {
    it('should return trip details for authorized passenger', async () => {
      repository.findByIdWithUsers.mockResolvedValue(mockTripWithUsers as any);

      const result = await service.getTripById(
        'trip-123',
        'passenger-456',
        'PASSENGER',
      );

      expect(result.id).toBe('trip-123');
      expect(result.passengerId).toBe('passenger-456');
      expect(result.passenger).toBeDefined();
      expect(result.passenger?.id).toBe('passenger-456');
      expect(result.driver).toBeNull();
    });

    it('should return trip details for authorized driver', async () => {
      repository.findByIdWithUsers.mockResolvedValue(mockTripWithDriver as any);

      const result = await service.getTripById(
        'trip-123',
        'driver-789',
        'DRIVER',
      );

      expect(result.id).toBe('trip-123');
      expect(result.driverId).toBe('driver-789');
      expect(result.driver).toBeDefined();
      expect(result.driver?.id).toBe('driver-789');
    });

    it('should throw NotFoundException if trip not found', async () => {
      repository.findByIdWithUsers.mockResolvedValue(null);

      await expect(
        service.getTripById('invalid-id', 'passenger-456', 'PASSENGER'),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if passenger tries to view another passenger's trip", async () => {
      repository.findByIdWithUsers.mockResolvedValue(mockTripWithUsers as any);

      await expect(
        service.getTripById('trip-123', 'other-passenger', 'PASSENGER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if driver tries to view unassigned trip', async () => {
      repository.findByIdWithUsers.mockResolvedValue(mockTripWithUsers as any);

      await expect(
        service.getTripById('trip-123', 'driver-789', 'DRIVER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if driver tries to view trip assigned to different driver', async () => {
      repository.findByIdWithUsers.mockResolvedValue(mockTripWithDriver as any);

      await expect(
        service.getTripById('trip-123', 'other-driver', 'DRIVER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should include all required fields in response', async () => {
      repository.findByIdWithUsers.mockResolvedValue(mockTripWithUsers as any);

      const result = await service.getTripById(
        'trip-123',
        'passenger-456',
        'PASSENGER',
      );

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('passengerId');
      expect(result).toHaveProperty('driverId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('pickupLatitude');
      expect(result).toHaveProperty('pickupLongitude');
      expect(result).toHaveProperty('pickupAddress');
      expect(result).toHaveProperty('destinationLatitude');
      expect(result).toHaveProperty('destinationLongitude');
      expect(result).toHaveProperty('destinationAddress');
      expect(result).toHaveProperty('estimatedFare');
      expect(result).toHaveProperty('actualFare');
      expect(result).toHaveProperty('estimatedDistance');
      expect(result).toHaveProperty('requestedAt');
      expect(result).toHaveProperty('driverAssignedAt');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
      expect(result).toHaveProperty('cancelledAt');
      expect(result).toHaveProperty('cancellationReason');
      expect(result).toHaveProperty('passenger');
      expect(result).toHaveProperty('driver');
    });
  });

  describe('startPickup', () => {
    const tripId = 'trip-123';
    const driverId = 'driver-789';
    const startedAt = new Date();

    it('should successfully start pickup for valid trip and driver', async () => {
      const assignedTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.DRIVER_ASSIGNED,
      };
      const updatedTripWithUsers = {
        ...assignedTrip,
        status: TripStatus.EN_ROUTE_TO_PICKUP,
        startedAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(assignedTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      const result = await service.startPickup(tripId, driverId);

      expect(result.status).toBe(TripStatus.EN_ROUTE_TO_PICKUP);
      expect(result.startedAt).toEqual(startedAt);
      expect(result.id).toBe(tripId);
      expect(result.driverId).toBe(driverId);
      expect(repository.findById).toHaveBeenCalledWith(tripId);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        tripId,
        TripStatus.EN_ROUTE_TO_PICKUP,
        { startedAt: expect.any(Date) },
      );
      expect(repository.findByIdWithUsers).toHaveBeenCalledWith(tripId);
    });

    it('should throw NotFoundException if trip does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.startPickup(tripId, driverId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findById).toHaveBeenCalledWith(tripId);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if trip status is not DRIVER_ASSIGNED', async () => {
      const invalidTrip = { ...mockTrip, status: TripStatus.REQUESTED };

      repository.findById.mockResolvedValue(invalidTrip as any);

      await expect(service.startPickup(tripId, driverId)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if different driver attempts to start', async () => {
      const assignedTrip = {
        ...mockTrip,
        driverId: 'different-driver',
        status: TripStatus.DRIVER_ASSIGNED,
      };

      repository.findById.mockResolvedValue(assignedTrip as any);

      await expect(service.startPickup(tripId, driverId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should call updateStatus with correct parameters', async () => {
      const assignedTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.DRIVER_ASSIGNED,
      };
      const updatedTripWithUsers = {
        ...assignedTrip,
        status: TripStatus.EN_ROUTE_TO_PICKUP,
        startedAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(assignedTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      await service.startPickup(tripId, driverId);

      expect(repository.updateStatus).toHaveBeenCalledWith(
        tripId,
        TripStatus.EN_ROUTE_TO_PICKUP,
        { startedAt: expect.any(Date) },
      );
    });
  });

  describe('arriveAtPickup', () => {
    const tripId = 'trip-123';
    const driverId = 'driver-789';
    const arrivedAt = new Date();

    it('should successfully mark arrival for valid trip and driver', async () => {
      const enRouteTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.EN_ROUTE_TO_PICKUP,
      };
      const updatedTripWithUsers = {
        ...enRouteTrip,
        status: TripStatus.ARRIVED_AT_PICKUP,
        arrivedAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(enRouteTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      const result = await service.arriveAtPickup(tripId, driverId);

      expect(result.status).toBe(TripStatus.ARRIVED_AT_PICKUP);
      expect(result.arrivedAt).toEqual(arrivedAt);
      expect(result.id).toBe(tripId);
      expect(result.driverId).toBe(driverId);
      expect(repository.findById).toHaveBeenCalledWith(tripId);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        tripId,
        TripStatus.ARRIVED_AT_PICKUP,
        { arrivedAt: expect.any(Date) },
      );
      expect(repository.findByIdWithUsers).toHaveBeenCalledWith(tripId);
    });

    it('should throw NotFoundException if trip does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.arriveAtPickup(tripId, driverId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findById).toHaveBeenCalledWith(tripId);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if trip status is not EN_ROUTE_TO_PICKUP', async () => {
      const invalidTrip = { ...mockTrip, status: TripStatus.DRIVER_ASSIGNED };

      repository.findById.mockResolvedValue(invalidTrip as any);

      await expect(service.arriveAtPickup(tripId, driverId)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if different driver attempts to mark arrival', async () => {
      const enRouteTrip = {
        ...mockTrip,
        driverId: 'different-driver',
        status: TripStatus.EN_ROUTE_TO_PICKUP,
      };

      repository.findById.mockResolvedValue(enRouteTrip as any);

      await expect(service.arriveAtPickup(tripId, driverId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should call updateStatus with correct parameters', async () => {
      const enRouteTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.EN_ROUTE_TO_PICKUP,
      };
      const updatedTripWithUsers = {
        ...enRouteTrip,
        status: TripStatus.ARRIVED_AT_PICKUP,
        arrivedAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(enRouteTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      await service.arriveAtPickup(tripId, driverId);

      expect(repository.updateStatus).toHaveBeenCalledWith(
        tripId,
        TripStatus.ARRIVED_AT_PICKUP,
        { arrivedAt: expect.any(Date) },
      );
    });

    it('should verify response includes updated status and timestamp', async () => {
      const enRouteTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.EN_ROUTE_TO_PICKUP,
      };
      const updatedTripWithUsers = {
        ...enRouteTrip,
        status: TripStatus.ARRIVED_AT_PICKUP,
        arrivedAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(enRouteTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      const result = await service.arriveAtPickup(tripId, driverId);

      expect(result.status).toBe(TripStatus.ARRIVED_AT_PICKUP);
      expect(result.arrivedAt).toBeDefined();
      expect(result.arrivedAt).toEqual(arrivedAt);
    });
  });

  describe('startActiveTrip', () => {
    const tripId = 'trip-123';
    const driverId = 'driver-789';
    const pickedUpAt = new Date();

    it('should successfully start active trip for valid trip and driver', async () => {
      const arrivedTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.ARRIVED_AT_PICKUP,
      };
      const updatedTripWithUsers = {
        ...arrivedTrip,
        status: TripStatus.IN_PROGRESS,
        pickedUpAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(arrivedTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      const result = await service.startActiveTrip(tripId, driverId);

      expect(result.status).toBe(TripStatus.IN_PROGRESS);
      expect(result.pickedUpAt).toEqual(pickedUpAt);
      expect(result.id).toBe(tripId);
      expect(result.driverId).toBe(driverId);
      expect(repository.findById).toHaveBeenCalledWith(tripId);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        tripId,
        TripStatus.IN_PROGRESS,
        { pickedUpAt: expect.any(Date) },
      );
      expect(repository.findByIdWithUsers).toHaveBeenCalledWith(tripId);
    });

    it('should throw NotFoundException if trip does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.startActiveTrip(tripId, driverId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findById).toHaveBeenCalledWith(tripId);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if trip status is not ARRIVED_AT_PICKUP', async () => {
      const invalidTrip = {
        ...mockTrip,
        status: TripStatus.EN_ROUTE_TO_PICKUP,
      };

      repository.findById.mockResolvedValue(invalidTrip as any);

      await expect(service.startActiveTrip(tripId, driverId)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if different driver attempts to start trip', async () => {
      const arrivedTrip = {
        ...mockTrip,
        driverId: 'different-driver',
        status: TripStatus.ARRIVED_AT_PICKUP,
      };

      repository.findById.mockResolvedValue(arrivedTrip as any);

      await expect(service.startActiveTrip(tripId, driverId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('should call updateStatus with correct parameters', async () => {
      const arrivedTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.ARRIVED_AT_PICKUP,
      };
      const updatedTripWithUsers = {
        ...arrivedTrip,
        status: TripStatus.IN_PROGRESS,
        pickedUpAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(arrivedTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      await service.startActiveTrip(tripId, driverId);

      expect(repository.updateStatus).toHaveBeenCalledWith(
        tripId,
        TripStatus.IN_PROGRESS,
        { pickedUpAt: expect.any(Date) },
      );
    });

    it('should verify response includes updated status and timestamp', async () => {
      const arrivedTrip = {
        ...mockTrip,
        driverId,
        status: TripStatus.ARRIVED_AT_PICKUP,
      };
      const updatedTripWithUsers = {
        ...arrivedTrip,
        status: TripStatus.IN_PROGRESS,
        pickedUpAt,
        passenger: mockPassenger,
        driver: mockDriver,
      };

      repository.findById.mockResolvedValue(arrivedTrip as any);
      repository.updateStatus.mockResolvedValue(undefined);
      repository.findByIdWithUsers.mockResolvedValue(
        updatedTripWithUsers as any,
      );

      const result = await service.startActiveTrip(tripId, driverId);

      expect(result.status).toBe(TripStatus.IN_PROGRESS);
      expect(result.pickedUpAt).toBeDefined();
      expect(result.pickedUpAt).toEqual(pickedUpAt);
    });
  });
});
