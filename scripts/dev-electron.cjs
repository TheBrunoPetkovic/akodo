const { spawn } = require("child_process");
const path = require("path");

const electron = path.join(__dirname, "..", "node_modules", ".bin", "electron.cmd");
const appDir = path.join(__dirname, "..");

const child = spawn(electron, [".", "--no-sandbox"], {
  cwd: appDir,
  env: { ...process.env, NODE_ENV: "development" },
  stdio: "inherit",
  shell: true,
});

child.on("error", (err) => {
  console.error("ELECTRON ERROR:", err);
});

child.on("exit", (code) => {
  console.log("ELECTRON EXITED with code:", code);
  process.exit(code);
});
