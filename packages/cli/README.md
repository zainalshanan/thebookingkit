# @thebookingkit/cli

CLI for scaffolding UI components and managing migrations in Booking Kit projects.

[![npm version](https://img.shields.io/npm/v/@thebookingkit/cli)](https://www.npmjs.com/package/@thebookingkit/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

Part of [The Booking Kit](https://docs.thebookingkit.dev) — The Headless Booking Primitive.

## Install

```bash
npm install -g @thebookingkit/cli
# or run directly
npx @thebookingkit/cli
```

## Quick Start

```bash
# Initialize a new project with config and env template
thebookingkit init

# Add a UI component (shadcn/ui convention — you own the source)
thebookingkit add calendar-view

# List all available components
thebookingkit list

# Run pending database migrations
thebookingkit migrate
```

## Key Features

- **Component Registry** — Browse and add from 21+ React components and hooks
- **Dependency Resolution** — Automatically adds required component dependencies
- **Project Init** — Generates `slotkit.config.ts` and `.env` template
- **Migration Management** — Parse, list pending, and run database migrations
- **Manifest Tracking** — Tracks added components and detects local modifications
- **Copy-Paste Convention** — Components are copied into your project; you own and customize the source

## Documentation

[**Full Documentation**](https://docs.thebookingkit.dev/components/overview/)

## License

MIT
