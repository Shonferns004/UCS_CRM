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

    // Normal Metropad token: the payload id maps directly to a metropad_users row.
    let { data, error } = await requireDb()
      .from('metropad_users')
      .select('id, name, email, role, is_active')
      .eq('id', decoded.id)
      .maybeSingle()

    if (error) throw normalizeError(error)

    // Accounts-panel token (SSO): the id is an accounts user id, not a metropad
    // user id, so fall back to matching by email. The signed-in accounts session
    // drives Metropad without a second login. The resolved user is still a
    // metropad_users row, so all downstream joins (audit created_by, authorizers,
    // cash collection) behave identically. If no metropad user is linked to this
    // accounts email, access is refused (no further logic runs).
    if (!data && decoded.email) {
      const { data: byEmail, error: emailError } = await requireDb()
        .from('metropad_users')
        .select('id, name, email, role, is_active')
        .eq('email', decoded.email)
        .maybeSingle()
      if (emailError) throw normalizeError(emailError)
      data = byEmail
    }

    if (!data) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized — no Metropad account linked to this sign-in',
      })
    }

    const user = data

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
