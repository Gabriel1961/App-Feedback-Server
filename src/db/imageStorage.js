const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const MAX_STORAGE_SIZE = process.env.MAX_REPORTS_STORAGE_SIZE_GB * 1024 * 1024 * 1024;
const PHOTOS_DIR = path.join(process.cwd(), "/storage/photos");

if (!fs.existsSync(PHOTOS_DIR)) {
	fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}


const processImageAndStore = async (filePath, imageIdx, userIP) => {
	cleanupStorage();

	try {
		const timeStamp = Date.now();
		const finalOutputPath = path.join(
			path.dirname(filePath),
			`${userIP.replace(/:/g, "-")}-${timeStamp}-${imageIdx}.jpg`
		);

		await sharp(filePath)
			.resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
			.jpeg({ quality: 90 })
			.toFile(finalOutputPath);

		if (fs.existsSync(filePath)) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			fs.unlinkSync(filePath);
		}

		return finalOutputPath;
	} catch (error) {
		console.error("Error in image processing:", error);
		return filePath;
	}
};

const getDirectorySize = (directoryPath) => {
	let totalSize = 0;
	fs.readdirSync(directoryPath).forEach((file) => {
		const filePath = path.join(directoryPath, file);
		const stats = fs.statSync(filePath);
		if (stats.isFile()) {
			totalSize += stats.size;
		}
	});
	return totalSize;
};

const cleanupStorage = () => {
	const currentSize = getDirectorySize(PHOTOS_DIR);
	if (currentSize > MAX_STORAGE_SIZE) {
		// Get all files with their timestamps
		const files = fs
			.readdirSync(PHOTOS_DIR)
			.map((file) => ({
				name: file,
				time: fs.statSync(path.join(PHOTOS_DIR, file)).mtime.getTime(), // Get last modified time
			}))
			.sort((a, b) => a.time - b.time); // Sort by oldest first

		// Select the 10 oldest files
		const filesToDelete = files.slice(0, 10);

		// Delete the selected files
		filesToDelete.forEach((file) => {
			const filePath = path.join(PHOTOS_DIR, file.name);
			fs.unlinkSync(filePath);
			console.log(`Deleted file: ${filePath}`);
		});

		console.log(`Deleted ${filesToDelete.length} oldest files.`);
	}
};

const deleteImagesByIP = (userIP) => {
	try {
		// Sanitize the IP address to match the filename format
		const sanitizedIP = userIP.replace(/:/g, "-");

		// Read all files in the upload directory
		const files = fs.readdirSync(PHOTOS_DIR);

		// Filter files that match the IP address
		const filesToDelete = files.filter((file) => file.startsWith(sanitizedIP));

		// Delete each matching file
		filesToDelete.forEach((file) => {
			const filePath = path.join(PHOTOS_DIR, file);
			fs.unlinkSync(filePath);
			console.log(`Deleted file: ${filePath}`);
		});

		console.log(`Deleted ${filesToDelete.length} files for IP: ${userIP}`);
		return filesToDelete.length; // Return the number of deleted files
	} catch (error) {
		console.error(`Error deleting files for IP ${userIP}:`, error);
		throw error;
	}
};

module.exports = {
	PHOTOS_DIR,
	MAX_STORAGE_SIZE,
	processImageAndStore,
	getDirectorySize,
	cleanupStorage,
	deleteImagesByIP,
};
