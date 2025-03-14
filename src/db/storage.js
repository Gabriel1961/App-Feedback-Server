const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Helper function to generate a hash
function generateHash(...args) {
	return crypto.createHash("sha256").update(args.join("")).digest("hex");
}

// Helper function to generate a report hash
function generateReportHash(title, description) {
	return generateHash(title, description);
}

// Helper function to get today's date in YYYY-MM-DD format
function getTodayDate() {
	return new Date().toISOString().split("T")[0];
}

// Helper function to ensure a directory exists
function ensureDirectoryExists(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

// Paths for BugReports and Logs folders
const BUG_REPORTS_DIR = path.join(__dirname, "Storage/BugReports");
const LOGS_DIR = path.join(__dirname, "Storage/Logs");

ensureDirectoryExists(BUG_REPORTS_DIR);
ensureDirectoryExists(LOGS_DIR);

// Create a bug report
function createBugReport(title, description, logs, photos, userIP) {
	const today = getTodayDate();
	const filePath = path.join(BUG_REPORTS_DIR, `${today}.json`);

	let reports = [];
	if (fs.existsSync(filePath)) {
		reports = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	const bugReport = {
		id: Date.now(),
		userIP: userIP,
		title: title.trim(),
		description: description.trim(),
		logs: logs,
		photos: photos,
		timestamp: new Date(),
		reportHash: generateReportHash(title, description),
	};

	reports.push(bugReport);
	fs.writeFileSync(filePath, JSON.stringify(reports, null, 2));
}

// Query bug reports by pages (sorted by date)
function queryBugReportsByPage(page, pageSize) {
	const files = fs.readdirSync(BUG_REPORTS_DIR).sort().reverse();
	const allReports = [];

	files.forEach((file) => {
		const filePath = path.join(BUG_REPORTS_DIR, file);
		const reports = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		allReports.push(...reports);
	});

	const start = (page - 1) * pageSize;
	const end = start + pageSize;
	return allReports.slice(start, end);
}

// Search bug reports by content (title and description)
function searchBugReports(query) {
	const files = fs.readdirSync(BUG_REPORTS_DIR);
	const results = [];

	files.forEach((file) => {
		const filePath = path.join(BUG_REPORTS_DIR, file);
		const reports = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		reports.forEach((report) => {
			if (report.title.includes(query) || report.description.includes(query)) {
				results.push(report);
			}
		});
	});

	return results;
}

// Create a log entry
function createLog(title, trace, type, userIP) {
	const today = getTodayDate();
	const filePath = path.join(LOGS_DIR, `${today}.json`);

	let logs = [];
	if (fs.existsSync(filePath)) {
		logs = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	const hash = generateHash(title, trace);
	const existingLogIndex = logs.findIndex((l) => l.hash === hash);

	if (existingLogIndex !== -1) {
		// Update the existing log
		logs[existingLogIndex].count += 1;
		logs[existingLogIndex].lastLogTimestamp = new Date();
	} else {
		// Add a new log
		logs.push({
			lastLogTimestamp: new Date(),
			count: 1,
			title: title,
			trace: trace,
			userIP: userIP,
			type: type,
			hash: hash,
		});
	}

	fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
}

// Query logs by day
function queryLogsByDay(date) {
	const filePath = path.join(LOGS_DIR, `${date}.json`);

	if (fs.existsSync(filePath)) {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	return [];
}

// Search logs by title and stack trace
function searchLogs(query) {
	const files = fs.readdirSync(LOGS_DIR);
	const results = [];

	files.forEach((file) => {
		const filePath = path.join(LOGS_DIR, file);
		const logs = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		logs.forEach((log) => {
			if (log.title.includes(query) || log.trace.includes(query)) {
				results.push(log);
			}
		});
	});

	return results;
}

// Remove bug reports by userIP
function removeBugReportsByUserIP(userIP) {
	const files = fs.readdirSync(BUG_REPORTS_DIR);

	files.forEach((file) => {
		const filePath = path.join(BUG_REPORTS_DIR, file);
		let reports = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		// Filter out reports with the specified userIP
		reports = reports.filter((report) => report.userIP !== userIP);

		// Write the updated reports back to the file
		fs.writeFileSync(filePath, JSON.stringify(reports, null, 2));
	});
}

// Remove logs by userIP
function removeLogsByUserIP(userIP) {
	const files = fs.readdirSync(LOGS_DIR);

	files.forEach((file) => {
		const filePath = path.join(LOGS_DIR, file);
		let logs = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		// Filter out logs with the specified userIP
		logs = logs.filter((log) => log.userIP !== userIP);

		// Write the updated logs back to the file
		fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
	});
}

module.exports = {
	createBugReport,
	queryBugReportsByPage,
	searchBugReports,
	createLog,
	queryLogsByDay,
	searchLogs,
	generateReportHash,
	generateHash,
  removeLogsByUserIP,
  removeBugReportsByUserIP
};
