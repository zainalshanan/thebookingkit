# Contributing to The Booking Kit

First off, thank you for considering contributing! It's people like you that make open source such a great community.

## Development Workflow

This is a monorepo using **Turborepo** and **npm workspaces**.

1.  **Fork** the repository and clone it locally.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Build packages**:
    ```bash
    npm run build
    ```
4.  **Run tests**:
    ```bash
    npm test
    ```

## Adding Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs. 

If your PR includes changes that should be reflected in a new version (bug fixes, features, etc.), please add a changeset:

```bash
npx changeset
```

Follow the prompts to select the affected packages and describe the change. Commit the generated markdown file in the `.changeset` directory.

## Pull Request Process

1.  Create a new branch for your feature or fix.
2.  Ensure tests pass and the code is linted.
3.  Include a changeset if applicable.
4.  Submit a Pull Request.
5.  All PRs require approval from the maintainers before merging.

## Code of Conduct

Please be respectful and professional in all interactions.

---

*The Booking Kit — The Headless Booking Primitive*
