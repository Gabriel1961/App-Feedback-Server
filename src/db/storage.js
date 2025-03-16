const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { deleteImagesByIP } = require("./imageStorage");

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
const BUG_REPORTS_DIR = path.join(process.cwd(), "/storage/bugReports");
const LOGS_DIR = path.join(process.cwd(), "/storage/logs");

if (!fs.existsSync(BUG_REPORTS_DIR)) {
	fs.mkdirSync(BUG_REPORTS_DIR, { recursive: true });
}
if (!fs.existsSync(LOGS_DIR)) {
	fs.mkdirSync(LOGS_DIR, { recursive: true });
}

ensureDirectoryExists(BUG_REPORTS_DIR);
ensureDirectoryExists(LOGS_DIR);

// Create a log entry
function createLog(title, trace, type, count, userIP) {
	const today = getTodayDate();
	const filePath = path.join(LOGS_DIR, `${today}.json`);

	let logs = [];
	if (fs.existsSync(filePath)) {
		logs = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	const hash = generateHash(title, trace, type);
	const existingLogIndex = logs.findIndex((l) => l.hash === hash);

	if (existingLogIndex !== -1) {
		// Update the existing log
		logs[existingLogIndex].count += count;
		logs[existingLogIndex].lastLogTimestamp = new Date();
		if (!logs[existingLogIndex].userIPs.includes(userIP)) {
			logs[existingLogIndex].userIPs.push(userIP);
		}
	} else {
		// Add a new log
		logs.push({
			lastLogTimestamp: new Date(),
			count: count,
			title: title,
			trace: trace,
			userIPs: [userIP],
			type: type,
			hash: hash,
		});
	}

	fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
}

// Query logs by day
function queryLogsByDay(startDate, endDate) {
	const start = new Date(startDate);
	const end = new Date(endDate == null ? startDate : endDate);
	const files = fs.readdirSync(LOGS_DIR);
	const logMap = new Map(); // Use a Map to efficiently track logs by hash

	files.forEach((file) => {
		const fileDate = new Date(file.split(".")[0]);
		if (fileDate >= start && fileDate <= end) {
			const filePath = path.join(LOGS_DIR, file);
			const logs = JSON.parse(fs.readFileSync(filePath, "utf-8"));

			logs.forEach((log) => {
				if (logMap.has(log.hash)) {
					// Update existing log entry
					const existingLog = logMap.get(log.hash);
					existingLog.count += log.count;
					if (new Date(log.lastLogTimestamp) > new Date(existingLog.lastLogTimestamp)) {
						existingLog.lastLogTimestamp = log.lastLogTimestamp;
					}
					// Union userIPs
					existingLog.userIPs = Array.from(new Set([...existingLog.userIPs, ...log.userIPs]));
				} else {
					// Add new log entry
					logMap.set(log.hash, { ...log });
				}
			});
		}
	});

	return Array.from(logMap.values());
}

// Search logs by title and stack trace
function searchLogs(query, type) {
	const files = fs.readdirSync(LOGS_DIR);
	const results = [];
	const lowerCaseQuery = query.toLowerCase();

	files.forEach((file) => {
		const filePath = path.join(LOGS_DIR, file);
		const logs = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		logs.forEach((log) => {
			if (
				log.type === type &&
				(log.title.toLowerCase().includes(lowerCaseQuery) ||
					log.trace.toLowerCase().includes(lowerCaseQuery))
			) {
				results.push(log);
			}
		});
	});

	return results;
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

// Try to create a bug report, checking for duplicates on the same day
function tryCreateBugReport(title, description, logs, photos, userIP) {
	const today = getTodayDate();
	const filePath = path.join(BUG_REPORTS_DIR, `${today}.json`);

	let reports = [];
	if (fs.existsSync(filePath)) {
		reports = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	const reportHash = generateReportHash(title, description);

	// Check if a report with the same hash already exists today
	const isDuplicate = reports.some((report) => report.reportHash === reportHash);
	if (isDuplicate) {
		return [false, null]; // Duplicate found, do not add another report
	}

	const bugReport = {
		id: Date.now(),
		userIP: userIP,
		title: title.trim(),
		description: description.trim(),
		logs: logs,
		photos: photos.map((photo) => {
			let noBackslashes = photo.replaceAll("\\", "/");
			let subs = noBackslashes.substring(noBackslashes.indexOf("/storage"));
			return subs;
		}),
		timestamp: new Date(),
		reportHash: reportHash,
	};

	reports.push(bugReport);
	fs.writeFileSync(filePath, JSON.stringify(reports, null, 2));
	return [true, bugReport]; // Report successfully added
}

// Query bug reports by pages (sorted by date)
function queryBugReportsByDay(date) {
	const filePath = path.join(BUG_REPORTS_DIR, `${date}.json`);

	if (fs.existsSync(filePath)) {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	return [];
}

// Search bug reports by content (title and description)
function searchBugReports(query) {
	const lowerCaseQuery = query.toLowerCase();
	const files = fs.readdirSync(BUG_REPORTS_DIR);
	const results = [];

	files.forEach((file) => {
		const filePath = path.join(BUG_REPORTS_DIR, file);
		const reports = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		reports.forEach((report) => {
			if (
				report.title.toLowerCase().includes(lowerCaseQuery) ||
				report.description.toLowerCase().includes(lowerCaseQuery)
			) {
				results.push(report);
			}
		});
	});

	return results;
}

// Query bug reports with pagination
function queryBugReportsPages(page = 1, reportsPerPage = 10) {
	// Get all files and sort them by date (newest first)
	const files = fs
		.readdirSync(BUG_REPORTS_DIR)
		.filter((file) => file.endsWith(".json"))
		.sort((a, b) => {
			// Compare dates in filenames (YYYY-MM-DD.json)
			const dateA = a.split(".")[0];
			const dateB = b.split(".")[0];
			return dateB.localeCompare(dateA);
		});

	const totalFiles = files.length;
	let reportsCount = 0;
	let currentFile = 0;
	const startIndex = (page - 1) * reportsPerPage;
	const reports = [];

	// Count total reports and collect needed reports
	while (currentFile < totalFiles && reports.length < reportsPerPage) {
		const filePath = path.join(BUG_REPORTS_DIR, files[currentFile]);
		const fileReports = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		// If we haven't reached the start index yet
		if (reportsCount + fileReports.length <= startIndex) {
			reportsCount += fileReports.length;
			currentFile++;
			continue;
		}

		// Calculate which reports we need from this file
		const fileStartIndex = Math.max(0, startIndex - reportsCount);
		const fileEndIndex = Math.min(
			fileReports.length,
			fileStartIndex + (reportsPerPage - reports.length)
		);

		reports.push(...fileReports.slice(fileStartIndex, fileEndIndex));
		reportsCount += fileReports.length;
		currentFile++;
	}

	// Calculate total reports and pages
	const totalReports = files.reduce((total, file) => {
		const filePath = path.join(BUG_REPORTS_DIR, file);
		return total + JSON.parse(fs.readFileSync(filePath, "utf-8")).length;
	}, 0);

	return {
		reports,
		currentPage: page,
		totalPages: Math.ceil(totalReports / reportsPerPage),
		totalReports,
		reportsPerPage,
	};
}

// Remove bug reports by userIP
function removeBugReportsByUserIP(userIP) {
	const files = fs.readdirSync(BUG_REPORTS_DIR);

	deleteImagesByIP(userIP);	

	files.forEach((file) => {
		const filePath = path.join(BUG_REPORTS_DIR, file);
		let reports = JSON.parse(fs.readFileSync(filePath, "utf-8"));

		// Filter out reports with the specified userIP
		reports = reports.filter((report) => report.userIP !== userIP);

		// Write the updated reports back to the file
		fs.writeFileSync(filePath, JSON.stringify(reports, null, 2));
	});
}


module.exports = {
	queryBugReportsByDay,
	queryLogsByDay,
	searchBugReports,
	createLog,
	tryCreateBugReport,
	searchLogs,
	removeLogsByUserIP,
	removeBugReportsByUserIP,
	getTodayDate,
	queryBugReportsPages,
};
