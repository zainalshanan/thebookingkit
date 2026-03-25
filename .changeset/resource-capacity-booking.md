---
"@thebookingkit/core": minor
"@thebookingkit/db": minor
"@thebookingkit/d1": minor
---

feat: Resource & Capacity-Based Booking (E-22)

Adds resource-based booking to support restaurants, yoga studios, coworking spaces, and any venue with bookable physical units. New functions: `getResourceAvailableSlots`, `assignResource`, `isResourceSlotAvailable`, `getResourcePoolSummary`. New database tables: `resources`, `resource_availability_rules`, `resource_availability_overrides`. D1 adapter extended with resource helpers and locking. Full backward compatibility — existing provider-based booking is unchanged.
