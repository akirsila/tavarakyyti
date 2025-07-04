// 📦 index.js – Tavarakyyti-backend (Node + Express + MongoDB + Passport + Stripe)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: 'none' }
}));
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB-yhteys OK'))
  .catch(err => console.error('❌ MongoDB-yhteysvirhe:', err));

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
  createdAt: { type: Date, default: Date.now }
});

const Request = mongoose.model('Request', RequestSchema);
const Offer = mongoose.model('Offer', OfferSchema);
const User = mongoose.model('User', UserSchema);

// 🔐 Google Strategy
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

// 🧪 Auth
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

// 📬 REST API
app.get('/api/requests', async (req, res) => {
  const data = await Request.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/requests', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Ei kirjautunut' });
  const newRequest = new Request({ ...req.body, user: req.user._id });
  const saved = await newRequest.save();
  res.status(201).json(saved);
});

app.get('/api/offers', async (req, res) => {
  const data = await Offer.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/offers', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Ei kirjautunut' });
  const newOffer = new Offer({
    ...req.body,
    recurring: req.body.recurring === 'on' || req.body.recurring === true,
    user: req.user._id
  });
  const saved = await newOffer.save();
  res.status(201).json(saved);
});

// 🔐 Maksu Stripe-katevarauksella
app.post('/api/payment/authorize', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 50000, // 500€
      currency: 'eur',
      capture_method: 'manual',
      metadata: {
        order_id: req.body.orderId || 'none',
        user: req.user ? req.user._id.toString() : 'anonymous'
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Tavarakyyti-palvelin käynnissä: http://localhost:${PORT}`));
