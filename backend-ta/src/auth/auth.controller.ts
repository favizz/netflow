import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { DevLoginDto } from './dto/dev-login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SelectUnitDto } from './dto/select-unit.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Development only — disabled in production (NODE_ENV=production) */
  @Post('dev-login')
  devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto.email);
  }

  @Post('google')
  googleLogin(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto.credential);
  }

  @Post('admin')
  adminGoogleLogin(@Body() dto: GoogleAuthDto) {
    return this.authService.adminGoogleLogin(dto.credential);
  }

  @UseGuards(JwtAuthGuard)
  @Post('select-unit')
  selectUnit(@CurrentUser() user: JwtPayload, @Body() dto: SelectUnitDto) {
    return this.authService.selectUnit(user, dto.unitId);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: JwtPayload, @Body() dto: LogoutDto) {
    return this.authService.logout(user, dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user);
  }
}
