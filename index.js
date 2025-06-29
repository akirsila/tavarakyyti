// 📦 index.js – Tavarakyyti-backend (Node + Express + MongoDB + Google + Apple Auth)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({ secret: 'supersecret', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// 🔌 MongoDB
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
const OfferSchema = new mongoose.Schema({
  route: String,
  from: String,
  to: String,
  date: String,
  vehicle: String,
  priceRange: String,
  details: String,
  createdAt: { type: Date, default: Date.now }
});
const RequestSchema = new mongoose.Schema({
  from: String,
  to: String,
  date: String,
  size: String,
  price: Number,
  details: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);
const Offer = mongoose.model('Offer', OfferSchema);
const Request = mongoose.model('Request', RequestSchema);

// 🔐 Google-strategia
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
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



// 🔄 Istunnon serialisointi
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

// 🛣 API-reitit
app.get('/api/requests', async (req, res) => {
  const data = await Request.find().sort({ createdAt: -1 });
  res.json(data);
});
app.post('/api/requests', async (req, res) => {
  const saved = await new Request(req.body).save();
  res.status(201).json(saved);
});
app.get('/api/offers', async (req, res) => {
  const data = await Offer.find().sort({ createdAt: -1 });
  res.json(data);
});
app.post('/api/offers', async (req, res) => {
  const saved = await new Offer(req.body).save();
  res.status(201).json(saved);
});
app.get('/me', (req, res) => {
  if (req.isAuthenticated()) res.json(req.user);
  else res.status(401).json({});
});

// 🔑 Auth-reitit – Google & Apple
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
  res.redirect('/public/index.html');
});


app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Tavarakyyti-palvelin osoitteessa: http://localhost:${PORT}`);
});
