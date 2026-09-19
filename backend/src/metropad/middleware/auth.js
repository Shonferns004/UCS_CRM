import jwt from 'jsonwebtoken'
import { requireDb, normalizeError } from '../config/supabase.js'

export const protect = async (req, res, next) => {
  try {
    let token

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized — no token provided',
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const { data, error } = await requireDb()
      .from('metropad_users')
      .select('id, name, email, role, is_active')
      .eq('id', decoded.id)
      .maybeSingle()

    if (error) throw normalizeError(error)

    const user = data

    if (!user) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized — user not found',
      })
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized — account is deactivated',
      })
    }

    req.user = user
    next()
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized — invalid token',
      })
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized — token expired',
      })
    }
    return res.status(403).json({
      success: false,
      message: 'Not authorized',
    })
  }
}

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this resource`,
      })
    }

    next()
  }
}
