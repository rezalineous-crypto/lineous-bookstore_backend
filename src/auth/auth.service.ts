/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SignUpDto } from './dto/signup.dto';
import { User, Provider } from '@prisma/client';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly refreshExpiresMs = Number(
    process.env.REFRESH_TOKEN_EXPIRES_MS || 7 * 24 * 60 * 60 * 1000,
  );

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async adminLogin(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (!user || user.role !== 'ADMIN') {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.buildTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.buildTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async signUp(signUpDto: SignUpDto) {
    const { email, password } = signUpDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create the user with USER role
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'USER',
        provider: 'EMAIL',
        status: 'ACTIVE',
      },
    });

    // Return success message without leaking sensitive data
    return {
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  // OAuth login methods
  async validateOAuthUser(
    email: string,
    provider: Provider,
    providerId: string,
    firstName?: string,
    lastName?: string,
    avatar?: string,
  ): Promise<User> {
    let user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (!user) {
      // Create new user via OAuth
      user = await this.prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          avatar,
          provider,
          providerId,
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });
    } else {
      // Update existing user with OAuth info if needed
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          provider,
          providerId,
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(avatar && { avatar }),
          emailVerified: true,
        },
      });
    }

    return user;
  }

  async generateToken(user: User) {
    const tokens = this.buildTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async socialLogin(
    email: string,
    provider: Provider,
    providerId: string,
    firstName?: string,
    lastName?: string,
    avatar?: string,
  ) {
    const user = await this.validateOAuthUser(
      email,
      provider,
      providerId,
      firstName,
      lastName,
      avatar,
    );

    return this.generateToken(user);
  }

  /**
   * Issue a new access + refresh token pair and persist the refresh token
   * on the user record (rotation on every use).
   */
  private buildTokens(
    userId: string,
    role: string,
  ): { accessToken: string; refreshToken: string } {
    const payload = { sub: userId, role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    } as any);

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: `${Math.floor(this.refreshExpiresMs / 1000)}s`,
    } as any);

    void this.prisma.user
      .update({
        where: { id: userId },
        data: {
          refreshToken,
          refreshTokenExpiresAt: new Date(Date.now() + this.refreshExpiresMs),
        },
      })
      .catch((err) =>
        this.logger.error('Failed to persist refresh token', err),
      );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh the access token using a valid refresh token.
   * Rotates the refresh token on every successful use.
   */
  async refresh(refreshToken: string) {
    let payload: { sub: string; role: string };
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const decoded = this.jwtService.verify(refreshToken) as {
        sub: string;
        role: string;
      };
      payload = decoded;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });

    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (
      user.refreshTokenExpiresAt &&
      user.refreshTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const tokens = this.buildTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Invalidate the stored refresh token (logout).
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });

    return { message: 'Logged out successfully', status: 'success' };
  }

  /**
   * Request a password reset.
   * Generates a single-use token, stores it hashed, and (in production) emails
   * a reset link to the user. Always returns the same generic response whether
   * or not the email exists to avoid user enumeration.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    // Generic response regardless of existence (anti-enumeration)
    const defaultResponse = {
      message:
        'If an account with that email exists, a password reset link has been sent.',
      status: 'success',
    };

    if (!user || !user.password) {
      return defaultResponse;
    }

    const token = this.generateResetToken();
    const hashed = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashed,
        passwordResetExpiresAt: expiresAt,
      },
    });

    // TODO: send email with reset link containing the raw `token`
    this.logger.log(`Password reset token generated for user ${user.id}`);

    return defaultResponse;
  }

  /**
   * Complete the password reset using a valid token.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: { not: null },
        passwordResetExpiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });

    if (!user || !user.passwordResetToken) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const isValid = await bcrypt.compare(
      dto.newPassword,
      user.passwordResetToken,
    );
    if (!isValid) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });

    return {
      message: 'Password reset successfully',
      status: 'success',
    };
  }

  private generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
