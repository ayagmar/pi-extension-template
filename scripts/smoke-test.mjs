import("./../src/index.ts")
  .then(() => {
    console.log("✓ Extension loads");
  })
  .catch((error) => {
    console.error("✗ Extension failed to load:", error);
    process.exitCode = 1;
  });
