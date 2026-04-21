const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const MenuItem = require('./models/MenuItem');
const Order = require('./models/Order');

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const PAYU_KEY = process.env.PAYU_KEY;
const PAYU_SALT = process.env.PAYU_SALT;
// Remember to change this to 'https://secure.payu.in/_payment' when you are ready for real money!
const PAYU_URL = 'https://test.payu.in/_payment'; 

// === NEW: DYNAMIC URLS ===
// If these are not in .env, it defaults to localhost for testing
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

app.post('/api/payu/initiate', async (req, res) => {
    try {
        const orderData = { ...req.body, status: 'Awaiting_Payment' };
        const newOrder = new Order(orderData);
        const savedOrder = await newOrder.save();

        const txnid = savedOrder._id.toString(); 
        const amount = savedOrder.totalAmount;
        const productinfo = 'Taraaang Order';
        const firstname = savedOrder.customer.name.replace(/\s/g, ''); 
        const email = 'guest@taraaang.com'; 
        const phone = savedOrder.customer.phone;

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
            // Uses dynamic Backend URL
            surl: `${BACKEND_URL}/api/payu/success`,
            furl: `${BACKEND_URL}/api/payu/fail`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to initiate payment' });
    }
});

app.post('/api/payu/success', async (req, res) => {
    try {
        const { txnid, status } = req.body;
        if (status === 'success') {
            await Order.findByIdAndUpdate(txnid, { status: 'Pending' });
            // Uses dynamic Frontend URL
            res.redirect(`${FRONTEND_URL}/index.html?order_success=true&order_id=${txnid}`);
        } else {
            res.redirect(`${FRONTEND_URL}/index.html?order_failed=true`);
        }
    } catch (error) {
        res.send("Payment verification failed.");
    }
});

app.post('/api/payu/fail', async (req, res) => {
    // Uses dynamic Frontend URL
    res.redirect(`${FRONTEND_URL}/index.html?order_failed=true`);
});

app.get('/api/orders/active', async (req, res) => {
    try {
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

// Update a Menu Item (Admin Dashboard)
app.put('/api/menu/:id', async (req, res) => {
    try {
        // We find and update by your custom "id" field (e.g., 's1', 'item_1234')
        const updatedItem = await MenuItem.findOneAndUpdate(
            { id: req.params.id },
            req.body,
            { new: true } // Returns the updated document
        );
        
        if (!updatedItem) return res.status(404).json({ error: 'Item not found' });
        res.json(updatedItem);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update menu item' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
