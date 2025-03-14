const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const crypto = require("crypto");
const {
  STORAGE_DIR,
  DATA_FILE,
  SUBMISSION_COUNT_FILE,
  UPLOADS_DIR_REL_PATH,
  PASSWORD,
  MAX_REPORTS_STORAGE_SIZE_GB
} = require("./constants");

const router = express.Router();
const MAX_STORAGE_SIZE = MAX_REPORTS_STORAGE_SIZE_GB * 1024 * 1024 * 1024;

// Setup storage for uploaded images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR_REL_PATH);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage, limits: { files: 3 } });

const loadBugs = () => {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
  return [];
};

const saveBugs = (bugs) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(bugs, null, 2));
};

const loadSubmissionCounts = () => {
  if (fs.existsSync(SUBMISSION_COUNT_FILE)) {
    return JSON.parse(fs.readFileSync(SUBMISSION_COUNT_FILE, "utf8"));
  }
  return {};
};

const saveSubmissionCounts = (counts) => {
  fs.writeFileSync(SUBMISSION_COUNT_FILE, JSON.stringify(counts, null, 2));
};

const generateReportHash = (title, description) => {
  return crypto
    .createHash('md5')
    .update(`${title.toLowerCase().trim()}|${description.toLowerCase().trim()}`)
    .digest('hex');
};

const isDuplicateReport = (title, description, reports) => {
  const newHash = generateReportHash(title, description);
  return reports.some(report => generateReportHash(report.title, report.description) === newHash);
};

const processImage = async (filePath) => {
  try {
    const tempOutputPath = path.join(
      path.dirname(filePath),
      `temp-${path.basename(filePath).replace(/\.[^/.]+$/, "")}.jpg`
    );

    await sharp(filePath)
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toFile(tempOutputPath);

    if (fs.existsSync(filePath)) {
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.unlinkSync(filePath);
    }

    const finalOutputPath = filePath.replace(/\.[^/.]+$/, ".jpg");
    try {
      fs.renameSync(tempOutputPath, finalOutputPath);
    } catch (renameError) {
      console.warn("Could not rename temp file:", renameError.message);
      return tempOutputPath;
    }

    return finalOutputPath;
  } catch (error) {
    console.error("Error in image processing:", error);
    return filePath;
  }
};

const getDirectorySize = (directoryPath) => {
  let totalSize = 0;
  fs.readdirSync(directoryPath).forEach(file => {
    const filePath = path.join(directoryPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      totalSize += stats.size;
    }
  });
  return totalSize;
};

router.post("/report", upload.array("photos", 3), async (req, res) => {
  const { title, description, logs } = req.body;
  const userIp = req.ip;
  if (!title || !description || title.trim() === '' || description.trim() === '') {
    return res.status(400).json({ error: "Title and description are required." });
  }

  let submissionCounts = loadSubmissionCounts();
  if (submissionCounts[userIp] && submissionCounts[userIp] >= 10) {
    return res.status(400).json({ error: "Submission limit reached." });
  }

  const bugReports = loadBugs();
  if (isDuplicateReport(title, description, bugReports)) {
    return res.status(400).json({ error: "Duplicate report." });
  }

  cleanupStorage();
  const photoPaths = req.files ? await Promise.all(req.files.map(file => processImage(path.join(UPLOADS_DIR_REL_PATH, file.filename)))) : [];

  const newBug = { id: Date.now(), title: title.trim(), description: description.trim(), logs, photos: photoPaths, timestamp: new Date(), reportHash: generateReportHash(title, description) };
  bugReports.push(newBug);
  saveBugs(bugReports);

  submissionCounts[userIp] = (submissionCounts[userIp] || 0) + 1;
  saveSubmissionCounts(submissionCounts);
  res.json({ message: "Bug report submitted successfully!", bug: newBug });
});

module.exports = {
  bugReportRoutes:router,
  getDirectorySize,
  cleanupStorage
}