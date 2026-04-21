const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customer: {
        tableNo: { type: String, required: true },
        name: { type: String, required: true },
        phone: { type: String, required: true }
    },
    items: [{
        id: String,
        name: String,
        price: Number,
        quantity: Number,
        subtotal: Number
    }],
    totalAmount: { type: Number, required: true },
    // ADDED 'Awaiting_Payment' to the enum
    status: { type: String, default: 'Awaiting_Payment', enum: ['Awaiting_Payment', 'Pending', 'Preparing', 'Ready', 'Completed'] },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ordermenu', orderSchema);