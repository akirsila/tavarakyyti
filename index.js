// 📦 index.js – Tavarakyyti-backend (Node + Express + MongoDB)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB-yhteys OK'))
.catch(err => console.error('❌ MongoDB-yhteysvirhe:', err));

const RequestSchema = new mongoose.Schema({
  from: String,
  to: String,
  date: String,
  size: String,
  price: Number,
  details: String,
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

const Request = mongoose.model('Request', RequestSchema);
const Offer = mongoose.model('Offer', OfferSchema);

app.get('/api/requests', async (req, res) => {
  const data = await Request.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/requests', async (req, res) => {
  const newRequest = new Request(req.body);
  const saved = await newRequest.save();
  res.status(201).json(saved);
});

app.get('/api/offers', async (req, res) => {
  const data = await Offer.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post('/api/offers', async (req, res) => {
  const newOffer = new Offer(req.body);
  const saved = await newOffer.save();
  res.status(201).json(saved);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Tavarakyyti-palvelin käynnissä: http://localhost:${PORT}`);
});
