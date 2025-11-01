export enum TripStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface TripDto {
  id: string;
  passengerId: string;
  driverId: string;
  status: TripStatus;
}
