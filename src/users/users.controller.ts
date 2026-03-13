import { Controller, Post, Param, Body } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { EventsService } from '../events/events.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';

// Handles all HTTP routes under /users
@Controller('users')
export class UsersController {
  // EventsService - merge logic 
  constructor(
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
  ) {}

  // POST /users — create a new user
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // POST /users/:userId/merge-all — merge all overlapping events for this user
  @Post(':userId/merge-all')
  mergeAll(@Param('userId') userId: string) {
    return this.eventsService.mergeEventsForUser(userId);
  }
}
