import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
