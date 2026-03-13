import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';

// @Injectable() marks this class as a NestJS provider available for dependency injection
@Injectable()
export class UsersService {
  constructor(
    // @InjectRepository tells NestJS to inject the TypeORM repository
    // for the User entity, giving us save/find/delete methods
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    // .create() instantiates the entity in memory; .save() persists it and returns the record with generated id
    const user = this.userRepo.create({ name: dto.name });
    return this.userRepo.save(user);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      // Eagerly load the events relation so callers receive the full object
      relations: ['events'],
    });
    // NestJS automatically converts NotFoundException into a 404 HTTP response
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    return user;
  }
}
