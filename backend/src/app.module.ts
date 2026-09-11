import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
