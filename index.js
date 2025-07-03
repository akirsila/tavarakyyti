// 📦 index.js – Tavarakyyti-backend (Node + Express + MongoDB + Passport)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Trust Render proxy

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB-yhteys OK'))
  .catch(err => console.error('❌ MongoDB-yhteysvirhe:', err));

// 🔷 Mongoose skeemat
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
  recurring: { type: Boolean, default: false },
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

// 🧪 Autentikointi
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('https://automaton.fi/tavarakyyti.html');
  }
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

// 📬 API-reitit

// Pyynnöt
app.get('/api/requests', async (req, res) => {
  const data = await Request.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/requests', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const newRequest = new Request({ ...req.body, user: req.user._id });
  const saved = await newRequest.save();
  res.status(201).json(saved);
});

// Tarjoukset
app.get('/api/offers', async (req, res) => {
  const data = await Offer.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/offers', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

  // ✅ Muunna "on" → true ja kaikki muu → false
  req.body.recurring = req.body.recurring === 'on';

  const newOffer = new Offer({ ...req.body, user: req.user._id });
  const saved = await newOffer.save();
  res.status(201).json(saved);
});

// ✏️ Poisto
app.delete('/api/requests/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  await Request.deleteOne({ _id: req.params.id, user: req.user._id });
  res.sendStatus(204);
});

app.delete('/api/offers/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  await Offer.deleteOne({ _id: req.params.id, user: req.user._id });
  res.sendStatus(204);
});

// ✏️ Päivitys
app.put('/api/requests/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const updated = await Request.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true }
  );
  res.json(updated);
});

app.put('/api/offers/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

  // Päivitä myös boolean jos mukana
  if ('recurring' in req.body) {
    req.body.recurring = req.body.recurring === 'true' || req.body.recurring === true;
  }

  const updated = await Offer.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true }
  );
  res.json(updated);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Tavarakyyti-palvelin käynnissä: http://localhost:${PORT}`);
});
