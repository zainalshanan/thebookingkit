"use client";

import { useState } from "react";

function CopyCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cta-command">
      <span className="cta-command-label">{label}</span>
      <code>{command}</code>
      <button className="cta-copy-btn" onClick={handleCopy} aria-label={`Copy: ${command}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function CTAFooterSection() {
  return (
    <footer className="cta-footer" id="install">
      <div className="cta-footer-inner">
        <h2 className="cta-title">
          Ready to add{" "}
          <span className="accent">bookings</span> to your app?
        </h2>
        <p className="cta-subtitle">
          Open source, MIT licensed. Works with any Postgres 15+ database.
          No vendor lock-in, no monthly fees. E2E tested with Docker.
        </p>

        <div className="cta-commands">
          <div>
            <CopyCommand command="npx thebookingkit init" label="Quick Start" />
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Scaffolds project config, env template, and component directory with interactive adapter selection
            </p>
          </div>
          <div>
            <CopyCommand command="npm install @thebookingkit/core" label="Core Only" />
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Just the scheduling engine &mdash; pure functions, zero framework dependencies
            </p>
          </div>
          <div>
            <CopyCommand command="npm install @thebookingkit/core @thebookingkit/server @thebookingkit/db" label="Full Stack" />
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Engine + server adapters + database schema for complete booking system
            </p>
          </div>
        </div>

        <div className="cta-links">
          <a
            href="https://docs.thebookingkit.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-link primary"
          >
            Read the Docs
          </a>
          <a
            href="https://github.com/zainalshanan/thebookingkit"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-link secondary"
          >
            View on GitHub
          </a>
          <a
            href="https://docs.thebookingkit.dev/changelog"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-link secondary"
          >
            Changelog
          </a>
        </div>

        <div className="cta-site-footer">
          <div>
            <div className="cta-footer-brand">
              The<span>Booking</span>Kit
            </div>
            <div className="cta-footer-note">
              The NextAuth of Scheduling &mdash; MIT License
            </div>
          </div>
          <div className="cta-footer-links">
            <a href="https://docs.thebookingkit.dev" target="_blank" rel="noopener noreferrer" className="cta-footer-link">
              docs.thebookingkit.dev
            </a>
            <a href="https://github.com/zainalshanan/thebookingkit" target="_blank" rel="noopener noreferrer" className="cta-footer-link">
              GitHub
            </a>
            <a href="https://docs.thebookingkit.dev" target="_blank" rel="noopener noreferrer" className="cta-footer-link">
              Docs
            </a>
          </div>
          <div className="cta-footer-note">
            Demo app &mdash; no real appointments are being made.
            <br />
            All slot computation powered by <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.9em" }}>@thebookingkit/core</code>.
          </div>
        </div>
      </div>
    </footer>
  );
}
