"use client";

import { useState } from "react";
import { CustomerBooking } from "@/components/customer-booking";
import { AdminDashboard } from "@/components/admin-dashboard";
import { FeatureShowcase } from "@/components/feature-showcase";
import { BARBER_SHOP } from "@/lib/constants";

type Tab = "book" | "admin" | "features";

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<Tab>("book");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "book", label: "Book Appointment", icon: "\u{1F4C5}" },
    { id: "admin", label: "Admin Dashboard", icon: "\u{1F4CA}" },
    { id: "features", label: "Feature Showcase", icon: "\u26A1" },
  ];

  return (
    <>
      <header className="shop-header">
        <div className="header-content">
          <div className="header-text">
            <h1>{BARBER_SHOP.name}</h1>
            <p className="tagline">{BARBER_SHOP.tagline}</p>
            <p className="location">{BARBER_SHOP.location}</p>
          </div>
          <div className="header-badge">
            <span className="badge-label">Powered by</span>
            <code className="badge-code">SlotKit</code>
            <span className="badge-sub">The Headless Booking Primitive</span>
          </div>
        </div>
      </header>

      <nav className="tab-nav">
        <div className="tab-nav-inner">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="page-container">
        {activeTab === "book" && <CustomerBooking />}
        {activeTab === "admin" && <AdminDashboard />}
        {activeTab === "features" && <FeatureShowcase />}
      </main>

      <footer className="demo-footer">
        <p>
          This is a demo application &mdash; no real appointments are being made.
          All slot computation powered by <code>@slotkit/core</code> pure functions.
        </p>
        <p>
          <strong>SlotKit</strong> &mdash; Open-source scheduling toolkit for developers.
        </p>
      </footer>
    </>
  );
}
