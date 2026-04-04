export function ArchitectureSection() {
  const adapters = [
    {
      name: "AuthAdapter",
      purpose: "Authentication & session management",
      default: "NextAuth.js 5.x",
      alts: ["Clerk", "Supabase Auth", "Lucia", "Custom JWT"],
    },
    {
      name: "EmailAdapter",
      purpose: "Transactional email delivery",
      default: "Resend",
      alts: ["SendGrid", "AWS SES", "Postmark", "Nodemailer"],
    },
    {
      name: "JobAdapter",
      purpose: "Background jobs & queues",
      default: "Inngest 3.x",
      alts: ["Trigger.dev", "BullMQ", "Vercel Cron"],
    },
    {
      name: "CalendarAdapter",
      purpose: "External calendar sync",
      default: "Google Calendar OAuth",
      alts: ["Apple Calendar (CalDAV)", "Outlook", "No-op"],
    },
    {
      name: "StorageAdapter",
      purpose: "Secrets & encrypted config",
      default: "Env var key",
      alts: ["AWS KMS", "HashiCorp Vault", "Vercel Env"],
    },
    {
      name: "SmsAdapter",
      purpose: "SMS notifications & reminders",
      default: "Twilio",
      alts: ["Vonage", "AWS SNS", "No-op"],
    },
  ];

  return (
    <section className="section-shell alt" id="architecture">
      <div className="section-inner">
        <div className="section-header centered">
          <span className="section-eyebrow">Architecture</span>
          <h2 className="section-title-lg">Three-Layer Design</h2>
          <p className="section-desc" style={{ margin: "0 auto" }}>
            Clean separation between scheduling logic, backend infrastructure, and database schema.
            Swap any external dependency without touching your booking logic.
          </p>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, rgba(233, 69, 96, 0.08), rgba(233, 69, 96, 0.02))",
            border: "1px solid rgba(233, 69, 96, 0.2)",
            borderRadius: "var(--radius)",
            padding: "1.25rem 1.5rem",
            marginBottom: "2rem",
            fontSize: "0.88rem",
            lineHeight: 1.6,
            color: "var(--text)",
          }}
        >
          <strong style={{ color: "var(--accent)" }}>The NextAuth Pattern:</strong>{" "}
          NextAuth gives you <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em" }}>getServerSession()</code>.
          thebookingkit gives you <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em" }}>getAvailableSlots()</code>.
          Same idea &mdash; a composable primitive you drop into your app. You already solved auth; now solve bookings the same way.
        </div>

        <div className="arch-diagram">
          <div className="arch-layer arch-layer-core">
            <div className="arch-layer-label">Layer 1</div>
            <div className="arch-layer-name">@thebookingkit/core</div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              Pure scheduling math — no side effects, no I/O, no framework dependencies.
              Works in browser, Node, and Cloudflare Workers.
            </p>
            <div className="arch-layer-items">
              {[
                "getAvailableSlots",
                "getTeamSlots",
                "assignHost",
                "generateOccurrences",
                "computeSeatAvailability",
                "estimateWaitTime",
                "evaluateRoutingRules",
                "evaluateCancellationFee",
              ].map((item) => (
                <span key={item} className="arch-item-tag">{item}</span>
              ))}
            </div>
          </div>

          <div className="arch-arrow">&#8595;</div>

          <div className="arch-layer arch-layer-server">
            <div className="arch-layer-label">Layer 2</div>
            <div className="arch-layer-name">@thebookingkit/server</div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              Backend infrastructure with swappable adapters. Handles auth, email, webhooks,
              background jobs, and booking tokens.
            </p>
            <div className="arch-layer-items">
              {[
                "AuthAdapter",
                "EmailAdapter",
                "JobAdapter",
                "CalendarAdapter",
                "signWebhook",
                "withSerializableRetry",
                "createApiKey",
                "bookingTokens",
              ].map((item) => (
                <span key={item} className="arch-item-tag">{item}</span>
              ))}
            </div>
          </div>

          <div className="arch-arrow">&#8595;</div>

          <div className="arch-layer arch-layer-db">
            <div className="arch-layer-label">Layer 3</div>
            <div className="arch-layer-name">@thebookingkit/db</div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              Drizzle ORM schema for PostgreSQL 15+. EXCLUDE USING gist prevents double-bookings
              at the database level. SERIALIZABLE transactions with retry.
            </p>
            <div className="arch-layer-items">
              {[
                "bookings",
                "providers",
                "eventTypes",
                "availabilityRules",
                "bookingEvents",
                "EXCLUDE USING gist",
                "btree_gist",
              ].map((item) => (
                <span key={item} className="arch-item-tag">{item}</span>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem", color: "var(--brand)" }}>
            Adapter Swap Table
          </h3>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto" }}>
            <table className="adapter-table">
              <thead>
                <tr>
                  <th>Adapter</th>
                  <th>Purpose</th>
                  <th>Default</th>
                  <th>Alternatives</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((adapter) => (
                  <tr key={adapter.name}>
                    <td>
                      <span className="adapter-name">{adapter.name}</span>
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {adapter.purpose}
                    </td>
                    <td>
                      <span className="adapter-default">{adapter.default}</span>
                    </td>
                    <td>
                      <div className="adapter-alts">
                        {adapter.alts.map((alt) => (
                          <span key={alt} className="adapter-alt-tag">{alt}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
