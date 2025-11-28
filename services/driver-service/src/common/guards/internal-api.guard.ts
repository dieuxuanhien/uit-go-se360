import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guard for internal service-to-service API calls.
 * Validates that the request contains a valid internal API key.
 * 
 * Usage:
 *   @UseGuards(InternalApiGuard)
 *   @Put(':driverId/availability')
 * 
 * The calling service must include header:
 *   X-Internal-Api-Key: <secret-key>
 */
@Injectable()
export class InternalApiGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiGuard.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    // Get API key from environment variable
    this.apiKey = this.configService.get<string>('INTERNAL_API_KEY') || 'default-internal-key-change-me';
    
    if (this.apiKey === 'default-internal-key-change-me') {
      this.logger.warn('⚠️ Using default INTERNAL_API_KEY - set this in production!');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-internal-api-key'];

    if (!apiKey) {
      this.logger.warn('Internal API called without X-Internal-Api-Key header', {
        path: request.path,
        ip: request.ip,
      });
      throw new UnauthorizedException('Missing internal API key');
    }

    if (apiKey !== this.apiKey) {
      this.logger.warn('Internal API called with invalid API key', {
        path: request.path,
        ip: request.ip,
      });
      throw new UnauthorizedException('Invalid internal API key');
    }

    this.logger.debug('Internal API key validated successfully');
    return true;
  }
}
