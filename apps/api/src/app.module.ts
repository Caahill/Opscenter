import { DynamicModule, Module, type Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { AccessGuard } from './auth/access.guard';
import { AuthController } from './auth/auth.controller';
import { GoogleOidcService } from './auth/google-oidc.service';
import { SessionService } from './auth/session.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { RenewalsService } from './billing/renewals.service';
import { BoardsController } from './boards/boards.controller';
import { CapacityController } from './capacity/capacity.controller';
import { CapacityService } from './capacity/capacity.service';
import { PlannerService } from './capacity/planner.service';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { CatalogController, CatalogService } from './catalog/catalog.controller';
import { ClientsController } from './clients/clients.controller';
import { ClientsService } from './clients/clients.service';
import { ActivityService } from './common/activity.service';
import { DirectoryService } from './common/directory.service';
import { CredentialsService } from './credentials/credentials.service';
import { ScopeService } from './policy/scopes';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsQueries } from './projects/projects.queries';
import { ProjectsService } from './projects/projects.service';
import { StorageService } from './storage/storage.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksQueries } from './tasks/tasks.queries';
import { TasksService } from './tasks/tasks.service';
import { ErrorFilter } from './common/error.filter';
import { ENV, isDevAuth, type Env } from './config/env';
import { CryptoModule } from './crypto/crypto.service';
import { DashboardsController } from './dashboards/dashboards.controller';
import { DashboardsService } from './dashboards/dashboards.service';
import { DevMailController } from './dev/dev-mail.controller';
import { DevAuthController } from './dev/dev-auth.controller';
import { InboxSimulateController } from './dev/inbox-simulate.controller';
import { GmailService } from './inbox/gmail.service';
import { InboxController } from './inbox/inbox.controller';
import { InboxService } from './inbox/inbox.service';
import { MailboxesController } from './inbox/mailboxes.controller';
import { IngestService, MessagesQueries } from './inbox/messages';
import { INTEGRATION_PROVIDERS } from './inbox/providers';
import { SearchService } from './inbox/search.service';
import { SendService } from './inbox/send.service';
import { TriageService } from './inbox/triage.service';
import { WebhooksController } from './inbox/webhooks.controller';
import { WhatsAppService } from './inbox/whatsapp.service';
import { JobsService } from './jobs/jobs.service';
import { PolicyPreviewController, PolicyPreviewService } from './dev/policy-preview';
import { HealthController } from './health/health.controller';
import { LeaveController } from './leave/leave.controller';
import { LeaveService } from './leave/leave.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotifyService } from './notifications/notify.service';
import { PUSH_PROVIDER } from './notifications/push.provider';
import { RealtimeGateway, RealtimeService } from './realtime/realtime.gateway';
import { PolicySerializerInterceptor } from './policy/policy-serializer.interceptor';
import { RouteAudit, RouteCatalog } from './policy/route-audit';
import { PrismaModule } from './prisma/prisma.service';
import { TeamsController, TeamsService } from './teams/teams.controller';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({})
export class AppModule {
  /** `extra` lets tests mount additional controllers (e.g. a route with no access rule). */
  static register(env: Env, extra: { controllers?: Type[] } = {}): DynamicModule {
    const dev = isDevAuth(env);
    return {
      module: AppModule,
      global: true,
      imports: [DiscoveryModule, PrismaModule, CryptoModule],
      controllers: [
        HealthController,
        AuthController,
        UsersController,
        TeamsController,
        AuditController,
        ClientsController,
        CatalogController,
        ProjectsController,
        TasksController,
        BoardsController,
        LeaveController,
        CapacityController,
        NotificationsController,
        InboxController,
        MailboxesController,
        WebhooksController,
        BillingController,
        ChatController,
        DashboardsController,
        ...(dev ? [DevAuthController, PolicyPreviewController, InboxSimulateController, DevMailController] : []),
        ...(extra.controllers ?? []),
      ],
      providers: [
        { provide: ENV, useValue: env },
        SessionService,
        GoogleOidcService,
        AuditService,
        UsersService,
        TeamsService,
        ScopeService,
        ActivityService,
        DirectoryService,
        StorageService,
        ClientsService,
        CredentialsService,
        CatalogService,
        ProjectsQueries,
        ProjectsService,
        TasksQueries,
        TasksService,
        CapacityService,
        PlannerService,
        LeaveService,
        JobsService,
        ...INTEGRATION_PROVIDERS,
        MessagesQueries,
        IngestService,
        InboxService,
        TriageService,
        GmailService,
        WhatsAppService,
        SendService,
        SearchService,
        RealtimeGateway,
        RealtimeService,
        PUSH_PROVIDER,
        NotifyService,
        ChatService,
        DashboardsService,
        BillingService,
        RenewalsService,
        RouteCatalog,
        RouteAudit,
        ...(dev ? [PolicyPreviewService] : []),
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_INTERCEPTOR, useClass: PolicySerializerInterceptor },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
      exports: [ENV],
    };
  }
}
