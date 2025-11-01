import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtPayload } from '../types/jwt.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authentication token');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    // For this story, we'll do basic JWT validation
    // In production, this would validate the JWT signature
    const token = authHeader.substring(7);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    // Mock JWT decode - in production use proper JWT library
    try {
      const payload = this.decodeJWT(token);
      request.user = {
        userId: payload.userId,
        role: payload.role,
        email: payload.email,
      };
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private decodeJWT(token: string): JwtPayload {
    // Simple base64 decode for testing
    // In production, use jsonwebtoken library with signature verification
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid token format');
    }
  }
}
