// 📦 index.js – Tavarakyyti-backend
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Render tarvitsee tämän

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// 🔗 MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB-yhteys OK'))
  .catch(err => console.error('❌ MongoDB-yhteysvirhe:', err));

// 📦 Mongoose-mallit
const UserSchema = new mongoose.Schema({
  provider: String,
  providerId: String,
  name: String,
  email: String,
  createdAt: { type: Date, default: Date.now }
});
const RequestSchema = new mongoose.Schema({
  from: String,
  to: String,
  date: String,
  size: String,
  price: Number,
  details: String,
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
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);
const Request = mongoose.model('Request', RequestSchema);
const Offer = mongoose.model('Offer', OfferSchema);

// 🔐 Google Auth
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
      email: profile.emails[0].value
    });
  }
  return done(null, user);
}));
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

// 🔑 Auth-reitit
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('https://automaton.fi/tavarakyyti.html')
);
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});
app.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({});
  }
});
// Kuljetuspyynnön poisto
app.delete('/api/requests/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const r = await Request.findById(req.params.id);
  if (!r || r.user.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });
  await r.deleteOne();
  res.json({ success: true });
});

// Kuljetustarjouksen poisto
app.delete('/api/offers/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const o = await Offer.findById(req.params.id);
  if (!o || o.user.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });
  await o.deleteOne();
  res.json({ success: true });
});

// 📬 REST API
app.get('/api/requests', async (req, res) => {
  const data = await Request.find().populate('user').sort({ createdAt: -1 });
  res.json(data);
});
app.post('/api/requests', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const newRequest = new Request({ ...req.body, user: req.user._id });
  const saved = await newRequest.save();
  res.status(201).json(saved);
});
app.get('/api/offers', async (req, res) => {
  const data = await Offer.find().populate('user').sort({ createdAt: -1 });
  res.json(data);
});
app.post('/api/offers', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const newOffer = new Offer({ ...req.body, user: req.user._id });
  const saved = await newOffer.save();
  res.status(201).json(saved);
});

// ▶ Käynnistys
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Tavarakyyti-palvelin käynnissä: http://localhost:${PORT}`);
});
