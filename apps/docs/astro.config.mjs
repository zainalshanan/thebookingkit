// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import react from '@astrojs/react';

export default defineConfig({
    integrations: [starlight({
        title: 'The Booking Kit',
        description: 'The Headless Booking Primitive — open-source scheduling toolkit for Next.js and Postgres. Currently in Beta.',
        social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/zainalshanan/thebookingkit' }],
        editLink: {
            baseUrl: 'https://github.com/zainalshanan/thebookingkit/edit/main/apps/docs/',
        },
        customCss: ['./src/styles/custom.css'],
        sidebar: [
            {
                label: 'Getting Started',
                items: [
                    { label: 'Introduction', slug: 'getting-started/introduction' },
                    { label: 'Installation', slug: 'getting-started/installation' },
                    { label: 'Quick Start', slug: 'getting-started/quick-start' },
                    { label: 'Architecture', slug: 'getting-started/architecture' },
                    { label: 'Examples & Use Cases', slug: 'getting-started/examples' },
                    { label: 'Comparison', slug: 'getting-started/comparison' },
                    { label: 'Why Not Cal.com?', slug: 'getting-started/calcom-shortcomings' },
                ],
            },
            {
                label: 'Core Concepts',
                items: [
                    { label: 'Slot Engine', slug: 'core-concepts/slot-engine' },
                    { label: 'Availability Rules', slug: 'core-concepts/availability-rules' },
                    { label: 'Booking Lifecycle', slug: 'core-concepts/booking-lifecycle' },
                    { label: 'Timezone Handling', slug: 'core-concepts/timezone-handling' },
                    { label: 'Double-Booking Prevention', slug: 'core-concepts/double-booking-prevention' },
                ],
            },
            {
                label: 'Features',
                items: [
                    { label: 'Event Types', slug: 'features/event-types' },
                    { label: 'Booking Questions', slug: 'features/booking-questions' },
                    { label: 'Confirmation Mode', slug: 'features/confirmation-mode' },
                    { label: 'Team Scheduling', slug: 'features/team-scheduling' },
                    { label: 'Recurring Bookings', slug: 'features/recurring-bookings' },
                    { label: 'Seat & Group Bookings', slug: 'features/seats' },
                    { label: 'Resource & Capacity Booking', slug: 'features/resource-booking' },
                    { label: 'Slot Release Strategies', slug: 'features/slot-release' },
                    { label: 'Payments & Stripe', slug: 'features/payments' },
                    { label: 'Workflow Automation', slug: 'features/workflows' },
                    { label: 'Webhooks', slug: 'features/webhooks' },
                    { label: 'Routing Forms', slug: 'features/routing-forms' },
                    { label: 'Notifications & Email', slug: 'features/notifications' },
                    { label: 'Calendar Sync', slug: 'features/calendar-sync' },
                    { label: 'Embed Modes', slug: 'features/embed' },
                    { label: 'REST API', slug: 'features/rest-api' },
                    { label: 'Multi-Tenancy', slug: 'features/multi-tenancy' },
                ],
            },
            {
                label: 'UI Components',
                collapsed: false,
                items: [
                    { label: 'Overview', slug: 'components/overview' },
                    {
                        label: 'Booking Flow',
                        collapsed: true,
                        items: [
                            { label: 'BookingCalendar', slug: 'components/booking-calendar' },
                            { label: 'TimeSlotPicker', slug: 'components/time-slot-picker' },
                            { label: 'BookingQuestions', slug: 'components/booking-questions' },
                            { label: 'BookingConfirmation', slug: 'components/booking-confirmation' },
                            { label: 'BookingStatusBadge', slug: 'components/booking-status-badge' },
                            { label: 'BookingManagementView', slug: 'components/booking-management-view' },
                            { label: 'RecurringBookingPicker', slug: 'components/recurring-booking-picker' },
                            { label: 'SeatsPicker', slug: 'components/seats-picker' },
                            { label: 'RoutingForm', slug: 'components/routing-form' },
                        ],
                    },
                    {
                        label: 'Admin & Host',
                        collapsed: true,
                        items: [
                            { label: 'AvailabilityEditor', slug: 'components/availability-editor' },
                            { label: 'OverrideManager', slug: 'components/override-manager' },
                            { label: 'AdminScheduleView', slug: 'components/admin-schedule-view' },
                            { label: 'BookingLifecycleActions', slug: 'components/booking-lifecycle-actions' },
                            { label: 'ManualBookingForm', slug: 'components/manual-booking-form' },
                            { label: 'ProviderAuth', slug: 'components/provider-auth' },
                            { label: 'TeamAssignmentEditor', slug: 'components/team-assignment-editor' },
                            { label: 'WorkflowBuilder', slug: 'components/workflow-builder' },
                            { label: 'WebhookManager', slug: 'components/webhook-manager' },
                        ],
                    },
                    {
                        label: 'Payments',
                        collapsed: true,
                        items: [
                            { label: 'PaymentGate', slug: 'components/payment-gate' },
                            { label: 'PaymentHistory', slug: 'components/payment-history' },
                        ],
                    },
                    {
                        label: 'Embed',
                        collapsed: true,
                        items: [
                            { label: 'EmbedConfigurator', slug: 'components/embed-configurator' },
                        ],
                    },
                    {
                        label: 'Walk-In Queue',
                        collapsed: true,
                        items: [
                            { label: 'WalkInEntryForm', slug: 'components/walk-in-entry-form' },
                            { label: 'WalkInToggle', slug: 'components/walk-in-toggle' },
                            { label: 'WalkInAnalytics', slug: 'components/walk-in-analytics' },
                            { label: 'QueueDisplay', slug: 'components/queue-display' },
                            { label: 'QueueManager', slug: 'components/queue-manager' },
                            { label: 'QueueTicket', slug: 'components/queue-ticket' },
                        ],
                    },
                    {
                        label: 'Kiosk',
                        collapsed: true,
                        items: [
                            { label: 'KioskCalendar', slug: 'components/kiosk-calendar' },
                            { label: 'KioskSettingsPanel', slug: 'components/kiosk-settings-panel' },
                            { label: 'KioskShell', slug: 'components/kiosk-shell' },
                            { label: 'BreakBlockForm', slug: 'components/break-block-form' },
                        ],
                    },
                ],
            },
            {
                label: 'Database',
                items: [
                    { label: 'Schema Overview', slug: 'database/schema' },
                    { label: 'Migrations', slug: 'database/migrations' },
                    { label: 'Adapters', slug: 'database/adapters' },
                ],
            },
            {
                label: 'Deployment',
                items: [
                    { label: 'Database Setup', slug: 'deployment/database' },
                    { label: 'Vercel', slug: 'deployment/vercel' },
                    { label: 'Background Jobs', slug: 'deployment/background-jobs' },
                ],
            },
            {
                label: 'API Reference',
                autogenerate: { directory: 'api-reference' },
            },
            {
                label: 'Tools',
                items: [
                    { label: 'RRULE Generator', slug: 'tools/rrule-generator' },
                ],
            },
            {
                label: 'Roadmap',
                items: [
                    { label: 'Upcoming Features', slug: 'roadmap/upcoming' },
                ],
            },
            {
                label: 'Release Notes',
                items: [
                    { label: 'Changelog', slug: 'changelog' },
                ],
            },
        ],
		}), react()],
});