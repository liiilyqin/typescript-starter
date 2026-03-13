import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './helpers/test-app.factory.js';

describe('Events (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /events ──────────────────────────────────────────────────────────

  describe('POST /events', () => {
    it('creates an event and returns 201 with the created entity', async () => {
      const res = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Team meeting',
          startTime: '2024-01-01T14:00:00.000Z',
          endTime: '2024-01-01T15:00:00.000Z',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Team meeting');
      expect(res.body.status).toBe('TODO');
    });

    it('returns 400 when title is missing', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({ startTime: '2024-01-01T14:00:00.000Z', endTime: '2024-01-01T15:00:00.000Z' })
        .expect(400);
    });

    it('returns 400 when an unknown field is sent', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Test',
          startTime: '2024-01-01T14:00:00.000Z',
          endTime: '2024-01-01T15:00:00.000Z',
          unknownField: 'should be rejected',
        })
        .expect(400);
    });
  });

  // ── GET /events/:id ───────────────────────────────────────────────────────

  describe('GET /events/:id', () => {
    it('returns the event when found', async () => {
      const created = await request(app.getHttpServer())
        .post('/events')
        .send({ title: 'Standup', startTime: '2024-01-02T09:00:00.000Z', endTime: '2024-01-02T09:30:00.000Z' });

      const res = await request(app.getHttpServer())
        .get(`/events/${created.body.id}`)
        .expect(200);

      expect(res.body.title).toBe('Standup');
    });

    it('returns 404 for a non-existent id', async () => {
      await request(app.getHttpServer()).get('/events/non-existent-id').expect(404);
    });
  });

  // ── DELETE /events/:id ────────────────────────────────────────────────────

  describe('DELETE /events/:id', () => {
    it('deletes the event and returns 204', async () => {
      const created = await request(app.getHttpServer())
        .post('/events')
        .send({ title: 'To delete', startTime: '2024-01-03T10:00:00.000Z', endTime: '2024-01-03T11:00:00.000Z' });

      await request(app.getHttpServer())
        .delete(`/events/${created.body.id}`)
        .expect(204);

      // Confirm it is gone
      await request(app.getHttpServer())
        .get(`/events/${created.body.id}`)
        .expect(404);
    });

    it('returns 404 when deleting a non-existent event', async () => {
      await request(app.getHttpServer()).delete('/events/no-such-event').expect(404);
    });
  });
});
