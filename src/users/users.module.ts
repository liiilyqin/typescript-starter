import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { EventsModule } from '../events/events.module.js';

@Module({
  imports: [
    // Register the User repository for UsersService
    TypeOrmModule.forFeature([User]),
    // Import EventsModule to make EventsService available for injection
    // in UsersController (used by the merge-all endpoint)
    EventsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
