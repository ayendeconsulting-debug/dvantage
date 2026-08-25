import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { DashboardResponseDto } from './dto/dashboard-response.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /v1/dashboard
   * Returns aggregated activity summary for the authenticated user.
   * Protected by the global AuthGuard — no @Public() needed.
   */
  @Get()
  getSummary(@CurrentUser() user: { id: string }): Promise<DashboardResponseDto> {
    return this.dashboardService.getSummary(user.id);
  }
}
