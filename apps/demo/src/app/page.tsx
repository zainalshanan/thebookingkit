import { SiteNav } from "@/components/site-nav";
import { HeroSection } from "@/components/hero-section";
import { BookingSection } from "@/components/booking-section";
import { EngineShowcaseSection } from "@/components/engine-showcase-section";
import { TeamSchedulingSection } from "@/components/team-scheduling-section";
import { ResourceBookingSection } from "@/components/resource-booking-section";
import { AdvancedFeaturesSection } from "@/components/advanced-features-section";
import { PackageEcosystemSection } from "@/components/package-ecosystem-section";
import { UILibrarySection } from "@/components/ui-library-section";
import { ArchitectureSection } from "@/components/architecture-section";
import { CTAFooterSection } from "@/components/cta-footer-section";

export default function DemoPage() {
  return (
    <>
      <SiteNav />
      <HeroSection />
      <BookingSection />
      <EngineShowcaseSection />
      <TeamSchedulingSection />
      <ResourceBookingSection />
      <AdvancedFeaturesSection />
      <PackageEcosystemSection />
      <UILibrarySection />
      <ArchitectureSection />
      <CTAFooterSection />
    </>
  );
}
