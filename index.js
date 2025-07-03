// index.js – Täydellinen versio Tavarakyyti-palvelimelle

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const dotenv = require('dotenv');
const Stripe = require('stripe');

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// SESSION & AUTH
app.use(session({ secret: 'salaisuus', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

const User = require('./models/User');
const Request = require('./models/Request');
const Offer = require('./models/Offer');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL

}, async (accessToken, refreshToken, profile, done) => {
  const existingUser = await User.findOne({ googleId: profile.id });
  if (existingUser) return done(null, existingUser);
  const user = await User.create({
    googleId: profile.id,
    name: profile.displayName
  });
  done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => User.findById(id).then(u => done(null, u)));

// ROUTES
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback', passport.authenticate('google', {
  failureRedirect: '/',
  successRedirect: 'https://automaton.fi/tavarakyyti.html'
}));
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(req.user);
});

// API - Requests & Offers
app.post('/api/requests', async (req, res) => {
  try {
    const request = await Request.create({ ...req.body, user: req.user?._id });
    res.status(201).json(request);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/requests', async (req, res) => {
  res.json(await Request.find());
});

app.delete('/api/requests/:id', async (req, res) => {
  await Request.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

app.put('/api/requests/:id', async (req, res) => {
  const updated = await Request.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

app.post('/api/offers', async (req, res) => {
  try {
    const data = { ...req.body, user: req.user?._id };
    if (typeof data.recurring === 'string') {
      data.recurring = data.recurring === 'on';
    }
    const offer = await Offer.create(data);
    res.status(201).json(offer);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/offers', async (req, res) => {
  res.json(await Offer.find());
});

app.delete('/api/offers/:id', async (req, res) => {
  await Offer.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

app.put('/api/offers/:id', async (req, res) => {
  const updated = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

// Stripe Maksu + Katevarauslogiikka
app.post('/api/payment-intent', async (req, res) => {
  try {
    const { amount, transportId } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      capture_method: 'manual', // Katevaraus
      metadata: { transportId }
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/capture-payment', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const captured = await stripe.paymentIntents.capture(paymentIntentId);
    res.json(captured);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Kuljetuksen hyväksyntä
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

// DB + SERVER
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB-yhteys OK');
    app.listen(process.env.PORT || 10000, () => {
      console.log(`🚀 Tavarakyyti-palvelin käynnissä: http://localhost:${process.env.PORT || 10000}`);
    });
  })
  .catch(err => console.error('❌ MongoDB-yhteysvirhe:', err));
