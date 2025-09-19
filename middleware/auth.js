const jwt = require("jsonwebtoken");


module.exports = function auth(req, res, next) {
const token = (req.headers.authorization || "").replace("Bearer ", "");
if (!token) return res.status(401).json({ error: "unauthorized" });
try {
req.user = jwt.verify(token, process.env.JWT_SECRET);
return next();
} catch (e) {
return res.status(401).json({ error: "unauthorized" });
}
}
