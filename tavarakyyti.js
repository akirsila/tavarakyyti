// 📦 Express + MongoDB backend vertaiskuljetuspalvelulle

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔗 MongoDB-yhteys (voit käyttää local tai MongoDB Atlas)
//const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/kuljetusdb';
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://aakirsila:Zxcvbnmn0@cluster0.nz8luvy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// 📦 Mongoose-skeemat
const RequestSchema = new mongoose.Schema({
  from: String,
  to: String,
  date: String,
  size: String,
  price: Number,
  details: String,
  createdAt: { type: Date, default: Date.now },
});

const OfferSchema = new mongoose.Schema({
  route: String,
  from: String,
  to: String,
  date: String,
  vehicle: String,
  priceRange: String,
  details: String,
  createdAt: { type: Date, default: Date.now },
});

const Request = mongoose.model('Request', RequestSchema);
const Offer = mongoose.model('Offer', OfferSchema);

// 🔧 REST API -reitit

// Kuljetuspyynnöt
app.get('/api/requests', async (req, res) => {
  const requests = await Request.find().sort({ createdAt: -1 });
  res.json(requests);
});

app.post('/api/requests', async (req, res) => {
  const newReq = new Request(req.body);
  const saved = await newReq.save();
  res.status(201).json(saved);
});

// Kuljetustarjoukset
app.get('/api/offers', async (req, res) => {
  const offers = await Offer.find().sort({ createdAt: -1 });
  res.json(offers);
});

app.post('/api/offers', async (req, res) => {
  const newOffer = new Offer(req.body);
  const saved = await newOffer.save();
  res.status(201).json(saved);
});

// 🔌 Serverin käynnistys
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
