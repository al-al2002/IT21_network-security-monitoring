// controllers/ruleController.js
// CRUD for detection rules. Reads are open to any logged-in user;
// writes (create/update/delete) require admin.

const mongoose = require('mongoose');
const Rule = require('../models/Rule');
const { invalidateRulesCache } = require('../services/analyzer');

const listRules = async (req, res) => {
  try {
    const rules = await Rule.find({}).sort({ createdAt: -1 });
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch rules', error: err.message });
  }
};

const createRule = async (req, res) => {
  try {
    const { name, description, condition, severity, isActive } = req.body;
    if (!name || !condition || !severity) {
      return res.status(400).json({ message: 'name, condition, and severity are required' });
    }
    const rule = await Rule.create({
      name,
      description: description || '',
      condition,
      severity,
      isActive: isActive !== undefined ? isActive : true,
    });
    invalidateRulesCache();
    res.status(201).json({ rule });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create rule', error: err.message });
  }
};

const updateRule = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid rule id' });
    }
    const updates = {};
    ['name', 'description', 'condition', 'severity', 'isActive'].forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    const rule = await Rule.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    invalidateRulesCache();
    res.json({ rule });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update rule', error: err.message });
  }
};

const deleteRule = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid rule id' });
    }
    const rule = await Rule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    invalidateRulesCache();
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete rule', error: err.message });
  }
};

module.exports = { listRules, createRule, updateRule, deleteRule };
