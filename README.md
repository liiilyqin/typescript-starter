# Events & Users Management API

A NestJS backend service for managing events and users. Supports creating, retrieving, and deleting events, and merging overlapping events for a specific user.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **NestJS** | Backend framework — enforces modular architecture (modules, controllers, services) |
| **TypeScript** | Static typing for safer, more maintainable code |
| **TypeORM** | ORM for database access — handles entity relationships without raw SQL |
| **SQLite (better-sqlite3)** | File-based database — zero configuration, no server required |
| **Jest + Supertest** | Unit and integration testing |

**Why SQLite instead of PostgreSQL?**
SQLite stores data in a single file (`db.sqlite`). Reviewers can clone and run the project immediately with no database server to install or configure. For this assignment, reproducibility matters more than production-scale concerns.

---

## Project Structure

```
src/
  events/
    dto/                    # Request validation (CreateEventDto)
    entities/               # TypeORM entity (Event)
    events.controller.ts    # HTTP route handlers
    events.service.ts       # Business logic + merge algorithm
    events.module.ts        # Module wiring

  users/
    dto/                    # Request validation (CreateUserDto)
    entities/               # TypeORM entity (User)
    users.controller.ts     # HTTP route handlers
    users.service.ts        # User CRUD logic
    users.module.ts         # Module wiring

  app.module.ts             # Root module — database config, imports
  main.ts                   # Entry point — bootstraps app, global validation

test/
  helpers/
    test-app.factory.ts     # Shared in-memory test app for E2E tests
  events.e2e-spec.ts        # Events API integration tests
  users.e2e-spec.ts         # Users + merge-all integration tests
```

---

## System Architecture

```
HTTP Request
     ↓
Controller      — validates input, delegates to service, returns response
     ↓
Service         — business logic (merge algorithm, DB operations)
     ↓
TypeORM Repo    — abstracts database access (save / find / delete)
     ↓
SQLite Database — persists Event and User entities via a junction table
```

The Event–User relationship is **Many-to-Many**: one event can have multiple invitees, one user can attend multiple events. TypeORM manages this through an auto-generated junction table (`event_invitees_user`). The `Event` entity owns the relationship (`@JoinTable()`), so saving an event with an `invitees` array automatically keeps the junction table in sync.

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm run start
```

The server runs at `http://localhost:3000`. The SQLite file (`db.sqlite`) is created automatically on first run — no manual setup required.

---

## API Usage

### Create a user

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'
```

```json
{ "id": "uuid-1", "name": "Alice" }
```

### Create an event

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team sync",
    "description": "Weekly standup",
    "startTime": "2024-06-01T14:00:00.000Z",
    "endTime": "2024-06-01T15:00:00.000Z",
    "inviteeIds": ["uuid-1"]
  }'
```

> `status` defaults to `TODO` if omitted. `description` and `inviteeIds` are optional.

### Get an event by ID

```bash
curl http://localhost:3000/events/<event-id>
```

### Delete an event by ID

```bash
curl -X DELETE http://localhost:3000/events/<event-id>
```

Returns `204 No Content` on success.

### Merge overlapping events for a user

```bash
curl -X POST http://localhost:3000/users/<user-id>/merge-all
```

Returns the list of newly created merged events. Returns `[]` if no events overlap.

---

## Running Tests

### Unit tests (mock database)

```bash
npm test
```

Tests `EventsService` and `UsersService` in isolation using jest mocks — no database required. Fast and focused on business logic.

```
Tests: 17 passed
```

### Integration tests (real in-memory database)

```bash
npm run test:e2e
```

Sends real HTTP requests against a full NestJS app backed by an in-memory SQLite database. Each test run starts with a clean schema (`dropSchema: true`).

```
Tests: 14 passed
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/users` | Create a user |
| `POST` | `/events` | Create an event |
| `GET` | `/events/:id` | Get an event by ID |
| `DELETE` | `/events/:id` | Delete an event by ID |
| `POST` | `/users/:userId/merge-all` | Merge all overlapping events for a user |

---

## Implementation Approach

### Module structure

Each domain (events, users) is a self-contained NestJS module with its own controller, service, and repository. `EventsModule` exports `EventsService` so `UsersController` can call `mergeEventsForUser()` directly — the merge operation lives in `EventsService` because it directly creates and deletes Event records, keeping all Event repository access in one place.

### Request validation

A global `ValidationPipe` (configured in `main.ts`) automatically validates all incoming request bodies against the DTO class decorators. Invalid or unknown fields return a `400` response before reaching the service layer.

---

## Merge Algorithm

`POST /users/:userId/merge-all` runs the following steps:

1. Load the user and their events. Return `[]` if the user has no events.
2. Fetch full event records (with `invitees` loaded) for all event IDs.
3. **Sort events by `startTime` ascending.**
4. **Interval merge pass** — iterate through sorted events, tracking the furthest `endTime` reached in the current group:
   - `next.startTime < groupMaxEndTime` → overlap detected, extend the group.
   - Otherwise → close the current group, start a new one.
5. Skip groups with only one event (nothing to merge).
6. For each merge group: build the merged event fields, save the new event, delete the originals.
7. Return the list of newly created merged events.

### Merged event attribute rules

| Field | Rule |
|---|---|
| `title` | Joined with ` + ` — e.g. `"E1 + E2"` |
| `description` | Non-null values joined with `\n`; `null` if all are null |
| `startTime` | Minimum across the group |
| `endTime` | Maximum across the group |
| `status` | Highest priority: `TODO` > `IN_PROGRESS` > `COMPLETED` |
| `invitees` | Union of all invitees, deduplicated by user ID |

### Database update after merge

Both entities are updated atomically within the loop:
- **Event table**: the merged event is inserted, then the original events are deleted.
- **User.events**: handled implicitly via the junction table — deleting original events removes their junction rows; saving the merged event with `invitees` creates new ones. The net result is that each invitee's event list now contains the merged event instead of the originals.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| User not found | `404 Not Found` |
| User has no events | Returns `[]`, no DB writes |
| No overlapping events | Returns `[]`, all events untouched |
| Two overlapping events | Merged into one; both originals deleted |
| Chained overlaps (A∩B, B∩C) | All three grouped in a single pass — `maxEndTime` tracks the furthest end in the group, not just the previous event |
| Mixed status in a merge group | `TODO` wins — prevents completed status from hiding pending work |
| Some events have no description | Null values filtered out before joining; no blank lines |
| Duplicate invitees across events | Deduplicated by user ID using a `Map` |

---

## Key Design Decisions

**SQLite over PostgreSQL** — eliminates environment setup for reviewers. `synchronize: true` auto-creates tables on startup, removing the need for migration files in development.

**`TODO` as highest merge priority** — a merged event inheriting `COMPLETED` from one sub-event while another was still `TODO` would misrepresent the actual state. Surfacing the highest-urgency status is safer and more actionable.

**Merge is destructive** — original events are deleted and replaced with the merged event. This keeps the Event table clean and avoids ambiguous duplicate records with overlapping time windows.

**`EventsService` owns the merge logic, not `UsersService`** — the operation directly creates and deletes Event records. Placing it in `EventsService` keeps all Event repository access in one place and avoids cross-service coupling.

**Unit tests + E2E tests** — unit tests use jest mocks (fast, cover every branch and edge case); E2E tests use in-memory SQLite (verify HTTP layer, module wiring, real DB behavior). Together they satisfy the requirement to test with both mock and real database.

---

## Future Improvements

- **`GET /users/:id`** — no endpoint currently exists to retrieve a user's event list directly.
- **Pagination** — `mergeEventsForUser` loads all events into memory; users with many events would benefit from batched processing.
- **Richer merge response** — returning a summary (merged count, untouched count, deleted IDs) alongside the new events would be more informative.
- **Migration files** — replace `synchronize: true` with TypeORM migrations before any production deployment.
- **`PATCH /events/:id`** — a natural addition to complete the CRUD API.
- **PostgreSQL support** — the TypeORM config can be swapped to PostgreSQL with a single config change; SQLite is used here for reviewer convenience only.
