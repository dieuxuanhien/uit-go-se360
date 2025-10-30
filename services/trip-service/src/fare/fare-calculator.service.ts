import { Injectable, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import fareConfig from '../config/fare.config';

@Injectable()
export class FareCalculatorService {
  private readonly EARTH_RADIUS_KM = 6371;

  constructor(
    @Inject(fareConfig.KEY) private fareSettings: ConfigType<typeof fareConfig>,
  ) {}

  /**
   * Calculates the great-circle distance between two coordinate pairs using the Haversine formula.
   * @param lat1 Latitude of the first point in degrees
   * @param lng1 Longitude of the first point in degrees
   * @param lat2 Latitude of the second point in degrees
   * @param lng2 Longitude of the second point in degrees
   * @returns Distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return this.EARTH_RADIUS_KM * c;
  }

  /**
   * Calculates the estimated fare for a trip based on distance.
   * Applies minimum and maximum fare constraints.
   * @param distanceKm Distance in kilometers
   * @returns Fare amount in cents (integer)
   */
  calculateEstimatedFare(distanceKm: number): number {
    let totalFare =
      this.fareSettings.baseCents + distanceKm * this.fareSettings.perKmCents;

    // Apply minimum fare
    if (totalFare < this.fareSettings.minimumCents) {
      totalFare = this.fareSettings.minimumCents;
    }

    // Apply maximum fare cap
    if (totalFare > this.fareSettings.maximumCents) {
      totalFare = this.fareSettings.maximumCents;
    }

    // Round to whole cents (no fractional cents)
    return Math.round(totalFare);
  }

  /**
   * Converts degrees to radians.
   * @param degrees Angle in degrees
   * @returns Angle in radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
