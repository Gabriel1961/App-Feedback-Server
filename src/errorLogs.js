const express = require("express");
const path = require("path");
const router = express.Router();

const { createLog, searchLogs, removeLogsByUserIP, queryLogsByDay } = require("./db/storage");
const { checkLimit } = require("./rateLimit");

router.delete("/deletelogs", (req, res) => {
	const { PASSWORD, userIP } = req.query;
	if (PASSWORD != process.env.INDEX_PASSWORD) return res.status(401).send("Access Denied: Invalid");

	removeLogsByUserIP(userIP);
});

router.get("/logs", (req, res) => {
	try {
    const { search, type, dateStart, dateEnd, PASSWORD } = req.query;
		if (PASSWORD != process.env.INDEX_PASSWORD)
			return res.status(401).send("Access Denied: Invalid");
    
    let logs = [];
		if (search) {
      logs = searchLogs(search, type);
		} else if (dateStart && dateEnd) {
      logs = queryLogsByDay(dateStart, dateEnd);
		}
    
    logs.sort((a, b) => b.count - a.count);
    
		res.json(logs.filter((log) => log.type === type));
	} catch (error) {
		console.error("Error fetching bug reports:", error);
		res.status(500).json({ error: "Failed to load bug reports." });
	}
});

router.post("/log", async (req, res) => {
	if (checkLimit(req.ip, "reportLogs") === false)
		return res.status(429).json({ error: "Too many requests, please try again later." });

	const { logs } = req.body;

  let success = false
	logs.forEach((element) => {
		const { title, trace, type } = element;
		if (title && trace && type) {
			createLog(title, trace, type, req.ip);
      success = true
		}
	});

	res.json({ success });
});

module.exports = {
	logReportRoutes: router,
};
