import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError } from 'axios';
import { DriverServiceClient } from '../../../src/drivers/driver-service.client';
import driverNotificationConfig from '../../../src/config/driver-notification.config';
import { SearchDriversResponseDto } from '../../../src/drivers/dto/search-drivers-response.dto';

describe('DriverServiceClient', () => {
  let client: DriverServiceClient;
  let httpService: HttpService;

  const mockConfig = {
    driverServiceUrl: 'http://localhost:3003',
    requestTimeoutMs: 5000,
    maxRetries: 2,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forFeature(driverNotificationConfig)],
      providers: [
        DriverServiceClient,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: driverNotificationConfig.KEY,
          useValue: mockConfig,
        },
      ],
    }).compile();

    client = module.get<DriverServiceClient>(DriverServiceClient);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchNearbyDrivers', () => {
    const latitude = 10.762622;
    const longitude = 106.660172;
    const radius = 5;
    const limit = 5;

    it('should return SearchDriversResponseDto with drivers array', async () => {
      const mockResponse: SearchDriversResponseDto = {
        drivers: [
          {
            driverId: 'driver-1',
            latitude: 10.762,
            longitude: 106.66,
            distance: 1.5,
          },
          {
            driverId: 'driver-2',
            latitude: 10.763,
            longitude: 106.661,
            distance: 2.0,
          },
        ],
        searchRadius: 5,
        totalFound: 2,
      };

      const axiosResponse: AxiosResponse<SearchDriversResponseDto> = {
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(axiosResponse));

      const result = await client.searchNearbyDrivers(
        latitude,
        longitude,
        radius,
        limit,
      );

      expect(result).toEqual(mockResponse);
      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:3003/drivers/search',
        expect.objectContaining({
          params: { latitude, longitude, radius, limit },
          headers: expect.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
      );
    });

    it('should return SearchDriversResponseDto with empty drivers array', async () => {
      const mockResponse: SearchDriversResponseDto = {
        drivers: [],
        searchRadius: 5,
        totalFound: 0,
      };

      const axiosResponse: AxiosResponse<SearchDriversResponseDto> = {
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(axiosResponse));

      const result = await client.searchNearbyDrivers(
        latitude,
        longitude,
        radius,
        limit,
      );

      expect(result).toEqual(mockResponse);
      expect(result.drivers).toHaveLength(0);
    });

    it('should throw ServiceUnavailableException when DriverService returns 503', async () => {
      const axiosError: AxiosError = {
        message: 'Service Unavailable',
        name: 'AxiosError',
        response: {
          status: 503,
          data: { message: 'Service down' },
          statusText: 'Service Unavailable',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => axiosError));

      await expect(
        client.searchNearbyDrivers(latitude, longitude, radius, limit),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on request timeout', async () => {
      const timeoutError = new Error('Timeout');

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => timeoutError));

      await expect(
        client.searchNearbyDrivers(latitude, longitude, radius, limit),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should include correct request URL with query parameters', async () => {
      const mockResponse: SearchDriversResponseDto = {
        drivers: [],
        searchRadius: 5,
        totalFound: 0,
      };

      const axiosResponse: AxiosResponse<SearchDriversResponseDto> = {
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(axiosResponse));

      await client.searchNearbyDrivers(latitude, longitude, radius, limit);

      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:3003/drivers/search',
        expect.objectContaining({
          params: {
            latitude,
            longitude,
            radius,
            limit,
          },
        }),
      );
    });

    it('should include Authorization header in requests', async () => {
      const mockResponse: SearchDriversResponseDto = {
        drivers: [],
        searchRadius: 5,
        totalFound: 0,
      };

      const axiosResponse: AxiosResponse<SearchDriversResponseDto> = {
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(axiosResponse));

      await client.searchNearbyDrivers(latitude, longitude, radius, limit);

      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:3003/drivers/search',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        }),
      );
    });
  });
});
