import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * JWT Strategy for Passport.js
 * Extracts JWT token from Authorization header and validates it
 * using the JWT_SECRET from environment variables
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  /**
   * Validate JWT payload
   * Called after token is verified
   * @param payload JWT payload containing user information
   * @returns Validated payload to be attached to request.user
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate(payload: any) {
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  }
}
