import { spawn } from "child_process";
import path from "path";

export interface PythonScraperOptions {
  keyword: string;
  url?: string;
  limit?: number;
  platform?: "reddit" | "quora" | "teamblind" | "trustpilot" | "linkedin" | "all";
}

export async function runPythonSocialScraper(options: PythonScraperOptions): Promise<any[]> {
  const platform = options.platform ?? "reddit";

  if (platform === "all") {
    const [redditItems, quoraItems, blindItems, trustpilotItems, linkedinItems] = await Promise.allSettled([
      runSinglePlatformScraper({ ...options, platform: "reddit" }),
      runSinglePlatformScraper({ ...options, platform: "quora" }),
      runSinglePlatformScraper({ ...options, platform: "teamblind" }),
      runSinglePlatformScraper({ ...options, platform: "trustpilot" }),
      runSinglePlatformScraper({ ...options, platform: "linkedin" }),
    ]);
    const rResult = redditItems.status === "fulfilled" ? redditItems.value : [];
    const qResult = quoraItems.status === "fulfilled" ? quoraItems.value : [];
    const bResult = blindItems.status === "fulfilled" ? blindItems.value : [];
    const tResult = trustpilotItems.status === "fulfilled" ? trustpilotItems.value : [];
    const lResult = linkedinItems.status === "fulfilled" ? linkedinItems.value : [];
    return [...rResult, ...qResult, ...bResult, ...tResult, ...lResult];
  }

  return runSinglePlatformScraper(options);
}

// Backward compatible alias
export const runPythonRedditScraper = runPythonSocialScraper;

function runSinglePlatformScraper(options: PythonScraperOptions): Promise<any[]> {
  let scriptName = "manual_reddit_scraper.py";
  const url = options.url?.toLowerCase() ?? "";

  if (options.platform === "quora" || url.includes("quora.com")) {
    scriptName = "manual_quora_scraper.py";
  } else if (options.platform === "teamblind" || url.includes("teamblind.com")) {
    scriptName = "manual_teamblind_scraper.py";
  } else if (options.platform === "trustpilot" || url.includes("trustpilot.com")) {
    scriptName = "manual_trustpilot_scraper.py";
  } else if (options.platform === "linkedin" || url.includes("linkedin.com")) {
    scriptName = "manual_linkedin_scraper.py";
  }

  const scriptPath = path.resolve(__dirname, `../../scripts/${scriptName}`);
  const keyword = options.keyword.trim() || "eb1aexperts.com";
  const limit = options.limit ?? 100;

  const args = ["--keyword", keyword, "--limit", String(limit)];
  if (options.url && options.url.trim()) {
    args.push("--url", options.url.trim());
  }

  // Use python3 on Linux/macOS or fallback to python
  const pythonCmd = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");

  return new Promise((resolve, reject) => {
    const pythonProc = spawn(pythonCmd, [scriptPath, ...args], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdoutData = "";
    let stderrData = "";

    pythonProc.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString("utf-8");
    });

    pythonProc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString("utf-8");
    });

    pythonProc.on("error", (err) => {
      // Fallback try 'python' if 'python3' command failed
      if (pythonCmd === "python3") {
        const fallbackProc = spawn("python", [scriptPath, ...args], {
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });
        let fbStdout = "";
        let fbStderr = "";
        fallbackProc.stdout.on("data", (c) => (fbStdout += c.toString("utf-8")));
        fallbackProc.stderr.on("data", (c) => (fbStderr += c.toString("utf-8")));
        fallbackProc.on("close", (code) => {
          if (code !== 0) return reject(new Error(`Python scraper (${scriptName}) exited with code ${code}. Stderr: ${fbStderr}`));
          try {
            resolve(JSON.parse(fbStdout.trim() || "[]"));
          } catch (e: any) {
            reject(new Error(`Failed to parse output: ${e.message}`));
          }
        });
        return;
      }
      reject(new Error(`Failed to start Python scraper process (${scriptName}): ${err.message}`));
    });

    pythonProc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Python scraper (${scriptName}) exited with code ${code}. Stderr: ${stderrData.slice(0, 500)}`)
        );
      }

      try {
        const trimmed = stdoutData.trim();
        if (!trimmed) return resolve([]);
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          return reject(new Error("Python scraper output was not a valid JSON array."));
        }
        resolve(parsed);
      } catch (err: any) {
        reject(
          new Error(`Failed to parse Python scraper output JSON: ${err.message}. Raw output snippet: ${stdoutData.slice(0, 300)}`)
        );
      }
    });
  });
}
