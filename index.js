// 📦 index.js – Tavarakyyti-backend (Node + Express + MongoDB + Passport + Stripe + Chat)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.set('trust proxy', 1);

// --- perus middlewares ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: 'none' }
}));
app.use(passport.initialize());
app.use(passport.session());

// --- Mongo ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB-yhteys OK'))
  .catch(err => console.error('❌ MongoDB-yhteysvirhe:', err));

/* =========================
   Schemat (pyynnöt, tarjoukset, käyttäjät)
   ========================= */
const RequestSchema = new mongoose.Schema({
  from: String,
  to: String,
  date: String,
  size: String,
  price: Number,
  details: String,
  accepted: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const OfferSchema = new mongoose.Schema({
  route: String,
  from: String,
  to: String,
  date: String,
  vehicle: String,
  priceRange: String,
  details: String,
  recurring: Boolean,
  accepted: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const UserSchema = new mongoose.Schema({
  provider: String,
  providerId: String,
  name: String,
  email: String,
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Request = mongoose.model('Request', RequestSchema);
const Offer = mongoose.model('Offer', OfferSchema);
const User = mongoose.model('User', UserSchema);

/* =========================
   CHAT: Schemat
   ========================= */
const ParticipantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['receiver','carrier','other'], default: 'other' },
  lastReadAt: { type: Date, default: null }
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['direct','transport'], required: true },
  transportId: { type: mongoose.Schema.Types.ObjectId },
  participants: { type: [ParticipantSchema], validate: v => v.length >= 2 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastMessageAt: { type: Date, default: Date.now },
  blockedPairs: [{
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }]
}, { timestamps: true });
ConversationSchema.index({ 'participants.userId': 1 });
ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ type: 1, transportId: 1 });

const AttachmentSchema = new mongoose.Schema({
  url: String, mime: String, size: Number, name: String
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, default: '' },
  attachments: { type: [AttachmentSchema], default: [] },
  system: { type: Boolean, default: false },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });
MessageSchema.index({ createdAt: 1 });

const Conversation = mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.model('Message', MessageSchema);

/* =========================
   Passport: Google
   ========================= */
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://tavarakyyti.onrender.com/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  let user = await User.findOne({ providerId: profile.id });
  if (!user) {
    user = await User.create({
      provider: 'google',
      providerId: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0]?.value
    });
  }
  return done(null, user);
}));
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => { done(null, await User.findById(id)); });

/* =========================
   Auth reitit (Google + me + logout)
   ========================= */
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('https://automaton.fi/tavarakyyti.html')
);
app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid', { path: '/', sameSite: 'none', secure: true });
      res.redirect('https://automaton.fi/tavarakyyti.html');
    });
  });
});
app.get('/me', (req, res) => {
  if (req.isAuthenticated()) res.json(req.user);
  else res.status(401).json({});
});

/* =========================
   👉 /api/auth/jwt – tee Bearer-JWT sessiosta
   ========================= */
app.get('/api/auth/jwt', (req, res) => {
  const u = req.user;
  if (!u?._id) return res.status(401).json({ error: 'unauthorized' });
  const token = jwt.sign(
    { id: String(u._id), isAdmin: !!u.isAdmin },
    process.env.JWT_SECRET || 'change-me',
    { expiresIn: '2h' }
  );
  res.json({ token });
});

/* =========================
   REST API (pyynnöt & tarjoukset)
   ========================= */
app.get('/api/requests', async (req, res) => {
  const data = await Request.find().sort({ createdAt: -1 });
  res.json(data);
});
app.post('/api/requests', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Ei kirjautunut' });
  const saved = await new Request({ ...req.body, user: req.user._id }).save();
  res.status(201).json(saved);
});
app.get('/api/offers', async (req, res) => {
  const data = await Offer.find().sort({ createdAt: -1 });
  res.json(data);
});
app.post('/api/offers', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Ei kirjautunut' });
  const saved = await new Offer({
    ...req.body,
    recurring: req.body.recurring === 'on' || req.body.recurring === true,
    user: req.user._id
  }).save();
  res.status(201).json(saved);
});

/* =========================
   Maksu Stripe-katevarauksella
   ========================= */
app.post('/api/payment/authorize', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 50000, // 500€
      currency: 'eur',
      capture_method: 'manual',
      metadata: {
        order_id: req.body.orderId || 'none',
        user: req.user ? String(req.user._id) : 'anonymous'
      }
    });
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error('Stripe virhe:', err);
    res.status(500).json({ error: 'Maksun luonti epäonnistui' });
  }
});
app.post('/api/payment/capture', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const intent = await stripe.paymentIntents.capture(paymentIntentId);
    res.json({ success: true, intent });
  } catch (err) {
    console.error('Capture virhe:', err);
    res.status(500).json({ error: 'Katevarauksen vapautus epäonnistui' });
  }
});
app.post('/api/accept-transport', async (req, res) => {
  try {
    const { offerId } = req.body;
    const offer = await Offer.findById(offerId);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    offer.accepted = true;
    await offer.save();
    res.json({ message: 'Kuljetus hyväksytty' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   🔐 Chat auth-middleware (Bearer JWT TAI Passport-sessio)
   ========================= */
function chatAuth(req, res, next) {
  // 1) Bearer JWT
  const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (auth) {
    try {
      const payload = jwt.verify(auth, process.env.JWT_SECRET || 'change-me');
      req.chatUser = { id: payload.id, isAdmin: !!payload.isAdmin };
      return next();
    } catch (_) { /* jatka sessioon */ }
  }
  // 2) Passport session
  if (req.isAuthenticated?.() && req.user?._id) {
    req.chatUser = { id: String(req.user._id), isAdmin: !!req.user.isAdmin };
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
}

/* =========================
   📨 Chat REST -reitit
   ========================= */
// Listaa omat keskustelut
app.get('/api/chat/conversations', chatAuth, async (req, res) => {
  const list = await Conversation.find({ 'participants.userId': req.chatUser.id })
    .sort({ lastMessageAt: -1 }).lean();
  res.json(list);
});

// Luo keskustelu (direct/transport)
app.post('/api/chat/conversations', chatAuth, async (req, res) => {
  const { type, transportId, participantIds } = req.body || {};
  if (!type || !Array.isArray(participantIds) || !participantIds.length) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  // transport-tyypissä yritä estää duplikaatit (sama transport + samat osallistujat)
  if (type === 'transport' && transportId) {
    const exists = await Conversation.findOne({
      type: 'transport',
      transportId,
      'participants.userId': { $all: [req.chatUser.id, ...participantIds] }
    });
    if (exists) return res.json(exists);
  }

  const unique = Array.from(new Set([req.chatUser.id, ...participantIds.map(String)])).map(id => ({ userId: id }));
  const convo = await Conversation.create({
    type,
    transportId: transportId || undefined,
    participants: unique,
    createdBy: req.chatUser.id
  });
  res.json(convo);
});

// Lataa viestit (tukee after=ISO8601 tai before=ISO8601) — palautus nousevassa aikajärjestyksessä
app.get('/api/chat/conversations/:id/messages', chatAuth, async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ error: 'not_found' });
  if (!convo.participants.some(p => String(p.userId) === String(req.chatUser.id))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { before, after, limit = 50 } = req.query;
  const q = { conversationId: convo._id };

  if (after) {
    q.createdAt = { $gt: new Date(after) };
  } else if (before) {
    q.createdAt = { $lt: new Date(before) };
  }

  const msgs = await Message.find(q).sort({ createdAt: 1 }).limit(Number(limit)).lean();
  res.json(msgs);
});

// Lähetä viesti – palauttaa 201 ja täyden viestin
app.post('/api/chat/conversations/:id/messages', chatAuth, async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ error: 'not_found' });
  if (!convo.participants.some(p => String(p.userId) === String(req.chatUser.id))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (convo.blockedPairs?.some(bp => String(bp.blocked) === String(req.chatUser.id))) {
    return res.status(403).json({ error: 'blocked' });
  }

  const text = String(req.body?.text || '').slice(0, 5000);
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  const msg = await Message.create({
    conversationId: convo._id,
    senderId: req.chatUser.id,
    text, attachments
  });

  convo.lastMessageAt = new Date();
  await convo.save();

  const payload = {
    _id: msg._id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    text: msg.text,
    attachments: msg.attachments,
    createdAt: msg.createdAt,
    system: msg.system
  };

  io.to(`convo:${convo._id}`).emit('chat:message:new', { message: payload });

  res.status(201).json({ message: payload });
});

/* =========================
   🔌 Socket.IO (reaaliaika)
   ========================= */
io.use((socket, next) => {
  try {
    const bearer = socket.handshake.auth?.token;
    if (bearer) {
      const p = jwt.verify(bearer, process.env.JWT_SECRET || 'change-me');
      socket.user = { id: p.id, isAdmin: !!p.isAdmin };
      return next();
    }
    // Jos ei Beareria → ei autentikoida WS:ää; front fallbackaa REST-polliin.
    return next();
  } catch (e) {
    return next();
  }
});

io.on('connection', (socket) => {
  socket.on('chat:join', ({ conversationId }) => {
    if (conversationId) socket.join(`convo:${conversationId}`);
  });

  socket.on('chat:typing', ({ conversationId, isTyping }) => {
    if (conversationId) io.to(`convo:${conversationId}`).emit('chat:typing', { isTyping: !!isTyping });
  });

  socket.on('chat:message', async ({ conversationId, text = '', attachments = [], tempId }) => {
    try {
      if (!socket.user?.id) return; // vaatii Bearer WS:ään
      const convo = await Conversation.findById(conversationId);
      if (!convo) return;
      if (!convo.participants.some(p => String(p.userId) === String(socket.user.id))) return;
      const msg = await Message.create({
        conversationId, senderId: socket.user.id, text: String(text).slice(0, 5000), attachments
      });
      convo.lastMessageAt = new Date(); await convo.save();
      const payload = {
        _id: msg._id, conversationId: msg.conversationId, senderId: msg.senderId,
        text: msg.text, attachments: msg.attachments, createdAt: msg.createdAt, system: msg.system
      };
      io.to(`convo:${conversationId}`).emit('chat:message:new', { tempId, message: payload });
    } catch (e) {}
  });
});

/* =========================
   Käynnistys
   ========================= */
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Tavarakyyti-palvelin käynnissä: http://localhost:${PORT}`));
