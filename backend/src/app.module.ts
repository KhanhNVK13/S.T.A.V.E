import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { AdminBillingModule } from './admin-billing/admin-billing.module';
import { ProjectsModule } from './projects/projects.module';
import { DraftsModule } from './drafts/drafts.module';
import { ExploreModule } from './explore/explore.module';
import { BranchesModule } from './branches/branches.module';
import { CommitsModule } from './commits/commits.module';
import { MergeModule } from './merge/merge.module';
import { AudioSketchesModule } from './audio-sketches/audio-sketches.module';
import { CustomSoundsModule } from './custom-sounds/custom-sounds.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ForksModule } from './forks/forks.module';
import { ConnectedAccountsModule } from './connected-accounts/connected-accounts.module';
import { PullRequestsModule } from './pull-requests/pull-requests.module';
import { ProjectAccessModule } from './project-access/project-access.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { CommentsModule } from './comments/comments.module';
import { JamModule } from './jam/jam.module';
import { AiModule } from './ai/ai.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { BillingModule } from './billing/billing.module';
import { CustomThemesModule } from './custom-themes/custom-themes.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationTemplatesModule } from './notification-templates/notification-templates.module';
import { AdminStatsModule } from './admin-stats/admin-stats.module';
import { ActivityLogModule } from './activity-log/activity-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      errorMessage: 'Too many requests, please try again later',
    }),
    SupabaseModule,
    AuthModule,
    UsersModule,
    AdminModule,
    AdminBillingModule,
    ProjectsModule,
    DraftsModule,
    ExploreModule,
    BranchesModule,
    CommitsModule,
    MergeModule,
    AudioSketchesModule,
    CustomSoundsModule,
    NotificationsModule,
    ForksModule,
    ConnectedAccountsModule,
    PullRequestsModule,
    ProjectAccessModule,
    CollaborationModule,
    CommentsModule,
    JamModule,
    AiModule,
    PlatformSettingsModule,
    BillingModule.register(),
    CustomThemesModule,
    ReportsModule,
    NotificationTemplatesModule,
    AdminStatsModule,
    ActivityLogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
