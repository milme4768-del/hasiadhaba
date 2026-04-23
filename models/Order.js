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
    subTotal: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    
    // --- NEW: PAYMENT TRACKING ---
    paymentType: { type: String, default: 'Online' }, // 'Online' or 'Cash'
    paymentStatus: { type: String, default: 'Paid' }, // 'Paid' or 'Unpaid'

    status: { type: String, default: 'Awaiting_Payment', enum: ['Awaiting_Payment', 'Pending', 'Preparing', 'Ready', 'Completed'] },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ordermenu', orderSchema);
