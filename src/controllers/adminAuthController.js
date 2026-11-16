import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import asyncHandler from '../utils/asyncHandler.js';

const SALT_ROUNDS = 10;

export const registerAdmin = asyncHandler(async (req, res) => {
  const { mobile, password } = req.body ?? {};
  if (!mobile || !password) {
    return res.status(400).json({ success: false, msg: 'mobile and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, msg: 'password must be at least 6 characters' });
  }

  const exists = await Admin.findOne({ mobile: String(mobile).trim() });
  if (exists) {
    return res.status(409).json({ success: false, msg: 'mobile already registered' });
  }

  const hashed = await bcrypt.hash(String(password), SALT_ROUNDS);
  const admin = await Admin.create({
    mobile: String(mobile).trim(),
    password: hashed,
    role: 'admin',
    status: 'active',
  });

  // No JWT on register — login to obtain a token.
  return res.status(201).json({
    success: true,
    msg: 'Admin registered successfully',
    admin: { id: admin._id, mobile: admin.mobile, role: admin.role, status: admin.status },
  });
});

export const loginAdmin = asyncHandler(async (req, res) => {
  const { mobile, password } = req.body ?? {};
  if (!mobile || !password) {
    return res.status(400).json({ success: false, msg: 'mobile and password are required' });
  }

  const admin = await Admin.findOne({ mobile: String(mobile).trim() });
  if (!admin) {
    return res.status(404).json({ success: false, msg: 'Admin not found' });
  }
  if (admin.role !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Access denied: not an admin' });
  }
  if (admin.status !== 'active') {
    return res.status(403).json({ success: false, msg: `Access denied: account is ${admin.status}` });
  }

  const isMatch = await bcrypt.compare(String(password), admin.password);
  if (!isMatch) {
    return res.status(400).json({ success: false, msg: 'Invalid credentials' });
  }

  const secret = process.env.JWT_SECRET || 'change_me_jwt_secret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const token = jwt.sign({ userId: admin._id, role: admin.role }, secret, { expiresIn });

  return res.json({
    success: true,
    msg: 'Admin login successful',
    token,
    admin: { id: admin._id, mobile: admin.mobile, role: admin.role, status: admin.status },
  });
});
