const mongoose = require("mongoose");


const ReportSchema = new mongoose.Schema({
reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
reason: { type: String, default: "" },
status: { type: String, enum: ["open", "reviewing", "closed"], default: "open" }
}, { timestamps: true });


ReportSchema.index({ status: 1, createdAt: -1 });


module.exports = mongoose.model("Report", ReportSchema);
