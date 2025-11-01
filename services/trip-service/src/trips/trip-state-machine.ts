import { TripStatus } from '@prisma/client';

export class TripStateMachine {
  /**
   * Validates if a trip can transition from current status to target status.
   * @param currentStatus Current trip status
   * @param targetStatus Target trip status
   * @returns true if transition is valid, false otherwise
   */
  static canTransitionTo(
    currentStatus: TripStatus,
    targetStatus: TripStatus,
  ): boolean {
    const validTransitions: Record<TripStatus, TripStatus[]> = {
      [TripStatus.REQUESTED]: [TripStatus.FINDING_DRIVER, TripStatus.CANCELLED],
      [TripStatus.FINDING_DRIVER]: [
        TripStatus.DRIVER_ASSIGNED,
        TripStatus.NO_DRIVERS_AVAILABLE,
        TripStatus.CANCELLED,
      ],
      [TripStatus.NO_DRIVERS_AVAILABLE]: [TripStatus.CANCELLED],
      [TripStatus.DRIVER_ASSIGNED]: [
        TripStatus.EN_ROUTE_TO_PICKUP,
        TripStatus.CANCELLED,
      ],
      [TripStatus.EN_ROUTE_TO_PICKUP]: [
        TripStatus.ARRIVED_AT_PICKUP,
        TripStatus.CANCELLED,
      ],
      [TripStatus.ARRIVED_AT_PICKUP]: [
        TripStatus.IN_PROGRESS,
        TripStatus.CANCELLED,
      ],
      [TripStatus.IN_PROGRESS]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
      [TripStatus.COMPLETED]: [], // Terminal state
      [TripStatus.CANCELLED]: [], // Terminal state
    };

    return validTransitions[currentStatus]?.includes(targetStatus) ?? false;
  }

  /**
   * Gets a human-readable description of an invalid state transition.
   * @param currentStatus Current trip status
   * @param targetStatus Target trip status
   * @returns Error message describing the invalid transition
   */
  static getInvalidTransitionMessage(
    currentStatus: TripStatus,
    targetStatus: TripStatus,
  ): string {
    return `Cannot transition trip from ${currentStatus} to ${targetStatus}`;
  }
}
