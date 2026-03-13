import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { Event, EventStatus } from './entities/event.entity.js';
import { User } from '../users/entities/user.entity.js';

// ─── Test data helpers ────────────────────────────────────────────────────────
// Factory functions keep test cases short: each test only overrides what it cares about

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), { id: 'u1', name: 'Alice', events: [] }, overrides);
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return Object.assign(new Event(), {
    id: 'e1',
    title: 'Meeting',
    description: null,
    status: EventStatus.TODO,
    startTime: new Date('2024-01-01T14:00:00Z'),
    endTime: new Date('2024-01-01T15:00:00Z'),
    invitees: [],
    ...overrides,
  });
}

// ─── Mock repositories ────────────────────────────────────────────────────────
// Replace the real TypeORM repository with jest fakes, mock methods

function makeMockEventRepo() {
  return {
    create: jest.fn((dto) => Object.assign(new Event(), dto)),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(),
    find: jest.fn(),
    findBy: jest.fn(),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
}

function makeMockUserRepo() {
  return {
    findOne: jest.fn(),
    findBy: jest.fn(),
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────
// Unit tests for EventsService
describe('EventsService', () => {
  let service: EventsService;
  let eventRepo: ReturnType<typeof makeMockEventRepo>;
  let userRepo: ReturnType<typeof makeMockUserRepo>;

  beforeEach(async () => {
    eventRepo = makeMockEventRepo();
    userRepo = makeMockUserRepo();

    // Build a minimal NestJS testing module that wires EventsService
    // with the mock repos instead of real TypeORM repositories
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(EventsService);
  });

  //Test the create() method
  describe('create', () => {

    //Test1: creating an event without invitees
    it('creates and returns an event without invitees', async () => {
      const dto = {
        title: 'Meeting',
        startTime: '2024-01-01T14:00:00Z',
        endTime: '2024-01-01T15:00:00Z',
      };
      const result = await service.create(dto);
      expect(eventRepo.create).toHaveBeenCalled();
      expect(eventRepo.save).toHaveBeenCalled();
      expect(result.title).toBe('Meeting');
    });

    //Test2: creating an event with invitees
    it('resolves inviteeIds to User entities before saving', async () => {
      const user = makeUser();
      // Tell the mock: when findBy is called, return this user
      userRepo.findBy.mockResolvedValue([user]);

      const dto = {
        title: 'Team call',
        startTime: '2024-01-01T14:00:00Z',
        endTime: '2024-01-01T15:00:00Z',
        inviteeIds: ['u1'],//with inviteeIds
      };
      await service.create(dto);
      expect(userRepo.findBy).toHaveBeenCalled();
      // Inspect what was actually passed to repo.create() to verify the mapping
      const savedEntity = eventRepo.create.mock.calls[0][0] as Partial<Event>;
      expect(savedEntity.invitees).toEqual([user]);
    });

    //Test3: creating an event without status should default to TODO
    it('defaults status to TODO when not provided', async () => {
      const dto = {
        title: 'Meeting',
        startTime: '2024-01-01T14:00:00Z',
        endTime: '2024-01-01T15:00:00Z',
      };
      await service.create(dto);
      const savedEntity = eventRepo.create.mock.calls[0][0] as Partial<Event>;
      expect(savedEntity.status).toBe(EventStatus.TODO);
    });
  });

  //Test the findOne() method
  describe('findOne', () => {
    it('returns the event when found', async () => {
      const event = makeEvent();
      eventRepo.findOne.mockResolvedValue(event);
      const result = await service.findOne('e1');
      expect(result).toBe(event);
    });

    it('throws NotFoundException when event does not exist', async () => {
      // null simulates "no row found" in the database
      eventRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  //Test the remove() method
  describe('remove', () => {
    it('deletes the event when found', async () => {
      eventRepo.findOne.mockResolvedValue(makeEvent());
      await service.remove('e1');
      expect(eventRepo.delete).toHaveBeenCalledWith('e1');
    });

    it('throws NotFoundException when event does not exist', async () => {
      eventRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  //Test the mergeEventsForUser() method
  describe('mergeEventsForUser', () => {
    it('throws NotFoundException when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.mergeEventsForUser('no-user')).rejects.toThrow(NotFoundException);
    });

    //Test1: user has no events
    it('returns [] when the user has no events', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ events: [] }));
      const result = await service.mergeEventsForUser('u1');
      expect(result).toEqual([]);
    });

    //Test2: user has events but none overlap
    it('returns [] when no events overlap', async () => {
      // E1: 2pm–3pm, E2: 5pm–6pm — gap between them, nothing to merge
      const e1 = makeEvent({ id: 'e1', startTime: new Date('2024-01-01T14:00:00Z'), endTime: new Date('2024-01-01T15:00:00Z') });
      const e2 = makeEvent({ id: 'e2', startTime: new Date('2024-01-01T17:00:00Z'), endTime: new Date('2024-01-01T18:00:00Z') });

      userRepo.findOne.mockResolvedValue(makeUser({ events: [e1, e2] }));
      eventRepo.find.mockResolvedValue([e1, e2]);

      const result = await service.mergeEventsForUser('u1');
      expect(result).toEqual([]);
      expect(eventRepo.save).not.toHaveBeenCalled();
    });

    //Test3: user has overlapping events that should be merged
    it('merges two overlapping events and deletes originals', async () => {
      // E1: 2pm–3pm, E2: 2:45pm–4pm → merged window: 2pm–4pm
      const e1 = makeEvent({ id: 'e1', title: 'E1', startTime: new Date('2024-01-01T14:00:00Z'), endTime: new Date('2024-01-01T15:00:00Z') });
      const e2 = makeEvent({ id: 'e2', title: 'E2', startTime: new Date('2024-01-01T14:45:00Z'), endTime: new Date('2024-01-01T16:00:00Z') });

      userRepo.findOne.mockResolvedValue(makeUser({ events: [e1, e2] }));
      eventRepo.find.mockResolvedValue([e1, e2]);

      const result = await service.mergeEventsForUser('u1');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('E1 + E2');
      expect(result[0].startTime).toEqual(new Date('2024-01-01T14:00:00Z'));
      expect(result[0].endTime).toEqual(new Date('2024-01-01T16:00:00Z'));
      // Both originals must be removed after merge
      expect(eventRepo.delete).toHaveBeenCalledWith(['e1', 'e2']);
    });

    //Test4: Pick the highest status and combine descriptions
    it('picks the highest status (TODO > IN_PROGRESS > COMPLETED)', async () => {
      const e1 = makeEvent({ id: 'e1', status: EventStatus.TODO,        startTime: new Date('2024-01-01T14:00:00Z'), endTime: new Date('2024-01-01T15:00:00Z') });
      const e2 = makeEvent({ id: 'e2', status: EventStatus.IN_PROGRESS, startTime: new Date('2024-01-01T14:30:00Z'), endTime: new Date('2024-01-01T16:00:00Z') });
      const e3 = makeEvent({ id: 'e3', status: EventStatus.COMPLETED,   startTime: new Date('2024-01-01T15:00:00Z'), endTime: new Date('2024-01-01T17:00:00Z') });

      userRepo.findOne.mockResolvedValue(makeUser({ events: [e1, e2, e3] }));
      eventRepo.find.mockResolvedValue([e1, e2, e3]);

      const result = await service.mergeEventsForUser('u1');
      expect(result[0].status).toBe(EventStatus.TODO);
    });

    //Test5: ensure invitees are deduplicated across merged events
    it('deduplicates invitees across merged events', async () => {
      const alice = makeUser({ id: 'u1', name: 'Alice' });
      const bob   = makeUser({ id: 'u2', name: 'Bob' });

      // Alice appears in both events — she should appear only once in the result
      const e1 = makeEvent({ id: 'e1', invitees: [alice],      startTime: new Date('2024-01-01T14:00:00Z'), endTime: new Date('2024-01-01T15:00:00Z') });
      const e2 = makeEvent({ id: 'e2', invitees: [alice, bob], startTime: new Date('2024-01-01T14:30:00Z'), endTime: new Date('2024-01-01T16:00:00Z') });

      userRepo.findOne.mockResolvedValue(makeUser({ events: [e1, e2] }));
      eventRepo.find.mockResolvedValue([e1, e2]);

      const result = await service.mergeEventsForUser('u1');
      expect(result[0].invitees).toHaveLength(2);
      expect(result[0].invitees.map((u: User) => u.id).sort()).toEqual(['u1', 'u2']);
    });

    //Test6: ensure descriptions are combined, skipping nulls
    it('appends descriptions, skipping null values', async () => {
      // e2 has no description — it should be skipped, not leave a blank line
      const e1 = makeEvent({ id: 'e1', description: 'Desc A', startTime: new Date('2024-01-01T14:00:00Z'), endTime: new Date('2024-01-01T15:00:00Z') });
      const e2 = makeEvent({ id: 'e2', description: null,     startTime: new Date('2024-01-01T14:30:00Z'), endTime: new Date('2024-01-01T16:00:00Z') });
      const e3 = makeEvent({ id: 'e3', description: 'Desc C', startTime: new Date('2024-01-01T15:00:00Z'), endTime: new Date('2024-01-01T17:00:00Z') });

      userRepo.findOne.mockResolvedValue(makeUser({ events: [e1, e2, e3] }));
      eventRepo.find.mockResolvedValue([e1, e2, e3]);

      const result = await service.mergeEventsForUser('u1');
      expect(result[0].description).toBe('Desc A\nDesc C');
    });
  });
});
