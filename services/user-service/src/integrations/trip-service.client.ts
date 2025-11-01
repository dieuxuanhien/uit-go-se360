import { Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { TripDto } from '@uit-go/shared-types';

/**
 * Trip Service Client
 * Handles HTTP communication with Trip Service
 */
@Injectable()
export class TripServiceClient {
  constructor(private readonly httpService: HttpService) {}

  /**
   * Get trip by ID
   * @param tripId Trip ID
   * @returns Trip DTO
   */
  async getTripById(tripId: string): Promise<TripDto> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`/api/trips/${tripId}`),
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundException(`Trip ${tripId} not found`);
      }
      throw error;
    }
  }
}
