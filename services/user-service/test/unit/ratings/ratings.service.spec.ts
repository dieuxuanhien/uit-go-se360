import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TripStatus, UserRole } from '@uit-go/shared-types';
import { RatingsService } from '../../../src/ratings/ratings.service';
import { RatingsRepository } from '../../../src/ratings/ratings.repository';
import { TripServiceClient } from '../../../src/integrations/trip-service.client';
import { CreateRatingDto } from '../../../src/ratings/dto/create-rating.dto';

describe('RatingsService', () => {
  let service: RatingsService;
  let ratingsRepository: jest.Mocked<RatingsRepository>;
  let tripServiceClient: jest.Mocked<TripServiceClient>;

  const mockTrip = {
    id: 'trip-123',
    passengerId: 'passenger-123',
    driverId: 'driver-456',
    status: TripStatus.COMPLETED,
  };

  const mockRating = {
    id: 'rating-123',
    tripId: 'trip-123',
    passengerId: 'passenger-123',
    driverId: 'driver-456',
    stars: 5,
    comment: 'Great driver!',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockRatingsRepository = {
      create: jest.fn(),
      findByTripId: jest.fn(),
    };

    const mockTripServiceClient = {
      getTripById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        {
          provide: RatingsRepository,
          useValue: mockRatingsRepository,
        },
        {
          provide: TripServiceClient,
          useValue: mockTripServiceClient,
        },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
    ratingsRepository = module.get(RatingsRepository);
    tripServiceClient = module.get(TripServiceClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submitRating', () => {
    it('should submit valid rating with 5 stars and comment', async () => {
      // Arrange
      const dto: CreateRatingDto = { stars: 5, comment: 'Great driver!' };
      tripServiceClient.getTripById.mockResolvedValue(mockTrip);
      ratingsRepository.findByTripId.mockResolvedValue(null);
      ratingsRepository.create.mockResolvedValue(mockRating);

      // Act
      const result = await service.submitRating(
        'trip-123',
        'passenger-123',
        dto,
      );

      // Assert
      expect(result).toEqual({
        id: 'rating-123',
        tripId: 'trip-123',
        passengerId: 'passenger-123',
        driverId: 'driver-456',
        stars: 5,
        comment: 'Great driver!',
        createdAt: mockRating.createdAt,
      });
      expect(tripServiceClient.getTripById).toHaveBeenCalledWith('trip-123');
      expect(ratingsRepository.findByTripId).toHaveBeenCalledWith('trip-123');
      expect(ratingsRepository.create).toHaveBeenCalledWith({
        tripId: 'trip-123',
        passengerId: 'passenger-123',
        driverId: 'driver-456',
        stars: 5,
        comment: 'Great driver!',
      });
    });

    it('should submit valid rating with 3 stars without comment', async () => {
      // Arrange
      const dto: CreateRatingDto = { stars: 3 };
      const ratingWithoutComment = { ...mockRating, stars: 3, comment: null };
      tripServiceClient.getTripById.mockResolvedValue(mockTrip);
      ratingsRepository.findByTripId.mockResolvedValue(null);
      ratingsRepository.create.mockResolvedValue(ratingWithoutComment);

      // Act
      const result = await service.submitRating(
        'trip-123',
        'passenger-123',
        dto,
      );

      // Assert
      expect(result.comment).toBeNull();
      expect(ratingsRepository.create).toHaveBeenCalledWith({
        tripId: 'trip-123',
        passengerId: 'passenger-123',
        driverId: 'driver-456',
        stars: 3,
        comment: null,
      });
    });

    it('should throw NotFoundException for non-existent trip', async () => {
      // Arrange
      const dto: CreateRatingDto = { stars: 5 };
      tripServiceClient.getTripById.mockRejectedValue(
        new NotFoundException('Trip not found'),
      );

      // Act & Assert
      await expect(
        service.submitRating('trip-123', 'passenger-123', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if passenger does not match trip passenger', async () => {
      // Arrange
      const dto: CreateRatingDto = { stars: 5 };
      const wrongTrip = { ...mockTrip, passengerId: 'different-passenger' };
      tripServiceClient.getTripById.mockResolvedValue(wrongTrip);

      // Act & Assert
      await expect(
        service.submitRating('trip-123', 'passenger-123', dto),
      ).rejects.toThrow("Only the trip's passenger can submit a rating");
    });

    it('should throw BadRequestException if trip status is not COMPLETED', async () => {
      // Arrange
      const dto: CreateRatingDto = { stars: 5 };
      const inProgressTrip = { ...mockTrip, status: TripStatus.IN_PROGRESS };
      tripServiceClient.getTripById.mockResolvedValue(inProgressTrip);

      // Act & Assert
      await expect(
        service.submitRating('trip-123', 'passenger-123', dto),
      ).rejects.toThrow(
        'Cannot rate trip that is not completed. Current status: IN_PROGRESS',
      );
    });

    it('should throw ConflictException if rating already exists', async () => {
      // Arrange
      const dto: CreateRatingDto = { stars: 5 };
      tripServiceClient.getTripById.mockResolvedValue(mockTrip);
      ratingsRepository.findByTripId.mockResolvedValue(mockRating);

      // Act & Assert
      await expect(
        service.submitRating('trip-123', 'passenger-123', dto),
      ).rejects.toThrow('Trip trip-123 has already been rated');
    });
  });

  describe('getRatingByTripId', () => {
    it('should return full RatingDto for passenger viewing their own rating', async () => {
      // Arrange
      tripServiceClient.getTripById.mockResolvedValue(mockTrip);
      ratingsRepository.findByTripId.mockResolvedValue(mockRating);

      // Act
      const result = await service.getRatingByTripId(
        'trip-123',
        'passenger-123',
        UserRole.PASSENGER,
      );

      // Assert
      expect(result).toEqual({
        id: 'rating-123',
        tripId: 'trip-123',
        passengerId: 'passenger-123',
        driverId: 'driver-456',
        stars: 5,
        comment: 'Great driver!',
        createdAt: mockRating.createdAt,
      });
      expect(tripServiceClient.getTripById).toHaveBeenCalledWith('trip-123');
      expect(ratingsRepository.findByTripId).toHaveBeenCalledWith('trip-123');
    });

    it('should return RatingDto without passengerId for driver viewing their trip rating', async () => {
      // Arrange
      tripServiceClient.getTripById.mockResolvedValue(mockTrip);
      ratingsRepository.findByTripId.mockResolvedValue(mockRating);

      // Act
      const result = await service.getRatingByTripId(
        'trip-123',
        'driver-456',
        UserRole.DRIVER,
      );

      // Assert
      expect(result).toEqual({
        id: 'rating-123',
        tripId: 'trip-123',
        driverId: 'driver-456',
        stars: 5,
        comment: 'Great driver!',
        createdAt: mockRating.createdAt,
      });
      expect(result.passengerId).toBeUndefined();
      expect(tripServiceClient.getTripById).toHaveBeenCalledWith('trip-123');
      expect(ratingsRepository.findByTripId).toHaveBeenCalledWith('trip-123');
    });

    it("should throw ForbiddenException if passenger attempts to view another passenger's rating", async () => {
      // Arrange
      const wrongTrip = { ...mockTrip, passengerId: 'different-passenger' };
      tripServiceClient.getTripById.mockResolvedValue(wrongTrip);

      // Act & Assert
      await expect(
        service.getRatingByTripId(
          'trip-123',
          'passenger-123',
          UserRole.PASSENGER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException if driver attempts to view another driver's rating", async () => {
      // Arrange
      const wrongTrip = { ...mockTrip, driverId: 'different-driver' };
      tripServiceClient.getTripById.mockResolvedValue(wrongTrip);

      // Act & Assert
      await expect(
        service.getRatingByTripId('trip-123', 'driver-456', UserRole.DRIVER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if trip does not exist', async () => {
      // Arrange
      tripServiceClient.getTripById.mockRejectedValue(
        new NotFoundException('Trip not found'),
      );

      // Act & Assert
      await expect(
        service.getRatingByTripId(
          'trip-123',
          'passenger-123',
          UserRole.PASSENGER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if no rating exists for trip', async () => {
      // Arrange
      tripServiceClient.getTripById.mockResolvedValue(mockTrip);
      ratingsRepository.findByTripId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getRatingByTripId(
          'trip-123',
          'passenger-123',
          UserRole.PASSENGER,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
