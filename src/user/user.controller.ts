/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Role } from '@prisma/client';

interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    role: Role;
  };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Get the authenticated user's own profile
   * Access: Authenticated users
   */
  @Get('me')
  getMe(@Request() req: RequestWithUser) {
    return this.userService.getMe(req.user.id);
  }

  /**
   * Update the authenticated user's own profile
   * Access: Authenticated users
   */
  @Patch('me')
  updateMe(@Body() dto: UpdateProfileDto, @Request() req: RequestWithUser) {
    return this.userService.updateMe(req.user.id, dto);
  }
}
