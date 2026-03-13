import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/test-app.factory.js';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /users ───────────────────────────────────────────────────────────

  describe('POST /users', () => {
    it('creates a user and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Alice' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Alice');
    });

    it('returns 400 when name is missing', async () => {
      await request(app.getHttpServer()).post('/users').send({}).expect(400);
    });
  });

  // ── POST /users/:userId/merge-all ─────────────────────────────────────────

  describe('POST /users/:userId/merge-all', () => {
    it('returns 404 when user does not exist', async () => {
      await request(app.getHttpServer())
        .post('/users/no-such-user/merge-all')
        .expect(404);
    });

    it('returns [] when user has no events', async () => {
      const user = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Bob' });

      const res = await request(app.getHttpServer())
        .post(`/users/${user.body.id}/merge-all`)
        .expect(201);

      expect(res.body).toEqual([]);
    });

    it('merges two overlapping events and removes originals', async () => {
      // Create user
      const userRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Carol' });
      const userId = userRes.body.id as string;

      // Create E1: 2pm–3pm with Carol as invitee
      const e1Res = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'E1',
          startTime: '2024-06-01T14:00:00.000Z',
          endTime:   '2024-06-01T15:00:00.000Z',
          inviteeIds: [userId],
        });

      // Create E2: 2:45pm–4pm with Carol as invitee
      const e2Res = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'E2',
          startTime: '2024-06-01T14:45:00.000Z',
          endTime:   '2024-06-01T16:00:00.000Z',
          inviteeIds: [userId],
        });

      // Merge
      const mergeRes = await request(app.getHttpServer())
        .post(`/users/${userId}/merge-all`)
        .expect(201);

      expect(mergeRes.body).toHaveLength(1);
      const merged = mergeRes.body[0] as Record<string, unknown>;
      expect(merged.title).toBe('E1 + E2');
      expect(merged.startTime).toBe('2024-06-01T14:00:00.000Z');
      expect(merged.endTime).toBe('2024-06-01T16:00:00.000Z');

      // Originals should be gone
      await request(app.getHttpServer()).get(`/events/${e1Res.body.id}`).expect(404);
      await request(app.getHttpServer()).get(`/events/${e2Res.body.id}`).expect(404);
    });

    it('leaves non-overlapping events untouched', async () => {
      const userRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Dave' });
      const userId = userRes.body.id as string;

      // E1: 9am–10am, E2: 11am–12pm — no overlap
      const e1Res = await request(app.getHttpServer())
        .post('/events')
        .send({ title: 'Morning', startTime: '2024-06-02T09:00:00.000Z', endTime: '2024-06-02T10:00:00.000Z', inviteeIds: [userId] });
      const e2Res = await request(app.getHttpServer())
        .post('/events')
        .send({ title: 'Noon',    startTime: '2024-06-02T11:00:00.000Z', endTime: '2024-06-02T12:00:00.000Z', inviteeIds: [userId] });

      const mergeRes = await request(app.getHttpServer())
        .post(`/users/${userId}/merge-all`)
        .expect(201);

      expect(mergeRes.body).toEqual([]);

      // Both originals should still exist
      await request(app.getHttpServer()).get(`/events/${e1Res.body.id}`).expect(200);
      await request(app.getHttpServer()).get(`/events/${e2Res.body.id}`).expect(200);
    });
  });
});
