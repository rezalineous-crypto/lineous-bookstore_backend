/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post('admin/login')
  adminLogin(@Body() loginDto: LoginDto) {
    return this.authService.adminLogin(loginDto.email, loginDto.password);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('social-login')
  socialLogin(@Body() socialLoginDto: SocialLoginDto) {
    return this.authService.socialLogin(
      socialLoginDto.email,
      socialLoginDto.provider,
      socialLoginDto.providerId,
      socialLoginDto.firstName,
      socialLoginDto.lastName,
      socialLoginDto.avatar,
    );
  }

  /**
   * Refresh the access token using a valid refresh token.
   * Public endpoint - validates against the stored refresh token.
   */
  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  /**
   * Logout by invalidating the stored refresh token.
   * Access: Authenticated users
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Request() req: RequestWithUser) {
    return this.authService.logout(req.user.id);
  }

  /**
   * Request a password reset link (sent to email).
   * Public endpoint - always returns the same generic response.
   */
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * Complete the password reset using a valid token.
   * Public endpoint.
   */
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
