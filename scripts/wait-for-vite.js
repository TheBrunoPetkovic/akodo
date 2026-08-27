import http from "node:http";

const maxRetries = 30;
const interval = 500;

function checkVite(retries = 0) {
  const req = http.get("http://localhost:5173", (res) => {
    res.resume();
    if (res.statusCode === 200) {
      process.exit(0);
    }
    retry(retries);
  });

  req.on("error", () => retry(retries));
  req.setTimeout(2000, () => {
    req.destroy();
    retry(retries);
  });
}

function retry(retries) {
  if (retries >= maxRetries) {
    console.error("Vite dev server did not start in time");
    process.exit(1);
  }
  setTimeout(() => checkVite(retries + 1), interval);
}

checkVite();
