import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { Event } from '../../src/events/entities/event.entity.js';
import { User } from '../../src/users/entities/user.entity.js';
import { EventsModule } from '../../src/events/events.module.js';
import { UsersModule } from '../../src/users/users.module.js';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [Event, User],
        synchronize: true,
        dropSchema: true,
      }),
      EventsModule,
      UsersModule,
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}
