import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import driverNotificationConfig from '../config/driver-notification.config';

export interface DriverLocationDto {
  driverId: string;
  latitude: number;
  longitude: number;
  isOnline: boolean;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: Date;
}

@Injectable()
export class DriverServiceClient {
  constructor(
    private readonly httpService: HttpService,
    @Inject(driverNotificationConfig.KEY)
    private readonly config: ConfigType<typeof driverNotificationConfig>,
  ) {}

  async getDriverLocation(driverId: string): Promise<DriverLocationDto | null> {
    try {
      const headers = {
        Authorization: `Bearer ${this.config.serviceJwtToken || ''}`,
      };

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.config.driverServiceUrl}/api/drivers/${driverId}/location`,
          {
            headers,
            timeout: 5000,
          },
        ),
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null; // No location available
      }
      throw new InternalServerErrorException('Failed to fetch driver location');
    }
  }
}
