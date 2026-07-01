const mongoose = require('mongoose');

const mockEmailSchema = new mongoose.Schema({
  to: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  subject: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const MockEmail = mongoose.model('MockEmail', mockEmailSchema);
module.exports = MockEmail;
