const express = require("express");
const path = require("path");
const multer = require("multer");
const router = express.Router();

const { processImageAndStore, deleteImagesByIP, PHOTOS_DIR } = require("./db/imageStorage");
const { tryCreateBugReport, queryBugReportsByDay, searchBugReports, queryBugReportsPages, removeBugReportsByUserIP, removeLogsByUserIP } = require("./db/storage");
const {checkLimit} = require("./rateLimit")

// Setup storage for uploaded images

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, PHOTOS_DIR);
	},
	filename: (req, file, cb) => {
		const idx = req.files ? req.files.length + 1 : 1; // Get the index based on the number of files uploaded
		const ext = path.extname(file.originalname); // Get the file extension
		cb(null, `$temp-${idx}${ext}`);
	},
});

const upload = multer({ storage, limits: { files: 3 } });

router.get("/reports", (req, res) => {
	try {
		const { search, date, PASSWORD } = req.query;
    if (PASSWORD != process.env.INDEX_PASSWORD) 
      return res.status(401).send("Access Denied: Invalid")

		let reports;

		if (search) {
			reports = searchBugReports(search);
		} else if(date) {
			reports = queryBugReportsByDay(date);
		}
    else {
      const result = queryBugReportsPages(1, 20)
      reports = result.reports
    }

		reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

		res.json(reports);
	} catch (error) {
		console.error("Error fetching bug reports:", error);
		res.status(500).json({ error: "Failed to load bug reports." });
	}
});


router.delete("/deletereports", (req, res) => {
  const { PASSWORD, userIP } = req.query;
  if (PASSWORD != process.env.INDEX_PASSWORD) 
    return res.status(401).send("Access Denied: Invalid")

  removeBugReportsByUserIP(userIP)
});

router.post("/report", upload.array("photos", 3), async (req, res) => {
  if(checkLimit(req.ip,"reportBug") === false)
    return res.status(429).json({error: "Too many requests, please try again later."})

	const { title, description, logs } = req.body;
	if (!title || !description || title.trim() === "" || description.trim() === "") {
		return res.status(400).json({ error: "Title and description are required." });
	}

	const photoPaths = req.files
		? await Promise.all(
				req.files.map((file, idx) =>
					processImageAndStore(path.join(PHOTOS_DIR, file.filename), idx, req.ip)
				)
		  )
		: [];

	const [success, newBug] = tryCreateBugReport(
		title.trim(),
		description.trim(),
		logs,
		photoPaths,
		req.ip
	);


	if (success) {
		res.json({ message: "Bug report submitted successfully!", bug: newBug });
	} else {
		res.json({ message: "Bug duplicate!" });
	}
});

module.exports = {
	bugReportRoutes: router,
};
