const mongoose = require("mongoose");


const AttachmentSchema = new mongoose.Schema({
url: String,
mime: String,
size: Number,
name: String
}, { _id: false });


const MessageSchema = new mongoose.Schema({
conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
text: { type: String, default: "" },
attachments: { type: [AttachmentSchema], default: [] },
system: { type: Boolean, default: false },
deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });


MessageSchema.index({ createdAt: 1 });


module.exports = mongoose.model("Message", MessageSchema);
