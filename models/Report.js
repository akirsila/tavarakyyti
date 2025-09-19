// models/Report.js (moderointi)
const mongoose = require("mongoose");
const ReportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  reason: String,
  status: { type: String, enum:["open","reviewing","closed"], default:"open" }
}, { timestamps:true });
module.exports = mongoose.model("Report", ReportSchema);
