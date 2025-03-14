require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const sharp = require("sharp");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT;
const DATA_FILE = "bugs.json";
const SUBMISSION_COUNT_FILE = "submissionCounts.json";
const PASSWORD = process.env.INDEX_PASSWORD; // Define your password here
const MAX_STORAGE_SIZE = 1024 * 1024 * 1024; // 1GB in bytes
const UPLOADS_DIR = path.join(__dirname, "uploads");

// Middleware
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(UPLOADS_DIR));

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Setup storage for uploaded images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage, limits: { files: 3 } });

// Load existing bug reports
const loadBugs = () => {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
  return [];
};

// Save bug reports
const saveBugs = (bugs) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(bugs, null, 2));
};

// Load submission counts
const loadSubmissionCounts = () => {
  if (fs.existsSync(SUBMISSION_COUNT_FILE)) {
    return JSON.parse(fs.readFileSync(SUBMISSION_COUNT_FILE, "utf8"));
  }
  return {}; // Return an empty object if no file exists
};

// Save submission counts
const saveSubmissionCounts = (counts) => {
  fs.writeFileSync(SUBMISSION_COUNT_FILE, JSON.stringify(counts, null, 2));
};

// Helper function to generate hash for duplicate detection
const generateReportHash = (title, description) => {
  return crypto
    .createHash('md5')
    .update(`${title.toLowerCase().trim()}|${description.toLowerCase().trim()}`)
    .digest('hex');
};

// Helper function to check for duplicate reports
const isDuplicateReport = (title, description, reports) => {
  const newHash = generateReportHash(title, description);
  return reports.some(report => generateReportHash(report.title, report.description) === newHash);
};

// Helper function to process image
const processImage = async (filePath) => {
  try {
    // Generate a temporary output path with a different name
    const tempOutputPath = path.join(
      path.dirname(filePath),
      `temp-${path.basename(filePath).replace(/\.[^/.]+$/, "")}.jpg`
    );
    
    // Process the image to the temporary file
    await sharp(filePath)
      .resize(2048, 2048, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toFile(tempOutputPath);
    
    // Delete original file after successful processing
    fs.unlinkSync(filePath);
    
    // Rename the temp file to the desired output path if needed
    const finalOutputPath = filePath.replace(/\.[^/.]+$/, ".jpg");
    fs.renameSync(tempOutputPath, finalOutputPath);
    
    return finalOutputPath;
  } catch (error) {
    console.error("Error in image processing:", error);
    // Return the original file path if processing fails
    return filePath;
  }
};

// Helper function to calculate directory size
const getDirectorySize = (directoryPath) => {
  let totalSize = 0;
  const files = fs.readdirSync(directoryPath);
  
  files.forEach(file => {
    const filePath = path.join(directoryPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isFile()) {
      totalSize += stats.size;
    }
  });
  
  return totalSize;
};

// Helper function to get file info with creation time
const getFileInfoWithDate = (directoryPath) => {
  return fs.readdirSync(directoryPath).map(file => {
    const filePath = path.join(directoryPath, file);
    const stats = fs.statSync(filePath);
    return {
      path: filePath,
      file: file,
      size: stats.size,
      createdAt: stats.birthtime || stats.ctime // Use birthtime if available, otherwise creation time
    };
  });
};

// Function to clean up old files when storage exceeds limit
const cleanupStorage = () => {
  const currentSize = getDirectorySize(UPLOADS_DIR);
  
  // If current size is below the limit, do nothing
  if (currentSize < MAX_STORAGE_SIZE) {
    return;
  }
  
  console.log(`Storage exceeds limit (${(currentSize / 1024 / 1024).toFixed(2)}MB). Cleaning up...`);
  
  // Get all files with their creation dates
  const files = getFileInfoWithDate(UPLOADS_DIR);
  
  // Sort by creation time (oldest first)
  files.sort((a, b) => a.createdAt - b.createdAt);
  
  // Delete oldest files until we're under the limit
  let deletedSize = 0;
  let filesDeleted = 0;
  
  for (const file of files) {
    try {
      fs.unlinkSync(file.path);
      deletedSize += file.size;
      filesDeleted++;
      
      // Check if we've freed up enough space
      if (currentSize - deletedSize < MAX_STORAGE_SIZE * 0.9) { // Aim for 90% of max to avoid frequent cleanups
        break;
      }
    } catch (error) {
      console.error(`Error deleting file ${file.path}:`, error);
    }
  }
  
  console.log(`Deleted ${filesDeleted} files (${(deletedSize / 1024 / 1024).toFixed(2)}MB)`);
  
  // Update bug reports to remove references to deleted files
  const bugReports = loadBugs();
  let modified = false;
  
  // Get current list of files after cleanup
  const remainingFiles = new Set(fs.readdirSync(UPLOADS_DIR).map(file => `/uploads/${file}`));
  
  bugReports.forEach(bug => {
    if (bug.photos && bug.photos.length > 0) {
      const validPhotos = bug.photos.filter(photo => {
        // Extract the filename from the path
        const fileName = path.basename(photo);
        return remainingFiles.has(`/uploads/${fileName}`);
      });
      
      if (validPhotos.length !== bug.photos.length) {
        bug.photos = validPhotos;
        modified = true;
      }
    }
  });
  
  if (modified) {
    saveBugs(bugReports);
    console.log("Updated bug reports to remove references to deleted files");
  }
};

// Endpoint to submit bug reports
app.post("/report", upload.array("photos", 3), async (req, res) => {
  const { title, description } = req.body;
  const userIp = req.ip; // Get the user's IP address

  // Check for empty fields
  if (!title || !description || title.trim() === '' || description.trim() === '') {
    // Delete uploaded files if request fails
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, file.filename));
        } catch (error) {
          console.error("Error deleting file:", error);
        }
      });
    }
    return res.status(400).json({ error: "Title and description are required and cannot be empty." });
  }

  // Load submission counts from file
  let submissionCounts = loadSubmissionCounts();

  // Check if user has exceeded submission limit
  if (submissionCounts[userIp] && submissionCounts[userIp] >= 10) {
    // Delete uploaded files if request fails
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, file.filename));
        } catch (error) {
          console.error("Error deleting file:", error);
        }
      });
    }
    return res.status(400).json({ error: "You have reached the maximum number of reports." });
  }

  const bugReports = loadBugs();
  
  // Check for duplicate reports
  if (isDuplicateReport(title, description, bugReports)) {
    // Delete uploaded files if request fails
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, file.filename));
        } catch (error) {
          console.error("Error deleting file:", error);
        }
      });
    }
    return res.status(400).json({ error: "This appears to be a duplicate report." });
  }

  // Check storage size and clean up if necessary before processing new images
  cleanupStorage();

  const photoPaths = [];

  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        const newPhotoPath = await processImage(path.join(UPLOADS_DIR, file.filename)); // Process image
        photoPaths.push(`/uploads/${path.basename(newPhotoPath)}`);
      } catch (error) {
        console.error("Error processing image:", error);
      }
    }
  }

  const newBug = {
    id: Date.now(),
    title: title.trim(),
    description: description.trim(),
    photos: photoPaths,
    timestamp: new Date(),
    reportHash: generateReportHash(title, description)
  };

  bugReports.push(newBug);
  saveBugs(bugReports);

  // Increment submission count for the user's IP
  submissionCounts[userIp] = (submissionCounts[userIp] || 0) + 1;
  saveSubmissionCounts(submissionCounts); // Save updated submission counts

  res.json({ message: "Bug report submitted successfully!", bug: newBug });
});

// Endpoint to retrieve bug reports (supports sorting and searching)
app.get("/reports", (req, res) => {
  let bugReports = loadBugs();

  // Sorting by newest
  if (req.query.sort === "desc") {
    bugReports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Searching by term in title or description
  if (req.query.search) {
    const searchTerm = req.query.search.toLowerCase();
    bugReports = bugReports.filter(
      (bug) =>
        bug.title.toLowerCase().includes(searchTerm) ||
        bug.description.toLowerCase().includes(searchTerm)
    );
  }

  res.json(bugReports);
});

// Password-protected route for serving index.html
app.get("/", (req, res) => {
  // Check if the password parameter matches the correct password
  if (req.query.password === PASSWORD) {
    res.sendFile(path.join(__dirname, "index.html"));
  } else {
    // If password is incorrect or not provided, send an access denied response
    res.status(401).send("Access Denied: Invalid password");
  }
});

// Route to check storage status (protected by password)
app.get("/storage-status", (req, res) => {
  if (req.query.password !== PASSWORD) {
    return res.status(401).send("Access Denied: Invalid password");
  }
  
  const currentSize = getDirectorySize(UPLOADS_DIR);
  const usedPercentage = (currentSize / MAX_STORAGE_SIZE) * 100;
  
  res.json({
    totalStorage: `${(MAX_STORAGE_SIZE / 1024 / 1024 / 1024).toFixed(2)} GB`,
    usedStorage: `${(currentSize / 1024 / 1024).toFixed(2)} MB`,
    usedPercentage: `${usedPercentage.toFixed(2)}%`,
    fileCount: fs.readdirSync(UPLOADS_DIR).length
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  
  // Check storage on startup
  const currentSize = getDirectorySize(UPLOADS_DIR);
  console.log(`Current storage usage: ${(currentSize / 1024 / 1024).toFixed(2)}MB / ${MAX_STORAGE_SIZE / 1024 / 1024}MB`);
  
  // Clean up storage if needed
  if (currentSize > MAX_STORAGE_SIZE) {
    cleanupStorage();
  }
});