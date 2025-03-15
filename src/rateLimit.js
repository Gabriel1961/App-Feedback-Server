// make a rate limiter for each user ip for actions that have different names for instance: for "reportBug" the limit should be , "reportLogs", save it to a json file in storage/limits.json, make an expiration time of an amount say for 7 days, don't use classes, save on program close and load on program open

const fs = require("fs").promises;
const path = require("path");

const LIMITS_FILE = path.join(process.cwd(), "/storage/limits.json");
const EXPIRATION_DAYS = 3;
const SAVE_INTERVAL = 60 * 30 * 1000; // 30 minutes
const LIMITS = {
	reportBug: 15, // 5 reports per week
	reportLogs: 1000, // 10 log submissions per week
};

let rateLimits = {};

async function loadLimits() {
	try {
		const data = await fs.readFile(LIMITS_FILE, "utf8");
		rateLimits = JSON.parse(data);

		// Clean expired entries
		const now = Date.now();
		for (const ip in rateLimits) {
			for (const action in rateLimits[ip]) {
				if (now > rateLimits[ip][action].expires) {
					delete rateLimits[ip][action];
				}
			}
			if (Object.keys(rateLimits[ip]).length === 0) {
				delete rateLimits[ip];
			}
		}
	} catch (error) {
		if (error.code !== "ENOENT") {
			console.error("Error loading rate limits:", error);
		}
		rateLimits = {};
	}
}

async function saveLimits() {
	try {
		await fs.mkdir(path.dirname(LIMITS_FILE), { recursive: true });
		await fs.writeFile(LIMITS_FILE, JSON.stringify(rateLimits, null, 2));
	} catch (error) {
		console.error("Error saving rate limits:", error);
	}
}

function checkLimit(ip, action) {
	if (!LIMITS[action]) {
		throw new Error(`Unknown action: ${action}`);
	}

	const now = Date.now();
	rateLimits[ip] = rateLimits[ip] || {};

	if (!rateLimits[ip][action] || now > rateLimits[ip][action].expires) {
		rateLimits[ip][action] = {
			count: 1,
			expires: now + EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
		};
		return true;
	}

	if (rateLimits[ip][action].count >= LIMITS[action]) {
		return false;
	}

	rateLimits[ip][action].count++;
	return true;
}

// Load limits when module is imported
loadLimits();

// Save limits before program exits
const autoSaveInterval = setInterval(async () => {
  await saveLimits();
}, SAVE_INTERVAL);

// Modify exit handlers to clear the interval
process.on("SIGINT", async () => {
  clearInterval(autoSaveInterval);
  await saveLimits();
  process.exit();
});

process.on("SIGTERM", async () => {
  clearInterval(autoSaveInterval);
  await saveLimits();
  process.exit();
});


module.exports = {
	checkLimit,
	saveLimits,
	loadLimits,
};
