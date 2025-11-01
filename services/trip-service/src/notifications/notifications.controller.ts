import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DriverNotificationService } from './driver-notification.service';
import { NotificationDto } from './dto';
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
}
