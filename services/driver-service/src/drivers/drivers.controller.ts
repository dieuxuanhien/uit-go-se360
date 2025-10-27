import { Controller, Put, Get, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { DriverStatusResponseDto } from './dto/driver-status-response.dto';
import { DriverLocationResponseDto } from './dto/driver-location-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DriverRoleGuard } from '../auth/guards/driver-role.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Drivers')
@Controller('drivers')
@UseGuards(JwtAuthGuard, DriverRoleGuard)
@ApiBearerAuth()
export class DriversController {
  private readonly logger = new Logger(DriversController.name);

  constructor(private readonly driversService: DriversService) {}

  @Put('status')
  @ApiOperation({ summary: 'Update driver online/offline status' })
  @ApiResponse({
    status: 200,
    description: 'Status updated successfully',
    type: DriverStatusResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'User is not a driver' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async updateStatus(
    @CurrentUser() user: { userId: string; email: string; role: string },
    @Body() updateStatusDto: UpdateStatusDto,
  ): Promise<DriverStatusResponseDto> {
    this.logger.log(`Updating status for driver ${user.userId} to ${updateStatusDto.isOnline}`);
    return this.driversService.updateStatus(user.userId, updateStatusDto.isOnline);
  }

  @Get('status')
  @ApiOperation({ summary: "Get current driver's status" })
  @ApiResponse({
    status: 200,
    description: 'Status retrieved successfully',
    type: DriverStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'User is not a driver' })
  @ApiResponse({ status: 404, description: 'Status not found' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async getStatus(
    @CurrentUser() user: { userId: string; email: string; role: string },
  ): Promise<DriverStatusResponseDto> {
    this.logger.log(`Retrieving status for driver ${user.userId}`);
    return this.driversService.getStatus(user.userId);
  }

  @Put('location')
  @ApiOperation({ summary: 'Update driver location' })
  @ApiResponse({
    status: 200,
    description: 'Location updated successfully',
    type: DriverLocationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid coordinates' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Driver is offline or not a DRIVER role' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async updateLocation(
    @CurrentUser() user: { userId: string; email: string; role: string },
    @Body() updateLocationDto: UpdateLocationDto,
  ): Promise<DriverLocationResponseDto> {
    this.logger.log(`Updating location for driver ${user.userId}`);
    return this.driversService.updateLocation(user.userId, updateLocationDto);
  }
}
