import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity.js';
import { User } from '../users/entities/user.entity.js';
import { CreateEventDto } from './dto/create-event.dto.js';

// Priority map: higher number = higher priority (TODO > IN_PROGRESS > COMPLETED)
// Rationale: a merged event should surface any still-pending work first
const STATUS_PRIORITY: Record<EventStatus, number> = {
  [EventStatus.TODO]: 3,
  [EventStatus.IN_PROGRESS]: 2,
  [EventStatus.COMPLETED]: 1,
};


@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  //Create a new task
  async create(dto: CreateEventDto): Promise<Event> {
    // Resolve inviteeIds to actual User entities
    let invitees: User[] = [];
    if (dto.inviteeIds && dto.inviteeIds.length > 0) {
      invitees = await this.userRepo.findBy({ id: In(dto.inviteeIds) });
    }

    const event = this.eventRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      status: dto.status ?? EventStatus.TODO,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      invitees,
    });

    return this.eventRepo.save(event);
  }

  //Retrieve a task by its id
  async findOne(id: string): Promise<Event> {
    const event = await this.eventRepo.findOne({
      where: { id },
      relations: ['invitees'],
    });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }
    return event;
  }

  //Delete a task by its id
  async remove(id: string): Promise<void> {
    await this.findOne(id); // throws 404 if not found
    await this.eventRepo.delete(id);
  }

  //MergeAll
  async mergeEventsForUser(userId: string): Promise<Event[]> {
    // 1. Validate user exists
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['events'],
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    // 2. Nothing to merge
    if (!user.events || user.events.length === 0) {
      return [];
    }

    // 3. Load full event details
    const eventIds = user.events.map((e) => e.id);
    const events = await this.eventRepo.find({
      where: { id: In(eventIds) },
      relations: ['invitees'],
    });

    // 4. Sort by startTime ascending
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // 5. Interval merge
    const groups: Event[][] = [];
    let currentGroup: Event[] = [events[0]];
    let maxEndTime = events[0].endTime.getTime();

    for (let i = 1; i < events.length; i++) {
      const next = events[i];
      if (next.startTime.getTime() < maxEndTime) {
        // Overlaps with current group: E1: 2pm-3pm, E2: 2:45pm-4pm
        currentGroup.push(next);
        if (next.endTime.getTime() > maxEndTime) {
          maxEndTime = next.endTime.getTime();
        }
      } else {
        // No overlap — start a new group
        groups.push(currentGroup);
        currentGroup = [next];
        maxEndTime = next.endTime.getTime();
      }
    }
    groups.push(currentGroup);

    // 6. Only process groups with more than one event
    const mergeGroups = groups.filter((g) => g.length > 1);
    if (mergeGroups.length === 0) {
      return [];
    }

    // 7. Create merged events and delete originals
    const mergedEvents: Event[] = [];

    for (const group of mergeGroups) {
      // Build merged fields
      const title = group.map((e) => e.title).join(' + ');
      const descriptions = group
        .map((e) => e.description)
        .filter((d): d is string => d !== null && d !== undefined);
      const description = descriptions.length > 0 ? descriptions.join('\n') : null;

      const startTime = new Date(Math.min(...group.map((e) => e.startTime.getTime())));
      const endTime = new Date(Math.max(...group.map((e) => e.endTime.getTime())));

      const status = group
        .map((e) => e.status)
        .reduce((best, current) =>
          STATUS_PRIORITY[current] > STATUS_PRIORITY[best] ? current : best,
        );

      // Union all invitees, deduplicate by id
      const inviteeMap = new Map<string, User>();
      for (const event of group) {
        for (const invitee of event.invitees) {
          inviteeMap.set(invitee.id, invitee);
        }
      }
      const invitees = Array.from(inviteeMap.values());

      // Save new merged event
      const mergedEvent = await this.eventRepo.save(
        this.eventRepo.create({ title, description, status, startTime, endTime, invitees }),
      );
      mergedEvents.push(mergedEvent);

      // Delete original events
      const originalIds = group.map((e) => e.id);
      await this.eventRepo.delete(originalIds);
    }

    return mergedEvents;
  }
}
