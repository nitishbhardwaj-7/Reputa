const { execSync } = require("child_process");

try {
  console.log("Installing Playwright Python module & full browser suite for cloud environment...");
  try {
    execSync("pip3 install --upgrade playwright || pip install --upgrade playwright", { stdio: "inherit" });
  } catch (e) {
    console.warn("pip install warning:", e.message);
  }

  try {
    execSync("python3 -m playwright install --with-deps || python3 -m playwright install || python -m playwright install || npx playwright install", { stdio: "inherit" });
  } catch (e) {
    console.warn("playwright install warning:", e.message);
  }
} catch (err) {
  console.warn("Notice: Playwright auto-install notice:", err.message);
}
