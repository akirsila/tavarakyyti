// 📦 index.js – Tavarakyyti-backend (Node + Express + MongoDB + Auth)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({ secret: 'supersecret', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB-yhteys OK'))
  .catch(err => console.error('❌ MongoDB-yhteysvirhe:', err));

// 🔧 Schemat
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

const UserSchema = new mongoose.Schema({
  provider: String,
  providerId: String,
  name: String,
  email: String,
  createdAt: { type: Date, default: Date.now }
});

const Request = mongoose.model('Request', RequestSchema);
const Offer = mongoose.model('Offer', OfferSchema);
const User = mongoose.model('User', UserSchema);

// 🔐 Google-kirjautuminen
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
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

function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// 📬 API-reitit
app.get('/api/requests', async (req, res) => {
  const data = await Request.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/requests', requireAuth, async (req, res) => {
  const newRequest = new Request({ ...req.body, user: req.user._id });
  const saved = await newRequest.save();
  res.status(201).json(saved);
});

app.get('/api/offers', async (req, res) => {
  const data = await Offer.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/offers', requireAuth, async (req, res) => {
  const newOffer = new Offer({ ...req.body, user: req.user._id });
  const saved = await newOffer.save();
  res.status(201).json(saved);
});

app.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({});
  }
});

// 🔑 Auth
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('https://tavarakyyti.onrender.com/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('https://automaton.fi/tavarakyyti.html');
  });

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Tavarakyyti-palvelin käynnissä: http://localhost:${PORT}`));
