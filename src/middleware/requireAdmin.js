import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import asyncHandler from '../utils/asyncHandler.js';

const ADMIN_CACHE_TTL_MS = 60 * 1000;
const adminCache = new Map();

function getCachedAdmin(id) {
  const key = String(id);
  const entry = adminCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    adminCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedAdmin(id, value) {
  adminCache.set(String(id), { value, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS });
}

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

  let admin = getCachedAdmin(decoded.userId);
  if (!admin) {
    const doc = await Admin.findById(decoded.userId).select('mobile role status').lean();
    if (!doc) {
      return res.status(401).json({ success: false, msg: 'Unauthorized: Admin not found' });
    }
    admin = { id: doc._id, mobile: doc.mobile, role: doc.role, status: doc.status };
    setCachedAdmin(decoded.userId, admin);
  }

  if (admin.role !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Access denied: not an admin' });
  }
  if (admin.status !== 'active') {
    return res.status(403).json({ success: false, msg: `Access denied: account is ${admin.status}` });
  }

  req.admin = { id: admin.id, mobile: admin.mobile, role: admin.role };
  next();
});
