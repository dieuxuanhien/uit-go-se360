import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const driverNotificationConfigValidationSchema = {
  DRIVER_SEARCH_INITIAL_RADIUS_KM: Joi.number().positive().default(5),
  DRIVER_SEARCH_SECOND_RADIUS_KM: Joi.number().positive().default(10),
  DRIVER_SEARCH_FINAL_RADIUS_KM: Joi.number().positive().default(15),
  DRIVER_NOTIFICATION_LIMIT: Joi.number().integer().positive().default(5),
  DRIVER_SERVICE_URL: Joi.string().uri().required(),
  DRIVER_NOTIFICATION_TIMEOUT_SECONDS: Joi.number().positive().default(15),
  SERVICE_JWT_TOKEN: Joi.string().optional().allow(''),
};

export default registerAs('driverNotification', () => ({
  searchRadii: {
    initial: parseInt(process.env.DRIVER_SEARCH_INITIAL_RADIUS_KM ?? '5', 10),
    second: parseInt(process.env.DRIVER_SEARCH_SECOND_RADIUS_KM ?? '10', 10),
    final: parseInt(process.env.DRIVER_SEARCH_FINAL_RADIUS_KM ?? '15', 10),
  },
  notificationLimit: parseInt(process.env.DRIVER_NOTIFICATION_LIMIT ?? '5', 10),
  driverServiceUrl: process.env.DRIVER_SERVICE_URL ?? 'http://localhost:3003',
  timeoutSeconds: parseInt(
    process.env.DRIVER_NOTIFICATION_TIMEOUT_SECONDS ?? '15',
    10,
  ),
  requestTimeoutMs: 5000,
  maxRetries: 2,
  serviceJwtToken: process.env.SERVICE_JWT_TOKEN ?? '',
}));
