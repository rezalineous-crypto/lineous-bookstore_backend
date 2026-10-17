/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User, Role } from '@prisma/client';

export interface ProfileResponse {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  bio: string | null;
  avatar: string | null;
  role: Role;
  emailVerified: boolean;
  status: any;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get the authenticated user's own profile.
   * Security: Authenticated users (own profile only)
   */
  async getMe(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toProfile(user);
  }

  /**
   * Update the authenticated user's own profile.
   * Security: Authenticated users (own profile only)
   * NOTE: password is intentionally NOT updatable here — use the dedicated
   * reset flow. Email changes require re-verification in a future iteration.
   */
  async updateMe(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If email is being changed, ensure it isn't already taken
    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existing) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
      },
    });

    return this.toProfile(updated);
  }

  /**
   * Internal helper: find a user by id (used by auth flows).
   */
  async findById(
    id: string,
    requestingUserRole: Role,
  ): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (requestingUserRole !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }

    return this.toProfile(user);
  }

  private toProfile(user: User): ProfileResponse {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      bio: user.bio,
      avatar: user.avatar,
      role: user.role,
      emailVerified: user.emailVerified,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
