// chatServer.js
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const jwt = require("jsonwebtoken");

const Conversation = require("./models/Conversation");
const Message = require("./models/Message");

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 600 }));

// Auth middleware (sovita teidän toteutukseen)
function auth(req,res,next){
  const token = (req.headers.authorization||"").replace("Bearer ","");
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({error:"unauthorized"}); }
}

// Luo viesti
app.post("/api/chat/conversations/:id/messages", auth, async (req,res)=>{
  const { id } = req.params;
  const convo = await Conversation.findById(id);
  if(!convo) return res.status(404).json({error:"not_found"});
  if(!convo.participants.some(p=>p.userId.toString()===req.user.id)) return res.status(403).json({error:"forbidden"});

  // estot?
  if (convo.blockedPairs?.some(bp => bp.blocked.toString()===req.user.id)) {
    return res.status(403).json({error:"blocked"});
  }

  const msg = await Message.create({
    conversationId: id,
    senderId: req.user.id,
    text: (req.body.text||"").slice(0, 5000),
    attachments: req.body.attachments||[]
  });
  convo.lastMessageAt = new Date();
  await convo.save();

  io.to(`convo:${id}`).emit("chat:message:new", { message: sanitize(msg) });
  res.json({ message: sanitize(msg) });
});

// S3/Cloud Storage -integraatioon vaihda tämä
const upload = multer({ dest: "uploads/", limits: { fileSize: 10*1024*1024 }});
app.post("/api/chat/upload", auth, upload.single("file"), async (req,res)=>{
  // Lataa pilveen ja palauta {url, mime, size, name}
  res.json({ url:`/uploads/${req.file.filename}`, mime:req.file.mimetype, size:req.file.size, name:req.file.originalname });
});

// HTTP + WS
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.WEB_ORIGIN, credentials:true } });

// WS-auth
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) { next(new Error("unauthorized")); }
});

io.on("connection", (socket)=>{
  socket.on("chat:join", async ({conversationId})=>{
    const convo = await Conversation.findById(conversationId);
    if (!convo) return;
    if (!convo.participants.some(p=>p.userId.toString()===socket.user.id)) return;
    socket.join(`convo:${conversationId}`);
  });

  socket.on("chat:message", async (payload)=>{
    const { conversationId, text, attachments, tempId } = payload;
    const convo = await Conversation.findById(conversationId);
    if (!convo) return;
    if (!convo.participants.some(p=>p.userId.toString()===socket.user.id)) return;

    const msg = await Message.create({
      conversationId, senderId: socket.user.id,
      text: (text||"").slice(0,5000), attachments: attachments||[]
    });
    convo.lastMessageAt = new Date(); await convo.save();
    io.to(`convo:${conversationId}`).emit("chat:message:new", { tempId, message: sanitize(msg) });
  });

  socket.on("chat:typing", ({conversationId, isTyping})=>{
    io.to(`convo:${conversationId}`).emit("chat:typing", { userId: socket.user.id, isTyping: !!isTyping });
  });

  socket.on("chat:read", async ({conversationId, at})=>{
    await Conversation.updateOne(
      { _id: conversationId, "participants.userId": socket.user.id },
      { $set: { "participants.$.lastReadAt": at ? new Date(at) : new Date() } }
    );
    io.to(`convo:${conversationId}`).emit("chat:read", { userId: socket.user.id, at: new Date() });
  });
});

function sanitize(msg){
  return {
    _id: msg._id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    text: msg.text,
    attachments: msg.attachments,
    createdAt: msg.createdAt
  };
}

server.listen(process.env.PORT||3001, ()=> console.log("Chat up"));
