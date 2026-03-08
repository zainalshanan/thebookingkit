# E-07 — Team Scheduling (Round-Robin, Collective, Managed)

> **Priority:** Post-MVP · **Sprints:** 7–8 · **Story Points:** 34 · **Release:** R2

Enable multi-provider scheduling with three assignment strategies. This requires the `teams` and `team_members` tables, the `getTeamSlots` engine, and the assignment algorithm.

---

## User Stories

### 7.1 E07-S01 — Team & Member Management `[Must]` · 5 pts

- [x] **Complete**

**As an** admin, **I want to** create a team and add providers as members with roles **so that** I can manage a group of providers as a single bookable entity.

**Acceptance Criteria:**

- [x] Admin creates a team with `name`, `slug`, and `settings`.
- [x] Providers are added as `team_members` with `role` (admin, member), `priority` (low, medium, high), and `weight` (integer, default 100).
- [x] Team admin can update member roles, priorities, and weights.
- [x] Team admin can remove members; their future team bookings are flagged for reassignment.
- [x] `teams` and `team_members` tables are created in a migration addendum.

---

### 7.2 E07-S02 — Round-Robin Scheduling `[Must]` · 13 pts

- [x] **Complete**

**As a** customer, **I want to** book a round-robin team event and be automatically assigned the right provider **so that** I get the next available team member without choosing manually.

**Acceptance Criteria:**

- [x] `getTeamSlots(teamId, 'ROUND_ROBIN', dateRange, timezone)` returns the union of all members' available slots.
- [x] `assignHost(teamId, slot, 'ROUND_ROBIN', weights)` selects the host based on: (1) priority level, (2) weight ratio vs. past bookings, (3) availability at the selected time.
- [x] Fixed hosts (flagged on `team_members`) are always assigned; the round-robin rotates among non-fixed members.
- [x] Only confirmed bookings count toward past booking totals.
- [x] Test: 100 sequential bookings across 3 equal-weight members result in roughly 33/33/34 distribution.

---

### 7.3 E07-S03 — Collective Scheduling `[Must]` · 8 pts

- [x] **Complete**

**As a** customer, **I want to** book a collective team event at a time when all required hosts are available **so that** I meet with the full team in one appointment.

**Acceptance Criteria:**

- [x] `getTeamSlots(teamId, 'COLLECTIVE', dateRange, timezone)` returns the intersection of all selected members' availability.
- [x] All team members are added as attendees on the booking.
- [x] If any member becomes unavailable (new booking, override), the slot disappears for future customers.
- [x] Calendar events are created for all hosts on booking confirmation.

---

### 7.4 E07-S04 — Managed Event Types `[Should]` · 5 pts

- [x] **Complete**

**As an** admin, **I want to** create a managed event type template that my team inherits **so that** all team members offer a consistent booking experience.

**Acceptance Criteria:**

- [x] Admin creates an event type on the team with lockable fields (duration, questions, price, buffer).
- [x] Locked fields cannot be modified by team members.
- [x] Unlocked fields allow member personalization (e.g., custom description).
- [x] New members added to the team are auto-assigned the managed event type.
- [x] Changes to the template propagate to all members' inherited event types.

---

### 7.5 E07-S05 — Team Assignment Editor UI `[Should]` · 3 pts

- [x] **Complete**

**As an** admin, **I want to** view a `<TeamAssignmentEditor />` to configure scheduling strategy and weights **so that** I can visually manage how bookings are distributed across my team.

**Acceptance Criteria:**

- [x] Component shows all team members with their role, priority, weight, and recent booking count.
- [x] Admin can switch between `ROUND_ROBIN`, `COLLECTIVE`, `MANAGED`, and `FIXED` strategies per event type.
- [x] Weight sliders allow visual adjustment of distribution ratios.
- [x] A preview section shows estimated distribution based on current weights.
- [x] Changes save to the event type's assignment configuration.
