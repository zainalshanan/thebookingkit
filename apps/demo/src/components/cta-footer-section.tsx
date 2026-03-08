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
          Ready to build your{" "}
          <span className="accent">booking system</span>?
        </h2>
        <p className="cta-subtitle">
          Open source, MIT licensed. Works with any Postgres 15+ database.
          No vendor lock-in, no monthly fees.
        </p>

        <div className="cta-commands">
          <CopyCommand command="npm install @thebookingkit/core" label="Core Engine" />
          <CopyCommand command="npm install @thebookingkit/server" label="Backend" />
          <CopyCommand command="npx thebookingkit init" label="CLI Init" />
        </div>

        <div className="cta-links">
          <a
            href="https://thebookingkit.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-link primary"
          >
            Read the Docs
          </a>
          <a
            href="https://github.com/thebookingkit/slotkit"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-link secondary"
          >
            View on GitHub
          </a>
          <a
            href="https://thebookingkit.dev/changelog"
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
              The Headless Booking Primitive &mdash; MIT License
            </div>
          </div>
          <div className="cta-footer-links">
            <a href="https://thebookingkit.dev" target="_blank" rel="noopener noreferrer" className="cta-footer-link">
              thebookingkit.dev
            </a>
            <a href="https://github.com/thebookingkit/slotkit" target="_blank" rel="noopener noreferrer" className="cta-footer-link">
              GitHub
            </a>
            <a href="https://thebookingkit.dev/docs" target="_blank" rel="noopener noreferrer" className="cta-footer-link">
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
