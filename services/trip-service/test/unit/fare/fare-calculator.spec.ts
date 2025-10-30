import { Test, TestingModule } from '@nestjs/testing';
import { FareCalculatorService } from '../../../src/fare/fare-calculator.service';
import fareConfig from '../../../src/config/fare.config';

describe('FareCalculatorService', () => {
  let service: FareCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FareCalculatorService,
        {
          provide: fareConfig.KEY,
          useValue: {
            baseCents: 250,
            perKmCents: 120,
            minimumCents: 500,
            maximumCents: 20000,
          },
        },
      ],
    }).compile();

    service = module.get<FareCalculatorService>(FareCalculatorService);
  });

  describe('calculateDistance', () => {
    it('should calculate distance between HCMC District 1 and Tan Binh', () => {
      const distance = service.calculateDistance(
        10.762622,
        106.660172,
        10.823099,
        106.629662,
      );
      expect(distance).toBeGreaterThan(7);
      expect(distance).toBeLessThan(8);
    });

    it('should return 0 for same coordinates', () => {
      const distance = service.calculateDistance(10, 100, 10, 100);
      expect(distance).toBe(0);
    });

    it('should handle coordinates across international date line', () => {
      const distance = service.calculateDistance(0, 179, 0, -179);
      expect(distance).toBeGreaterThan(200);
      expect(distance).toBeLessThan(250); // ~222 km
    });

    it('should calculate distance from North pole to South pole', () => {
      const distance = service.calculateDistance(90, 0, -90, 0);
      expect(distance).toBeGreaterThan(20000);
      expect(distance).toBeLessThan(20050);
    });
  });

  describe('calculateEstimatedFare', () => {
    it('should calculate fare for 10 km trip', () => {
      const fare = service.calculateEstimatedFare(10);
      // 250 + (10 * 120) = 1450 cents
      expect(fare).toBe(1450);
    });

    it('should apply minimum fare for short trips', () => {
      const fare = service.calculateEstimatedFare(0.5);
      // Calculated: 250 + (0.5 * 120) = 310 cents
      // But minimum is 500 cents
      expect(fare).toBe(500);
    });

    it('should apply maximum fare cap', () => {
      const fare = service.calculateEstimatedFare(200);
      // Calculated: 250 + (200 * 120) = 24250 cents
      // But maximum is 20000 cents
      expect(fare).toBe(20000);
    });

    it('should return integer cents', () => {
      const fare = service.calculateEstimatedFare(1.5);
      // 250 + (1.5 * 120) = 430 cents, but minimum is 500
      expect(fare).toBe(500);
      expect(Number.isInteger(fare)).toBe(true);
    });

    it('should apply minimum fare for 0 km distance', () => {
      const fare = service.calculateEstimatedFare(0);
      expect(fare).toBe(500);
    });
  });

  describe('configuration loading', () => {
    it('should use custom base fare', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FareCalculatorService,
          {
            provide: fareConfig.KEY,
            useValue: {
              baseCents: 300,
              perKmCents: 120,
              minimumCents: 500,
              maximumCents: 20000,
            },
          },
        ],
      }).compile();

      const customService = module.get<FareCalculatorService>(
        FareCalculatorService,
      );
      const fare = customService.calculateEstimatedFare(10);
      // 300 + (10 * 120) = 1500 cents
      expect(fare).toBe(1500);
    });

    it('should use custom per-km rate', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FareCalculatorService,
          {
            provide: fareConfig.KEY,
            useValue: {
              baseCents: 250,
              perKmCents: 150,
              minimumCents: 500,
              maximumCents: 20000,
            },
          },
        ],
      }).compile();

      const customService = module.get<FareCalculatorService>(
        FareCalculatorService,
      );
      const fare = customService.calculateEstimatedFare(10);
      // 250 + (10 * 150) = 1750 cents
      expect(fare).toBe(1750);
    });

    it('should use custom minimum fare', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FareCalculatorService,
          {
            provide: fareConfig.KEY,
            useValue: {
              baseCents: 250,
              perKmCents: 120,
              minimumCents: 800,
              maximumCents: 20000,
            },
          },
        ],
      }).compile();

      const customService = module.get<FareCalculatorService>(
        FareCalculatorService,
      );
      const fare = customService.calculateEstimatedFare(0.5);
      // Calculated: 250 + (0.5 * 120) = 310 cents
      // But minimum is 800 cents
      expect(fare).toBe(800);
    });
  });
});
