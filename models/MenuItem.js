const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    category: { type: String, required: true, enum: ['starters', 'main', 'tea'] },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    veg: { type: Boolean, required: true, default: true },
    desc: { type: String },
    image: { type: String },
    tag: { type: String }
});

module.exports = mongoose.model('MenuItem', menuItemSchema);