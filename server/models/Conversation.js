# Tavarakyyti Chat Module v1

Tämä paketti lisää käyttäjien välisen keskustelun (yksityisviestit + kuljetuskohtaiset ketjut), liitteet S3\:een, sekä kevyen admin-näkymän raporttien käsittelyyn. Pinona Node.js + Express + MongoDB (Mongoose) + Socket.IO.

---

## 1) .env.sample

```dotenv
# Server
PORT=3001
WEB_ORIGIN=http://localhost:3000
JWT_SECRET=replace_with_long_random_secret

# Mongo
MONGODB_URI=mongodb://localhost:27017/tavarakyyti

# AWS S3 (tai yhteensopiva, esim. MinIO)
S3_ACCESS_KEY_ID=YOUR_KEY
S3_SECRET_ACCESS_KEY=YOUR_SECRET
S3_REGION=eu-north-1
S3_BUCKET=tavarakyyti-chat
S3_ENDPOINT= # jätä tyhjäksi AWS:lle, aseta esim. http://localhost:9000 MinIOlle
S3_FORCE_PATH_STYLE=false

# Mail (valinnainen ilmoituksiin)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Tavarakyyti" <no-reply@tavarakyyti.fi>
```

---

## 2) models/Conversation.js

```js
const mongoose = require("mongoose");

const ParticipantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["receiver", "carrier", "other"], default: "other" },
  lastReadAt: { type: Date, default: null },
  mutedUntil: { type: Date, default: null }
}, { _id: false });

const BlockedPairSchema = new mongoose.Schema({
  blocker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  blocked: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["direct", "transport"], required: true },
  transportId: { type: mongoose.Schema.Types.ObjectId, ref: "Transport" },
  participants: { type: [ParticipantSchema], validate: v => v.length >= 2 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastMessageAt: { type: Date, default: Date.now },
  blockedPairs: { type: [BlockedPairSchema], default: [] }
}, { timestamps: true });

ConversationSchema.index({ "participants.userId": 1 });
ConversationSchema.index({ transportId: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", ConversationSchema);
```

---

## 3) models/Message.js

```js
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
```

---

## 4) models/Report.js

```js
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
```

---

## 5) middleware/auth.js (sopeuta teidän Authiin)

```js
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
```

---

## 6) services/s3Upload.js

```js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

const client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

function randomKey(name) {
  const ext = name?.split(".").pop() || "bin";
  return `chat/${new Date().toISOString().slice(0,10)}/${crypto.randomBytes(16).toString("hex")}.${ext}`;
}

async function uploadBuffer({ buffer, mime, name }) {
  const Key = randomKey(name);
  await client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key,
    Body: buffer,
    ContentType: mime
  }));
  const url = await getSignedUrl(client, new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key
  }), { expiresIn: 60 }); // presigner to verify put, but we already uploaded
  // Palautetaan julkinen URL jos bucket julkinen; muutoin rakenna oma signer
  const publicUrl = process.env.S3_ENDPOINT
    ? `${process.env.S3_ENDPOINT.replace(/\/$/, "")}/${process.env.S3_BUCKET}/${Key}`
    : `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${Key}`;
  return { url: publicUrl, mime, size: buffer.length, name };
}

module.exports = { uploadBuffer };
```

> Huom: Jos bucket ei ole julkinen, palauta mieluummin **getObject**-presigned URL erillisellä endpointilla.

---

## 7) routes/chatRouter.js

```js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Report = require("../models/Report");
const auth = require("../middleware/auth");
const { uploadBuffer } = require("../services/s3Upload");

// Muistiin tallentava upload (rajoita size)
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

function isParticipant(convo, userId) {
  return convo.participants.some(p => String(p.userId) === String(userId));
}

function sanitizeMessage(m) {
  return {
    _id: m._id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    text: m.text,
    attachments: m.attachments,
    system: m.system,
    createdAt: m.createdAt
  };
}

// Luo uusi keskustelu
router.post("/conversations", auth, async (req, res) => {
  const { type, transportId, participantIds } = req.body;
  if (!type || !Array.isArray(participantIds) || participantIds.length < 1) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  const participants = [
    ...new Set([req.user.id, ...participantIds])
  ].map(id => ({ userId: id }));

  const convo = await Conversation.create({
    type,
    transportId: transportId || undefined,
    participants,
    createdBy: req.user.id
  });
  return res.json(convo);
});

// Listaa omat keskustelut
router.get("/conversations", auth, async (req, res) => {
  const { transportId } = req.query;
  const q = { "participants.userId": req.user.id };
  if (transportId) q.transportId = transportId;
  const list = await Conversation.find(q).sort({ lastMessageAt: -1 }).lean();
  res.json(list);
});

// Hae yksittäinen
router.get("/conversations/:id", auth, async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ error: "not_found" });
  if (!isParticipant(convo, req.user.id)) return res.status(403).json({ error: "forbidden" });
  res.json(convo);
});

// Lataa viestejä (paginate backwards)
router.get("/conversations/:id/messages", auth, async (req, res) => {
  const { before, limit = 50 } = req.query;
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ error: "not_found" });
  if (!isParticipant(convo, req.user.id)) return res.status(403).json({ error: "forbidden" });
  const q = { conversationId: convo._id };
  if (before) q.createdAt = { $lt: new Date(before) };
  const msgs = await Message.find(q).sort({ createdAt: -1 }).limit(Number(limit)).lean();
  res.json(msgs.reverse());
});

// Lähetä viesti
router.post("/conversations/:id/messages", auth, async (req, res) => {
  const { text = "", attachments = [] } = req.body;
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ error: "not_found" });
  if (!isParticipant(convo, req.user.id)) return res.status(403).json({ error: "forbidden" });

  // Estot
  if (convo.blockedPairs?.some(bp => String(bp.blocked) === String(req.user.id))) {
    return res.status(403).json({ error: "blocked" });
  }

  const clipped = String(text).slice(0, 5000);
  const msg = await Message.create({
    conversationId: convo._id,
    senderId: req.user.id,
    text: clipped,
    attachments
  });
  convo.lastMessageAt = new Date();
  await convo.save();

  req.app.get("io").to(`convo:${convo._id}`).emit("chat:message:new", { message: sanitizeMessage(msg) });
  res.json({ message: sanitizeMessage(msg) });
});

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
```

---

## 8) sockets/chatSocket.js

```js
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
```

---

## 9) server/index.js (integrointi)

```js
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const chatRouter = require("./routes/chatRouter");
const attachChatSocket = require("./sockets/chatSocket");

require("dotenv").config();

async function main(){
  await mongoose.connect(process.env.MONGODB_URI);

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(rateLimit({ windowMs: 15*60*1000, max: 600 }));

  // Public assets (admin & widget demo)
  app.use(express.static(require("path").join(__dirname, "public")));

  // Chat REST
  app.use("/api/chat", chatRouter);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: process.env.WEB_ORIGIN, credentials: true } });
  app.set("io", io); // REST-puoli voi emittoida

  attachChatSocket(io);

  const port = process.env.PORT || 3001;
  server.listen(port, () => console.log(`Chat server listening on :${port}`));
}

main().catch(err => { console.error(err); process.exit(1); });
```

---

## 10) public/chatWidget.js (kevyt frontend-widget)

```js
// Käyttö: include <script src="/chatWidget.js"></script> ja kutsu initChatWidget({ token, conversationId })
(function(){
  window.initChatWidget = function({ token, conversationId }){
    const root = document.createElement('div');
    root.innerHTML = `
      <div id="tw-chat" style="max-width:420px;border:1px solid #444;border-radius:10px;padding:8px;background:#111;color:#eee;font:14px/1.4 system-ui">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <strong>Keskustelu</strong>
          <span id="tw-typing" style="display:none;font-size:12px;opacity:.7">Kirjoittaa…</span>
        </div>
        <div id="tw-msgs" style="height:300px;overflow:auto;background:#0b0b0b;border:1px solid #333;border-radius:6px;padding:6px"></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <input id="tw-input" placeholder="Kirjoita viesti…" style="flex:1;background:#0b0b0b;border:1px solid #333;border-radius:6px;padding:8px;color:#eee" />
          <button id="tw-send" style="padding:8px 12px;border:1px solid #333;border-radius:6px;background:#1e1e1e;color:#eee;cursor:pointer">Lähetä</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const msgsEl = root.querySelector('#tw-msgs');
    const typingEl = root.querySelector('#tw-typing');
    const input = root.querySelector('#tw-input');
    const sendBtn = root.querySelector('#tw-send');

    // socket.io client olettaa että se palvellaan samasta hostista: /socket.io
    const socket = io('/', { auth: { token } });

    socket.on('connect', () => {
      socket.emit('chat:join', { conversationId });
    });

    let typingTimer;
    input.addEventListener('input', () => {
      socket.emit('chat:typing', { conversationId, isTyping: true });
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => socket.emit('chat:typing', { conversationId, isTyping: false }), 1200);
    });

    sendBtn.onclick = () => {
      const text = input.value.trim();
      if(!text) return;
      const tempId = 'tmp-'+Date.now();
      append({ text, senderId: 'me', createdAt: new Date().toISOString() });
      socket.emit('chat:message', { conversationId, text, tempId });
      input.value = '';
    };

    socket.on('chat:message:new', ({ tempId, message }) => {
      append(message);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    });

    socket.on('chat:typing', ({ userId, isTyping }) => {
      typingEl.style.display = isTyping ? 'inline' : 'none';
    });

    function append(m){
      const d = document.createElement('div');
      const time = new Date(m.createdAt).toLocaleTimeString();
      const mine = (m.senderId === 'me');
      d.style.margin = '4px 0';
      d.innerHTML = `<div style="display:flex;${mine? 'justify-content:flex-end':''}">
        <div style="max-width:80%;padding:6px 8px;border-radius:8px;background:${mine?'#2a2a2a':'#191919'};border:1px solid #333">
          <div style="font-size:12px;opacity:.7">${time}</div>
          <div>${escapeHtml(m.text||'')}</div>
          ${(m.attachments||[]).map(a=>`<div><a href="${a.url}" target="_blank" rel="noreferrer">${a.name||a.url}</a></div>`).join('')}
        </div>
      </div>`;
      msgsEl.appendChild(d);
    }

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
    }

    return { destroy(){ root.remove(); socket.disconnect(); } };
  }
})();
```

---

## 11) public/adminReports.html (kevyt admin-näkymä)

```html
<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Tavarakyyti – Raportit</title>
  <style>
    body{background:#0e0e0e;color:#eee;font:14px system-ui;margin:20px}
    table{width:100%;border-collapse:collapse}
    td,th{border:1px solid #333;padding:8px}
    input,select,button{background:#1a1a1a;color:#eee;border:1px solid #333;border-radius:6px;padding:6px}
  </style>
</head>
<body>
  <h1>Raportit</h1>
  <div style="margin:10px 0;display:flex;gap:6px">
    <input id="token" placeholder="Admin JWT" style="flex:1"/>
    <button id="load">Lataa</button>
  </div>
  <table>
    <thead><tr><th>ID</th><th>Aihe</th><th>Status</th><th>Luotu</th><th>Toiminnot</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>

<script>
const rows = document.getElementById('rows');
const tokenEl = document.getElementById('token');

document.getElementById('load').onclick = load;

async function load(){
  const token = tokenEl.value.trim();
  const r = await fetch('/api/admin/reports', { headers: { Authorization: 'Bearer '+token } });
  const list = await r.json();
  rows.innerHTML = '';
  for(const it of list){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it._id}</td><td>${it.reason||''}</td><td>${it.status}</td><td>${new Date(it.createdAt).toLocaleString()}</td>
      <td>
        <button data-id="${it._id}" data-s="reviewing">Avaa</button>
        <button data-id="${it._id}" data-s="closed">Sulje</button>
      </td>`;
    rows.appendChild(tr);
  }
  rows.onclick = async (e)=>{
    if(e.target.tagName==='BUTTON'){
      const id = e.target.getAttribute('data-id');
      const s = e.target.getAttribute('data-s');
      const token = tokenEl.value.trim();
      await fetch('/api/admin/reports/'+id, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ status:s })});
      load();
    }
  }
}
</script>
</body>
</html>
```

---

## 12) routes/adminRouter.js (yksinkertainen admin API raporttien tilan hallintaan)

```js
const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const jwt = require('jsonwebtoken');

function adminAuth(req, res, next){
  const token = (req.headers.authorization||'').replace('Bearer ','');
  try{
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if(!user.isAdmin) return res.status(403).json({ error: 'forbidden' });
    req.user = user; next();
  }catch(e){ return res.status(401).json({ error: 'unauthorized' }); }
}

router.get('/reports', adminAuth, async (req, res) => {
  const list = await Report.find({}).sort({ createdAt: -1 }).limit(500).lean();
  res.json(list);
});

router.post('/reports/:id', adminAuth, async (req, res) => {
  const { status } = req.body;
  if(!['open','reviewing','closed'].includes(status)) return res.status(400).json({ error:'bad_status' });
  const upd = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
  res.json(upd);
});

module.exports = router;
```

---

## 13) Käyttöönotto-ohje lyhyesti

1. **Asenna paketit**

   ```bash
   npm i express mongoose socket.io helmet cors express-rate-limit jsonwebtoken multer @aws-sdk/client-s3 @aws-sdk/s3-request-presigner dotenv
   ```
2. **Lisää reitit** `index.js`:ään

   ```js
   const adminRouter = require('./routes/adminRouter');
   app.use('/api/admin', adminRouter); // admin
   app.use('/api/chat', chatRouter);   // chat
   ```
3. **Palvele public** hakemisto (widget & admin html) kuten indexissä.
4. **Lisää fronttiin** `socket.io` client ja `public/chatWidget.js`, kutsu `initChatWidget({ token, conversationId })` kuljetuksen sivulla.
5. **Indeksit**:

   ```js
   require('./models/Conversation').syncIndexes?.();
   require('./models/Message').syncIndexes?.();
   require('./models/Report').syncIndexes?.();
   ```
6. **Tietoturva**: varmista että JWT\:ssä on `id`, ja admin-käyttäjillä `isAdmin: true`.
7. **S3**: määritä bucket ja käyttöoikeudet; jos käytät MinIOta, täytä `S3_ENDPOINT` ja `S3_FORCE_PATH_STYLE=true`.

---

## 14) Laajennusideat (valmiit kiinnityspisteet)

* Web Push -ilmoitukset: tallenna `pushSubscription` user-profiiliin ja lähetä ilmoitus kun vastapuoli offline.
* E2EE: per-ketju avainpari (libsodium), salaa `text` ja `attachments`-metat.
* Viestikohtaiset reaktiot ja threadit.
* Tilaus-flow-integraatiot: automaattinen `transport`-ketjun luonti tarjouksen hyväksynnässä; Stripe-hold/release system-viesteiksi.

---

**Valmista!** Kopioi tiedostot projektiin seuraaviin polkuihin:

```
server/
  index.js
  routes/
    chatRouter.js
    adminRouter.js
  sockets/
    chatSocket.js
  services/
    s3Upload.js
  models/
    Conversation.js
    Message.js
    Report.js
  middleware/
    auth.js
public/
  chatWidget.js
  adminReports.html
.env.sample
```
