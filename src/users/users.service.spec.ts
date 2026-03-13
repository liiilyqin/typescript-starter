import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';


// ─── Mock repositories ────────────────────────────────────────────────────────
// Replace the real TypeORM repository with jest fakes, mock methods
function makeMockUserRepo() {
  return {
    create: jest.fn((dto) => Object.assign(new User(), dto)),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(),
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────
// Unit tests for UsersService
describe('UsersService', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof makeMockUserRepo>;

  //Separate test suite for each method in the service
  beforeEach(async () => {
    userRepo = makeMockUserRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  // Test the create() method
  describe('create', () => {
    it('creates and returns a user', async () => {
      const result = await service.create({ name: 'Alice' });
      expect(userRepo.create).toHaveBeenCalledWith({ name: 'Alice' });
      expect(userRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('Alice');
    });
  });

  // Test the findOne() method
  describe('findOne', () => {
    it('returns the user when found', async () => {
      const user = Object.assign(new User(), { id: 'u1', name: 'Alice', events: [] });
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.findOne('u1');
      expect(result).toBe(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      // null simulates "no row found" in the database
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
