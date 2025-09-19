const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const jwt = require("jsonwebtoken");


module.exports = function attachChatSocket(io) {
io.use((socket, next) => {
try {
const token = socket.handshake.auth?.token;
socket.user = jwt.verify(token, process.env.JWT_SECRET);
next();
} catch (e) { next(new Error("unauthorized")); }
});


io.on("connection", (socket) => {
socket.on("chat:join", async ({ conversationId }) => {
const convo = await Conversation.findById(conversationId);
if (!convo) return;
if (!convo.participants.some(p => String(p.userId) === String(socket.user.id))) return;
socket.join(`convo:${conversationId}`);
});


socket.on("chat:leave", ({ conversationId }) => {
socket.leave(`convo:${conversationId}`);
});


socket.on("chat:typing", ({ conversationId, isTyping }) => {
io.to(`convo:${conversationId}`).emit("chat:typing", { userId: socket.user.id, isTyping: !!isTyping });
});


socket.on("chat:message", async ({ conversationId, text = "", attachments = [], tempId }) => {
const convo = await Conversation.findById(conversationId);
if (!convo) return;
if (!convo.participants.some(p => String(p.userId) === String(socket.user.id))) return;
if (convo.blockedPairs?.some(bp => String(bp.blocked) === String(socket.user.id))) return; // hiljainen


const msg = await Message.create({
conversationId,
senderId: socket.user.id,
text: String(text).slice(0, 5000),
attachments
});
convo.lastMessageAt = new Date();
await convo.save();
io.to(`convo:${conversationId}`).emit("chat:message:new", { tempId, message: {
_id: msg._id,
conversationId: msg.conversationId,
senderId: msg.senderId,
text: msg.text,
attachments: msg.attachments,
system: msg.system,
createdAt: msg.createdAt
}});
});


socket.on("chat:read", async ({ conversationId, at }) => {
const date = at ? new Date(at) : new Date();
await Conversation.updateOne(
{ _id: conversationId, "participants.userId": socket.user.id },
{ $set: { "participants.$.lastReadAt": date } }
);
io.to(`convo:${conversationId}`).emit("chat:read", { userId: socket.user.id, at: date });
});
});
};
