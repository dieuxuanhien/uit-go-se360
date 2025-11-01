import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DriverNotificationService } from './driver-notification.service';
import { NotificationDto } from './dto';
import { TripResponseDto } from '../trips/dto/trip-response.dto';
import { JwtPayload } from '../common/types/jwt.types';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly driverNotificationService: DriverNotificationService,
  ) {}

  @ApiOperation({ summary: 'Get pending trip notifications for driver' })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    type: [NotificationDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not a driver' })
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async getMyNotifications(
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationDto[]> {
    return this.driverNotificationService.getDriverNotifications(user.userId);
  }

  @ApiOperation({ summary: 'Accept trip notification (driver)' })
  @ApiResponse({
    status: 200,
    description: 'Notification accepted, trip assigned to driver',
    type: TripResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Notification expired' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Wrong driver or not a driver',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Already responded or trip assigned',
  })
  @Post(':id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  @HttpCode(200)
  async acceptNotification(
    @Param('id') notificationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TripResponseDto> {
    return this.driverNotificationService.acceptNotification(
      notificationId,
      user.userId,
    );
  }

  @ApiOperation({ summary: 'Decline trip notification (driver)' })
  @ApiResponse({
    status: 200,
    description: 'Notification declined successfully',
  })
  @ApiResponse({ status: 400, description: 'Notification expired' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Wrong driver or not a driver',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 409, description: 'Conflict - Already responded' })
  @Post(':id/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  @HttpCode(200)
  async declineNotification(
    @Param('id') notificationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string; notificationId: string; status: string }> {
    await this.driverNotificationService.declineNotification(
      notificationId,
      user.userId,
    );
    return {
      message: 'Notification declined successfully',
      notificationId,
      status: 'DECLINED',
    };
  }
}
