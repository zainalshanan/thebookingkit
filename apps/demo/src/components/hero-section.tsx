"use client";

import { useState } from "react";

export function HeroSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("npm install @thebookingkit/core").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="hero-section" id="hero">
      <div className="hero-inner">
        <div className="hero-left">
          <span className="hero-eyebrow">Open Source &bull; MIT License &bull; v0.1.1</span>

          <h1 className="hero-title">
            The Headless{" "}
            <span className="accent">Booking</span>{" "}
            Primitive
          </h1>

          <p className="hero-subtitle">
            Production-grade scheduling infrastructure for developers. Drop-in slot engine,
            Drizzle ORM schema, and copy-paste React components. Ship a full booking system
            in hours, not weeks.
          </p>

          <div className="hero-npm">
            <span className="hero-npm-label">npm</span>
            <code>npm install @thebookingkit/core</code>
            <button className="hero-npm-copy" onClick={handleCopy} aria-label="Copy install command">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="hero-ctas">
            <a href="#booking" className="btn-hero-primary">
              See Live Demo
            </a>
            <a
              href="https://docs.thebookingkit.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-hero-secondary"
            >
              Read the Docs
            </a>
          </div>

          <div className="hero-links">
            <a
              href="https://github.com/zainalshanan/thebookingkit"
              target="_blank"
              rel="noopener noreferrer"
              className="hero-link"
            >
              GitHub
            </a>
            <a
              href="https://docs.thebookingkit.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hero-link"
            >
              Documentation
            </a>
            <a
              href="https://docs.thebookingkit.dev/changelog"
              target="_blank"
              rel="noopener noreferrer"
              className="hero-link"
            >
              Changelog
            </a>
          </div>
        </div>

        <div className="hero-right">
          <div className="hero-code-window">
            <div className="code-window-bar">
              <span className="code-dot code-dot-red" />
              <span className="code-dot code-dot-yellow" />
              <span className="code-dot code-dot-green" />
              <span className="code-window-filename">route.ts</span>
            </div>
            <div className="code-window-body">
              <pre>
                <span className="code-comment">{"// Server action — zero config required\n"}</span>
                <span className="code-kw">{"import"}</span>
                {" { "}
                <span className="code-obj">{"getAvailableSlots"}</span>
                {" } "}
                <span className="code-kw">{"from"}</span>
                {" "}
                <span className="code-str">{"\"@thebookingkit/core\""}</span>
                {"\n\n"}
                <span className="code-kw">{"const"}</span>
                {" "}
                <span className="code-obj">{"slots"}</span>
                {" = "}
                <span className="code-fn">{"getAvailableSlots"}</span>
                {"(\n"}
                {"  "}
                <span className="code-comment">{"// RRULE-based availability windows\n"}</span>
                {"  rules,    "}
                <span className="code-comment">{"// AvailabilityRuleInput[]\n"}</span>
                {"  overrides, "}
                <span className="code-comment">{"// date-specific changes\n"}</span>
                {"  bookings,  "}
                <span className="code-comment">{"// existing confirmed bookings\n"}</span>
                {"  range,     "}
                <span className="code-comment">{"// { start: Date, end: Date }\n"}</span>
                {"  "}
                <span className="code-str">{"\"America/New_York\""}</span>
                {",\n"}
                {"  {\n"}
                {"    "}
                <span className="code-prop">{"duration"}</span>
                {": "}
                <span className="code-num">{"30"}</span>
                {",       "}
                <span className="code-comment">{"// minutes\n"}</span>
                {"    "}
                <span className="code-prop">{"bufferBefore"}</span>
                {": "}
                <span className="code-num">{"5"}</span>
                {",\n"}
                {"    "}
                <span className="code-prop">{"bufferAfter"}</span>
                {": "}
                <span className="code-num">{"5"}</span>
                {",\n"}
                {"  }\n"}
                {")\n\n"}
                <span className="code-comment">{"// slots → Slot[] with localStart,\n"}</span>
                <span className="code-comment">{"//   startTime, endTime — ready to render\n"}</span>
                <span className="code-obj">{"slots"}</span>
                {"."}
                <span className="code-fn">{"length"}</span>
                {" "}
                <span className="code-comment">{"// → 22 available\n"}</span>
              </pre>
            </div>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">623</div>
              <div className="hero-stat-label">Unit Tests</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">5</div>
              <div className="hero-stat-label">Packages</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">21+</div>
              <div className="hero-stat-label">UI Components</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
