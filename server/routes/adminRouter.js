const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const jwt = require('jsonwebtoken');


function adminAuth(req, res, next){
const token = (req.headers.authorization||'').replace('Bearer ','');
try{
const user = jwt.verify(token, process.env.JWT_SECRET);
if(!user.isAdmin) return res.status(403).json({ error: 'forbidden' });
req.user = user; next();
}catch(e){ return res.status(401).json({ error: 'unauthorized' }); }
}


router.get('/reports', adminAuth, async (req, res) => {
const list = await Report.find({}).sort({ createdAt: -1 }).limit(500).lean();
res.json(list);
});


router.post('/reports/:id', adminAuth, async (req, res) => {
const { status } = req.body;
if(!['open','reviewing','closed'].includes(status)) return res.status(400).json({ error:'bad_status' });
const upd = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
res.json(upd);
});


module.exports = router;
