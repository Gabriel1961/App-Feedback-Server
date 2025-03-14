// Require the constants from constants.js
require("dotenv").config();
const {
	STORAGE_DIR,
	UPLOADS_DIR_REL_PATH,
	PASSWORD,
	MAX_REPORTS_STORAGE_SIZE_GB,
} = require("./src/constants");

const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT;

console.log(STORAGE_DIR);
// Ensure storage directories exist
if (!fs.existsSync(STORAGE_DIR)) {
	fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

console.log(UPLOADS_DIR_REL_PATH);
if (!fs.existsSync(UPLOADS_DIR_REL_PATH)) {
	fs.mkdirSync(UPLOADS_DIR_REL_PATH, { recursive: true });
}

const { bugReportRoutes, getDirectorySize, cleanupStorage } = require("./src/bugReports");

// Middleware
app.use(express.json());
app.use(cors());
app.use("/storage/uploads", express.static(UPLOADS_DIR_REL_PATH));

// Mount bug report routes
app.use(bugReportRoutes);

// Password-protected route for serving index.html
app.get("/bugReports", (req, res) => {
	// Check if the password parameter matches the correct password
	if (req.query.password === PASSWORD) {
		res.sendFile(path.join(__dirname, "pages/bugReports.html"));
	} else {
		// If password is incorrect or not provided, send an access denied response
		res.status(401).send("Access Denied: Invalid password");
	}
});

// Start the server
app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);

	// Check storage on startup and clean up if needed
	const currentSize = getDirectorySize(UPLOADS_DIR_REL_PATH);
	console.log(
		`Current storage usage: ${(currentSize / 1024 / 1024).toFixed(
			2
		)}MB / ${MAX_REPORTS_STORAGE_SIZE_GB} GB`
	);

	if (currentSize > MAX_REPORTS_STORAGE_SIZE_GB) {
		cleanupStorage();
	}
});
