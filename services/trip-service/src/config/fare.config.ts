import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const fareConfigValidationSchema = {
  FARE_BASE_CENTS: Joi.number().integer().min(0).default(250),
  FARE_PER_KM_CENTS: Joi.number().integer().min(0).default(120),
  FARE_MINIMUM_CENTS: Joi.number().integer().min(0).default(500),
  FARE_MAXIMUM_CENTS: Joi.number().integer().min(0).default(20000),
};

export default registerAs('fare', () => ({
  baseCents: parseInt(process.env.FARE_BASE_CENTS ?? '250', 10),
  perKmCents: parseInt(process.env.FARE_PER_KM_CENTS ?? '120', 10),
  minimumCents: parseInt(process.env.FARE_MINIMUM_CENTS ?? '500', 10),
  maximumCents: parseInt(process.env.FARE_MAXIMUM_CENTS ?? '20000', 10),
}));
