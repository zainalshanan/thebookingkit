// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	integrations: [
		starlight({
			title: 'SlotKit',
			description: 'The Headless Booking Primitive — open-source scheduling toolkit for Next.js and Postgres.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/your-org/slotkit' }],
			editLink: {
				baseUrl: 'https://github.com/your-org/slotkit/edit/main/packages/docs/',
			},
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
						{ label: 'Architecture', slug: 'getting-started/architecture' },
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
					items: [
						{ label: 'Overview', slug: 'components/overview' },
						{ label: 'BookingCalendar', slug: 'components/booking-calendar' },
						{ label: 'TimeSlotPicker', slug: 'components/time-slot-picker' },
						{ label: 'BookingQuestions', slug: 'components/booking-questions' },
						{ label: 'BookingConfirmation', slug: 'components/booking-confirmation' },
						{ label: 'AvailabilityEditor', slug: 'components/availability-editor' },
						{ label: 'AdminScheduleView', slug: 'components/admin-schedule-view' },
						{ label: 'WorkflowBuilder', slug: 'components/workflow-builder' },
						{ label: 'WebhookManager', slug: 'components/webhook-manager' },
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
					label: 'Roadmap',
					items: [
						{ label: 'Upcoming Features', slug: 'roadmap/upcoming' },
					],
				},
			],
		}),
	],
});
