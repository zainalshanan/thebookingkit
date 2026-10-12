// Imports each published package's built entry under plain Node ESM (no
// bundler). Catches dependencies whose named exports only resolve inside a
// bundler — e.g. rrule's UMD main — before they ship. Run after `turbo build`.
const packages = ["core", "d1", "server", "db", "cli"];

let failed = false;
for (const name of packages) {
  const entry = new URL(`../packages/${name}/dist/index.js`, import.meta.url);
  try {
    const mod = await import(entry.href);
    console.log(`ok   @thebookingkit/${name} (${Object.keys(mod).length} exports)`);
  } catch (err) {
    failed = true;
    console.error(`FAIL @thebookingkit/${name}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
