// constants.js 

const STORAGE_DIR = "storage/";
const DATA_FILE = STORAGE_DIR + "bugs.json";
const SUBMISSION_COUNT_FILE = STORAGE_DIR + "submissionCounts.json";
const UPLOADS_DIR_REL_PATH = STORAGE_DIR + "/uploads";

const PASSWORD = process.env.INDEX_PASSWORD;
const MAX_REPORTS_STORAGE_SIZE_GB = process.env.MAX_REPORTS_STORAGE_SIZE_GB;

module.exports = {
  STORAGE_DIR,
  DATA_FILE,
  SUBMISSION_COUNT_FILE,
  UPLOADS_DIR_REL_PATH,
  PASSWORD,
  MAX_REPORTS_STORAGE_SIZE_GB
};
