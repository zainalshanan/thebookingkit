export function PackageEcosystemSection() {
  const packages = [
    {
      name: "@thebookingkit/core",
      version: "0.2.0",
      env: "universal",
      envLabel: "Browser / Edge / Node",
      description:
        "The scheduling math engine. Framework-agnostic pure functions for slot computation, team scheduling, recurring bookings, routing forms, payments, kiosk, and walk-in.",
      exports: [
        "getAvailableSlots",
        "getTeamSlots",
        "assignHost",
        "computeBookingLimits",
        "generateOccurrences",
        "computeSeatAvailability",
        "estimateWaitTime",
        "evaluateRoutingRules",
        "evaluateCancellationFee",
        "resolveKioskSettings",
        "generateEmbedSnippet",
      ],
      snippet: `import { getAvailableSlots } from "@thebookingkit/core";

const slots = getAvailableSlots(
  rules, overrides, bookings,
  { start, end }, timezone,
  { duration: 30, bufferBefore: 5 }
);`,
    },
    {
      name: "@thebookingkit/server",
      version: "0.2.0",
      env: "node",
      envLabel: "Node / Edge",
      description:
        "Backend infrastructure: auth adapters, webhook signing, API key management, email templates, background job adapters, booking tokens, and multi-tenancy utilities.",
      exports: [
        "AuthAdapter",
        "EmailAdapter",
        "JobAdapter",
        "CalendarAdapter",
        "signWebhook",
        "verifyWebhook",
        "createApiKey",
        "withSerializableRetry",
      ],
      snippet: `import { withSerializableRetry } from "@thebookingkit/server";

// Automatically retries on SQLSTATE 40001
const booking = await withSerializableRetry(
  () => db.transaction(createBooking)
);`,
    },
    {
      name: "@thebookingkit/db",
      version: "0.2.0",
      env: "node",
      envLabel: "Node (Postgres)",
      description:
        "Drizzle ORM schema and migrations for PostgreSQL 15+. Includes btree_gist extension for EXCLUDE constraints, audit triggers, and GDPR helpers.",
      exports: [
        "bookings",
        "providers",
        "eventTypes",
        "availabilityRules",
        "bookingEvents",
        "schema",
        "migrate",
      ],
      snippet: `import { db } from "@thebookingkit/db";
import { bookings } from "@thebookingkit/db/schema";

// Drizzle ORM — type-safe queries
const upcoming = await db
  .select()
  .from(bookings)
  .where(eq(bookings.status, "confirmed"));`,
    },
    {
      name: "@thebookingkit/d1",
      version: "0.2.0",
      env: "edge",
      envLabel: "Cloudflare D1 / Edge",
      description:
        "Cloudflare D1 (SQLite) adapter with UTC date codec, advisory locking for double-booking prevention, and weekly schedule conversion utilities.",
      exports: [
        "D1DateCodec",
        "d1DayQuery",
        "D1BookingLock",
        "weeklyScheduleToRules",
        "runMigrations",
      ],
      snippet: `import { D1BookingLock } from "@thebookingkit/d1";

// Advisory lock prevents double-bookings
// on Cloudflare D1 (no SKIP LOCKED)
const lock = new D1BookingLock(db);
await lock.withLock(slotKey, createBooking);`,
    },
    {
      name: "@thebookingkit/cli",
      version: "0.2.0",
      env: "cli",
      envLabel: "CLI Tool",
      description:
        "Scaffolding CLI for adding components, running database migrations, and initializing new projects. Uses the registry.json component manifest.",
      exports: [
        "npx thebookingkit init",
        "npx thebookingkit add",
        "npx thebookingkit migrate",
        "npx thebookingkit list",
      ],
      snippet: `# Scaffold a new project
npx thebookingkit init my-booking-app

# Add a UI component from the registry
npx thebookingkit add booking-calendar

# Run database migrations
npx thebookingkit migrate`,
    },
  ];

  return (
    <section className="section-shell alt" id="packages">
      <div className="section-inner">
        <div className="section-header">
          <span className="section-eyebrow">Package Ecosystem</span>
          <h2 className="section-title-lg">Five Focused Packages</h2>
          <p className="section-desc">
            Each package has a single responsibility and clear boundaries. Use only what you need.
          </p>
        </div>

        <div className="packages-grid">
          {packages.map((pkg) => (
            <div key={pkg.name} className="package-card">
              <div className="package-card-header">
                <span className="package-name">{pkg.name}</span>
                <span className="package-version">v{pkg.version}</span>
                <span className={`package-env-tag ${pkg.env}`}>{pkg.envLabel}</span>
              </div>

              <p className="package-desc">{pkg.description}</p>

              <div className="package-exports">
                {pkg.exports.slice(0, 6).map((exp) => (
                  <span key={exp} className="package-export-tag">
                    {exp}
                  </span>
                ))}
                {pkg.exports.length > 6 && (
                  <span className="package-export-tag" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                    +{pkg.exports.length - 6} more
                  </span>
                )}
              </div>

              <pre className="package-snippet">{pkg.snippet}</pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
