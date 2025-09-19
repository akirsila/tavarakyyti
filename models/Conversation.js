// models/Conversation.js
const mongoose = require("mongoose");

const ParticipantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["receiver", "carrier", "other"], default: "other" },
  lastReadAt: { type: Date, default: null },
  mutedUntil: { type: Date, default: null }
}, {_id:false});

const ConversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["direct","transport"], required: true },
  transportId: { type: mongoose.Schema.Types.ObjectId, ref: "Transport" }, // jos type === "transport"
  participants: { type: [ParticipantSchema], validate: v => v.length >= 2 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastMessageAt: { type: Date, default: Date.now },
  blockedPairs: [{ blocker: {type: mongoose.Schema.Types.ObjectId, ref:"User"},
                   blocked: {type: mongoose.Schema.Types.ObjectId, ref:"User"} }]
}, { timestamps:true });

ConversationSchema.index({ "participants.userId": 1 });
ConversationSchema.index({ transportId: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", ConversationSchema);
