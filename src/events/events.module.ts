import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './entities/event.entity.js';
import { User } from '../users/entities/user.entity.js';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';


@Module({
  imports: [TypeOrmModule.forFeature([Event, User])],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],// Exports - injected into UsersController for the merge-all endpoint
})
export class EventsModule {}
