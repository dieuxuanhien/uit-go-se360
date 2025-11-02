import {
  Injectable,
  ServiceUnavailableException,
  Logger,
  Inject,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom, retry, timeout, catchError } from 'rxjs';
import { AxiosError } from 'axios';
import driverNotificationConfig from '../config/driver-notification.config';
import { SearchDriversResponseDto } from './dto/search-drivers-response.dto';

@Injectable()
export class DriverServiceClient {
  private readonly logger = new Logger(DriverServiceClient.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject(driverNotificationConfig.KEY)
    private readonly config: ConfigType<typeof driverNotificationConfig>,
  ) {}

  async searchNearbyDrivers(
    latitude: number,
    longitude: number,
    radius: number,
    limit: number,
  ): Promise<SearchDriversResponseDto> {
    const url = `${this.config.driverServiceUrl}/drivers/search`;
    const params = { latitude, longitude, radius, limit };

    this.logger.log('Searching nearby drivers', {
      url,
      latitude,
      longitude,
      radius,
      limit,
    });

    try {
      // Include Authorization header for inter-service authentication
      const headers = {
        Authorization: `Bearer ${this.config.serviceJwtToken || ''}`,
      };

      const response = await firstValueFrom(
        this.httpService
          .get<SearchDriversResponseDto>(url, { params, headers })
          .pipe(
            timeout(this.config.requestTimeoutMs),
            retry(this.config.maxRetries),
            catchError((error: AxiosError) => {
              this.logger.error('Driver service request failed', {
                url,
                error: error.message,
                status: error.response?.status,
                data: error.response?.data,
              });
              throw new ServiceUnavailableException(
                'Driver service is currently unavailable. Please try again later.',
              );
            }),
          ),
      );

      this.logger.log('Driver search successful', {
        radius,
        driversFound: response.data.totalFound,
      });

      return response.data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error('Unexpected error during driver search', {
        error: error instanceof Error ? error.message : 'Unknown error',
        latitude,
        longitude,
        radius,
      });

      throw new ServiceUnavailableException(
        'Failed to search for nearby drivers',
      );
    }
  }

  async updateDriverStatus(
    driverId: string,
    status: 'online' | 'offline' | 'on_trip',
  ): Promise<void> {
    const url = `${this.config.driverServiceUrl}/drivers/${driverId}/status`;

    this.logger.log('Updating driver status', { driverId, status, url });

    try {
      const headers = {
        Authorization: `Bearer ${this.config.serviceJwtToken || ''}`,
      };

      await firstValueFrom(
        this.httpService.put(url, { status }, { headers }).pipe(
          timeout(this.config.requestTimeoutMs),
          retry(this.config.maxRetries),
          catchError((error: AxiosError) => {
            this.logger.error('Failed to update driver status', {
              driverId,
              status,
              url,
              error: error.message,
              statusCode: error.response?.status,
              data: error.response?.data,
            });
            throw new ServiceUnavailableException(
              `DriverService unavailable: ${error.message}`,
            );
          }),
        ),
      );

      this.logger.log('Driver status updated successfully', {
        driverId,
        status,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error('Unexpected error updating driver status', {
        driverId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ServiceUnavailableException('Failed to update driver status');
    }
  }

  async getDriverLocation(driverId: string): Promise<any> {
    const url = `${this.config.driverServiceUrl}/drivers/${driverId}/location`;

    this.logger.log('Getting driver location', { driverId, url });

    try {
      // No authorization header needed for this endpoint
      const response = await firstValueFrom(
        this.httpService.get(url).pipe(
          timeout(this.config.requestTimeoutMs),
          retry(this.config.maxRetries),
          catchError((error: AxiosError) => {
            this.logger.error('Failed to get driver location', {
              driverId,
              url,
              error: error.message,
              statusCode: error.response?.status,
              data: error.response?.data,
            });
            throw new ServiceUnavailableException(
              `DriverService unavailable: ${error.message}`,
            );
          }),
        ),
      );

      this.logger.log('Driver location retrieved successfully', {
        driverId,
      });

      return response.data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error('Unexpected error getting driver location', {
        driverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ServiceUnavailableException('Failed to get driver location');
    }
  }
}
