require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT;

const { PHOTOS_DIR, MAX_STORAGE_SIZE, getDirectorySize } = require("./src/db/imageStorage");
const { bugReportRoutes } = require("./src/bugReports");
const { logReportRoutes } = require("./src/errorLogs");
const PASSWORD = process.env.INDEX_PASSWORD;

// Middleware
app.use(express.json());
app.use(cors());
app.use("/storage/photos", express.static(PHOTOS_DIR));

// Mount bug report routes
app.use(bugReportRoutes);
app.use(logReportRoutes);

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

// Password-protected route for serving index.html
app.get("/logReports", (req, res) => {
	// Check if the password parameter matches the correct password
	if (req.query.password === PASSWORD) {
		res.sendFile(path.join(__dirname, "pages/logReports.html"));
	} else {
		// If password is incorrect or not provided, send an access denied response
		res.status(401).send("Access Denied: Invalid password");
	}
});

// Start the server
app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
	console.log(
		`Current storage usage: ${(getDirectorySize(PHOTOS_DIR) / 1024 / 1024).toFixed(1)} MB / ${(
			MAX_STORAGE_SIZE /
			1028 /
			1024 /
			1024
		).toFixed(1)} GB`
	);
});
