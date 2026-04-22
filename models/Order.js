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
    subTotal: { type: Number, required: true },     // NEW
    gstAmount: { type: Number, required: true },    // NEW
    totalAmount: { type: Number, required: true },  // This is now Subtotal + GST
    status: { type: String, default: 'Awaiting_Payment', enum: ['Awaiting_Payment', 'Pending', 'Preparing', 'Ready', 'Completed'] },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ordermenu', orderSchema);
