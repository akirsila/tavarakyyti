const express = require("express");
// Merkitse luetuksi
router.post("/conversations/:id/read", auth, async (req, res) => {
const at = req.body.at ? new Date(req.body.at) : new Date();
const result = await Conversation.updateOne(
{ _id: req.params.id, "participants.userId": req.user.id },
{ $set: { "participants.$.lastReadAt": at } }
);
if (!result.matchedCount) return res.status(404).json({ error: "not_found" });
req.app.get("io").to(`convo:${req.params.id}`).emit("chat:read", { userId: req.user.id, at });
res.json({ ok: true, at });
});


// Upload liite S3:een
router.post("/upload", auth, upload.single("file"), async (req, res) => {
if (!req.file) return res.status(400).json({ error: "file_required" });
const { buffer, mimetype, originalname, size } = req.file;
const meta = await uploadBuffer({ buffer, mime: mimetype, name: originalname });
// Palauta clientille metatiedot lisättäväksi viestiin
res.json(meta);
});


// Raportoi viesti
router.post("/report", auth, async (req, res) => {
const { conversationId, messageId, reason } = req.body;
if (!conversationId && !messageId) return res.status(400).json({ error: "invalid_payload" });
const report = await Report.create({ reporterId: req.user.id, conversationId, messageId, reason });
res.json(report);
});


// Block / Unblock
router.post("/block", auth, async (req, res) => {
const { conversationId, blockedUserId } = req.body;
const convo = await Conversation.findById(conversationId);
if (!convo) return res.status(404).json({ error: "not_found" });
if (!isParticipant(convo, req.user.id)) return res.status(403).json({ error: "forbidden" });
convo.blockedPairs = convo.blockedPairs || [];
if (!convo.blockedPairs.find(bp => String(bp.blocker) === String(req.user.id) && String(bp.blocked) === String(blockedUserId))) {
convo.blockedPairs.push({ blocker: req.user.id, blocked: blockedUserId });
await convo.save();
}
res.json({ ok: true });
});


router.post("/unblock", auth, async (req, res) => {
const { conversationId, blockedUserId } = req.body;
const convo = await Conversation.findById(conversationId);
if (!convo) return res.status(404).json({ error: "not_found" });
if (!isParticipant(convo, req.user.id)) return res.status(403).json({ error: "forbidden" });
convo.blockedPairs = (convo.blockedPairs || []).filter(bp => !(String(bp.blocker) === String(req.user.id) && String(bp.blocked) === String(blockedUserId)));
await convo.save();
res.json({ ok: true });
});


module.exports = router;
