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
const PAYU_URL = 'https://secure.payu.in/_payment'; // https://secure.payu.in/_payment LIVE URL, https://test.payu.in/_payment test url

// === DYNAMIC URLS ===
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';

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
        const orderData = { ...req.body, status: 'Awaiting_Payment' };
        const newOrder = new Order(orderData);
        const savedOrder = await newOrder.save();

        const txnid = savedOrder._id.toString(); 
        const amount = savedOrder.totalAmount;
        const productinfo = 'Taraaang Order';
        const firstname = savedOrder.customer.name.replace(/\s/g, ''); // Remove spaces
        const email = 'guest@taraaang.com'; 
        const phone = savedOrder.customer.phone;

        // Forward Hash Formula: key|txnid|amount|productinfo|firstname|email|||||||||||SALT
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
            surl: `${BACKEND_URL}/api/payu/success`,
            furl: `${BACKEND_URL}/api/payu/fail`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to initiate payment' });
    }
});

// 2. PAYU SUCCESS ROUTE (NOW SECURE)
app.post('/api/payu/success', async (req, res) => {
    try {
        // PayU sends all these details back. We MUST verify them.
        const { txnid, status, amount, productinfo, firstname, email, hash } = req.body;
        
        // 🚨 SECURITY CHECK: Generate the Reverse Hash
        // Formula: SALT|status|||||||||||email|firstname|productinfo|amount|txnid|key
        const reverseHashString = `${PAYU_SALT}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${PAYU_KEY}`;
        const expectedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex');

        // Check if the hash PayU sent matches our calculation
        if (hash !== expectedHash) {
            console.error(`🚨 PAYMENT HACK ATTEMPT DETECTED FOR ORDER ${txnid} 🚨`);
            return res.redirect(`${FRONTEND_URL}/index.html?order_failed=true`);
        }

        // If the hash matches AND status is success, it is 100% legitimate!
        if (status === 'success') {
            await Order.findByIdAndUpdate(txnid, { status: 'Pending' });
            res.redirect(`${FRONTEND_URL}/index.html?order_success=true&order_id=${txnid}`);
        } else {
            res.redirect(`${FRONTEND_URL}/index.html?order_failed=true`);
        }
    } catch (error) {
        console.error("Success Route Error:", error);
        res.send("Payment verification failed.");
    }
});

// 3. PAYU FAILURE ROUTE
app.post('/api/payu/fail', async (req, res) => {
    res.redirect(`${FRONTEND_URL}/index.html?order_failed=true`);
});


// 🚨 NEW ROUTE ADDED HERE: DIRECT CASH ORDER (For Admin POS System) 🚨
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        const savedOrder = await newOrder.save();
        res.status(201).json({ message: 'Order placed successfully', orderId: savedOrder._id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to place direct cash order' });
    }
});


// --- ADMIN DASHBOARD ROUTES ---
app.get('/api/orders/active', async (req, res) => {
    try {
        const activeOrders = await Order.find({ status: { $nin: ['Completed', 'Awaiting_Payment'] } }).sort({ timestamp: -1 });
        res.json(activeOrders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get ALL Completed Orders for the Sales Report
app.get('/api/orders/completed', async (req, res) => {
    try {
        const completedOrders = await Order.find({ status: 'Completed' }).sort({ timestamp: -1 });
        res.json(completedOrders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch completed orders' });
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

app.put('/api/menu/:id', async (req, res) => {
    try {
        const updatedItem = await MenuItem.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        if (!updatedItem) return res.status(404).json({ error: 'Item not found' });
        res.json(updatedItem);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update menu item' });
    }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
