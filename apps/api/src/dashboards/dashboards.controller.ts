import { Controller, Get } from '@nestjs/common';
import { Authenticated, CurrentViewer, Requires } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { DashboardsService } from './dashboards.service';

/** PRD 6.1 and 6.2: one dashboard per role; Home shows the ones a person's roles allow. */
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('admin')
  @Requires('dashboard.admin')
  admin(@CurrentViewer() v: AuthedViewer) {
    return this.dashboards.admin(v);
  }

  @Get('pm')
  @Requires('dashboard.pm')
  pm(@CurrentViewer() v: AuthedViewer) {
    return this.dashboards.pm(v);
  }

  @Get('tl')
  @Requires('dashboard.tl')
  tl(@CurrentViewer() v: AuthedViewer) {
    return this.dashboards.tl(v);
  }

  @Get('me')
  @Authenticated()
  me(@CurrentViewer() v: AuthedViewer) {
    return this.dashboards.me(v);
  }

  @Get('accounts')
  @Requires('dashboard.accounts')
  accounts(@CurrentViewer() v: AuthedViewer) {
    return this.dashboards.accounts(v);
  }

  @Get('hr')
  @Requires('dashboard.hr')
  hr(@CurrentViewer() v: AuthedViewer) {
    return this.dashboards.hr(v);
  }
}
