import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Global HTTP Exception Filter for consistent error response formatting.
 * Catches all HttpException instances and formats them with standard error structure.
 *
 * Error Response Format:
 * {
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Error message",
 *     "details": {...},
 *     "timestamp": "2025-10-26T10:30:00Z",
 *     "requestId": "req-uuid-12345"
 *   }
 * }
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Generate unique request ID for tracing
    const requestId = randomUUID().slice(0, 13);

    // Extract error message and details
    let message = exception.message || 'Internal Server Error';
    let details: Record<string, unknown> | undefined;
    const code = this.mapStatusToErrorCode(status);

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const response = exceptionResponse as Record<string, unknown>;
      if (response.message) {
        message = Array.isArray(response.message)
          ? response.message.join(', ')
          : (response.message as string);
      }
      if (response.error && typeof response.error === 'object') {
        details = response.error as Record<string, unknown>;
      }
    }

    const errorResponse = {
      error: {
        code,
        message,
        ...(details && { details }),
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    // Log the error
    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} - ${status} ${message}`,
      exception,
    );

    response.status(status).json(errorResponse);
  }

  /**
   * Map HTTP status codes to error code strings
   */
  private mapStatusToErrorCode(status: number): string {
    const statusMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
    };

    return statusMap[status] || 'ERROR';
  }
}
