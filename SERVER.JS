const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto'); // REQUIRED FOR PAYU HASHING
require('dotenv').config();

const MenuItem = require('./models/MenuItem');
const Order = require('./models/Order');

const app = express();
app.use(cors());
// PayU sends URL-encoded data on success, so we need this to read it:
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- SECURE PAYU CREDENTIALS FROM .ENV ---
const PAYU_KEY = process.env.PAYU_KEY;
const PAYU_SALT = process.env.PAYU_SALT;
const PAYU_URL = 'https://test.payu.in/_payment'; // Use 'https://test.payu.in/_payment' for testing 'https://secure.payu.in/_payment' for live

// --- API ROUTES ---

app.get('/api/menu', async (req, res) => {
    try {
        const items = await MenuItem.find();
        const formattedMenu = {
            starters: items.filter(i => i.category === 'starters'),
            main: items.filter(i => i.category === 'main'),
            tea: items.filter(i => i.category === 'tea')
        };
        res.json(formattedMenu);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// 1. INITIATE PAYMENT (Generates Hash and creates hidden order)
app.post('/api/payu/initiate', async (req, res) => {
    try {
        // Save order as 'Awaiting_Payment'. Kitchen will NOT see this yet.
        const orderData = { ...req.body, status: 'Awaiting_Payment' };
        const newOrder = new Order(orderData);
        const savedOrder = await newOrder.save();

        const txnid = savedOrder._id.toString(); 
        const amount = savedOrder.totalAmount;
        const productinfo = 'Taraaang Order';
        const firstname = savedOrder.customer.name.replace(/\s/g, ''); // Remove spaces to prevent PayU errors
        const email = 'guest@taraaang.com'; // PayU requires an email field
        const phone = savedOrder.customer.phone;

        // Formula: key|txnid|amount|productinfo|firstname|email|||||||||||SALT
        const hashString = `${PAYU_KEY}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${PAYU_SALT}`;
        const hash = crypto.createHash('sha512').update(hashString).digest('hex');

        res.json({
            key: PAYU_KEY,
            txnid: txnid,
            amount: amount,
            productinfo: productinfo,
            firstname: firstname,
            email: email,
            phone: phone,
            hash: hash,
            // IMPORTANT: Change this port/IP to match where your frontend runs!
            surl: 'http://localhost:5000/api/payu/success',
            furl: 'http://localhost:5000/api/payu/fail'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to initiate payment' });
    }
});

// 2. PAYU SUCCESS ROUTE
app.post('/api/payu/success', async (req, res) => {
    try {
        const { txnid, status } = req.body;
        
        if (status === 'success') {
            // Payment success! Change status to 'Pending' so it shows on Admin Dashboard
            await Order.findByIdAndUpdate(txnid, { status: 'Pending' });
            
            // Redirect customer back to their app to track the order
            res.redirect(`http://127.0.0.1:5500/index.html?order_success=true&order_id=${txnid}`);
        } else {
            res.redirect(`http://127.0.0.1:5500/index.html?order_failed=true`);
        }
    } catch (error) {
        res.send("Payment verification failed.");
    }
});

// 3. PAYU FAILURE ROUTE
app.post('/api/payu/fail', async (req, res) => {
    res.redirect(`http://127.0.0.1:5500/index.html?order_failed=true`);
});

// Admin Dashboard: ONLY fetch orders that are paid for
app.get('/api/orders/active', async (req, res) => {
    try {
        // Exclude 'Completed' AND 'Awaiting_Payment'
        const activeOrders = await Order.find({ status: { $nin: ['Completed', 'Awaiting_Payment'] } }).sort({ timestamp: -1 });
        res.json(activeOrders);
    } catch (error) {
        console.error("🚨 DATABASE ERROR FETCHING ORDERS:", error);
        res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
    }
});

app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json({ status: order.status });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updatedOrder = await Order.findByIdAndUpdate(req.params.id, { status: status }, { new: true });
        res.json(updatedOrder);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

app.post('/api/menu', async (req, res) => {
    try {
        const newItem = new MenuItem(req.body);
        const savedItem = await newItem.save();
        res.status(201).json(savedItem);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add menu item' });
    }
});

app.delete('/api/menu/:id', async (req, res) => {
    try {
        await MenuItem.findOneAndDelete({ id: req.params.id });
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete menu item' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));