import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { UpdateAdminAccessDto } from './dto/update-admin-access.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('accounts')
  listAccounts() {
    return this.adminService.listAccounts();
  }

  @Patch('accounts/:email/access')
  updateAccess(@Param('email') email: string, @Body() payload: UpdateAdminAccessDto) {
    return this.adminService.updateAccount(email, payload);
  }
}
