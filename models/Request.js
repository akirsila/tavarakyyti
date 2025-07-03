const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  date: { type: String, required: true },
  description: String,
  createdBy: String,
  createdByName: String,
  recurring: Boolean,
  accepted: { type: Boolean, default: false },
  paid: { type: Boolean, default: false }
});

module.exports = mongoose.model('Request', requestSchema);
