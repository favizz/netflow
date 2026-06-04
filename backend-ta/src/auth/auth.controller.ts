import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from './current-user.decorator';
import { DevLoginDto } from './dto/dev-login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SelectUnitDto } from './dto/select-unit.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UnitService } from '../admin/unit/unit.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly unitService: UnitService,
    private readonly configService: ConfigService,
  ) {}

  /** Development only - disabled in production (NODE_ENV=production) */
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

  /**
   * Called by EMQX HTTP authentication backend to validate MQTT client credentials.
   * Returns { result: "allow" } or { result: "deny" }.
   *
   * Two principal types are accepted:
   *   1. Backend service: username=MQTT_USERNAME, password=MQTT_PASSWORD
   *   2. ESP32 device:    username=<device_id>, password=MQTT_DEVICE_SECRET
   *      Device must exist in the units table.
   */
  @Post('mqtt')
  @HttpCode(200)
  async mqttAuth(
    @Body() body: { clientid?: string; username?: string; password?: string },
  ) {
    const { username, password } = body;

    if (!username || !password) {
      return { result: 'deny' };
    }

    // Allow the NestJS backend service itself
    const mqttUser = this.configService.get<string>('MQTT_USERNAME', '');
    const mqttPass = this.configService.get<string>('MQTT_PASSWORD', '');
    if (mqttUser && mqttUser === username && mqttPass === password) {
      return { result: 'allow' };
    }

    // Allow dashboard/browser clients (username prefixed with 'dashboard-')
    const dashboardSecret = this.configService.get<string>(
      'MQTT_DASHBOARD_SECRET',
      '',
    );
    if (
      dashboardSecret &&
      username.startsWith('dashboard-') &&
      password === dashboardSecret
    ) {
      return { result: 'allow' };
    }

    // Allow ESP32 devices: username must be a registered device_id
    const deviceSecret = this.configService.get<string>(
      'MQTT_DEVICE_SECRET',
      '',
    );
    if (deviceSecret && password === deviceSecret) {
      try {
        const unit = await this.unitService.findByDeviceId(username);
        if (unit) return { result: 'allow' };
      } catch {
        // DB unavailable - deny to be safe
      }
    }

    return { result: 'deny' };
  }
}
