import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DriverProfilesService } from './driver-profiles.service';
import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import { DriverProfileDTO } from '@uit-go/shared-types';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@ApiTags('Driver Profiles')
@Controller('users/driver-profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DriverProfilesController {
  constructor(private readonly driverProfilesService: DriverProfilesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create driver profile with vehicle information' })
  @ApiBody({ type: CreateDriverProfileDto })
  @ApiResponse({
    status: 201,
    description: 'Driver profile created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User is not a DRIVER',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Profile exists or duplicate plate/license',
  })
  async createProfile(
    @CurrentUser() user: JwtPayload,
    @Body() createProfileDto: CreateDriverProfileDto,
  ): Promise<DriverProfileDTO> {
    if (user.role !== 'DRIVER') {
      throw new ForbiddenException(
        'Only users with DRIVER role can create driver profiles',
      );
    }

    return await this.driverProfilesService.createProfile(
      user.userId,
      createProfileDto,
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get authenticated driver profile' })
  @ApiResponse({
    status: 200,
    description: 'Driver profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'Driver profile not found',
  })
  async getProfile(@CurrentUser() user: JwtPayload): Promise<DriverProfileDTO> {
    return await this.driverProfilesService.getProfile(user.userId);
  }
}
