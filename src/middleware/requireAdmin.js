import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import asyncHandler from '../utils/asyncHandler.js';

export const requireAdmin = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, msg: 'Unauthorized: No token provided' });
  }
  const token = header.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, msg: 'Unauthorized: Invalid token format' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'change_me_jwt_secret');
  } catch (err) {
    return res.status(401).json({ success: false, msg: 'Unauthorized: Invalid or expired token' });
  }

  const admin = await Admin.findById(decoded.userId);
  if (!admin) {
    return res.status(401).json({ success: false, msg: 'Unauthorized: Admin not found' });
  }
  if (admin.role !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Access denied: not an admin' });
  }
  if (admin.status !== 'active') {
    return res.status(403).json({ success: false, msg: `Access denied: account is ${admin.status}` });
  }

  req.admin = { id: admin._id, mobile: admin.mobile, role: admin.role };
  next();
});
