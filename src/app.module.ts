import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Event } from './events/entities/event.entity.js';
import { User } from './users/entities/user.entity.js';
import { EventsModule } from './events/events.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // SQLite database - convenient for development, should be disabled in production
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'db.sqlite',
      entities: [Event, User],
      synchronize: true,
    }),
    EventsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
