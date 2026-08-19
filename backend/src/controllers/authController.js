import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import db from '../config/db.js';
import { getWorkerByLoginId, getWorkerById } from '../models/workerModel.js';
import { getUserByEmail, getUserByName, getUserById } from '../models/userModel.js';
import { getHRByEmail } from '../models/hrModel.js';
import { findValidImpersonationCode, markImpersonationCodeUsed } from '../models/impersonationCodeModel.js';

dotenv.config();

const TOKEN_EXPIRY = '100y';

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign(
        { id: 0, email, role: 'super_admin', name: 'Super Admin' },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );
      return res.json({ token, role: 'super_admin', user: { name: 'Super Admin', email, role: 'super_admin' }, message: 'Login successful' });
    }
    return res.status(401).json({ message: 'Invalid admin credentials' });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed' });
  }
};

// Restricted login for the salary calculator app — only the Accounts
// department (workers with department account/accounts/admin or users with
// role accounts) and the super admin may log in.
export const salaryLogin = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required' });
    }
    const isEmail = identifier.includes('@');

    if (
      isEmail &&
      identifier === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const role = 'super_admin';
      const token = jwt.sign(
        { id: 0, email: identifier, role, name: 'Super Admin' },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );
      return res.json({ token, role, user: { name: 'Super Admin', email: identifier, role }, message: 'Login successful' });
    }

    const deptIsAccount = (d) => {
      const x = String(d || '').toLowerCase().trim();
      return x === 'account' || x === 'accounts' || x === 'admin';
    };

    const worker = await getWorkerByLoginId(identifier);
    if (worker) {
      if (worker.is_active === false || worker.employment_status === 'terminated') {
        return res.status(403).json({ message: 'Account is deactivated' });
      }
      if (!deptIsAccount(worker.department)) {
        return res.status(403).json({ message: 'Access denied. Only the Accounts department or Super Admin can log in.' });
      }
      const isMatch = await bcrypt.compare(password, worker.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      const role = 'accounts';
      const token = jwt.sign(
        { id: worker.id, login_id: worker.login_id, ngo_id: worker.ngo_id, role, department: worker.department },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );
      return res.json({
        token,
        role,
        user: { id: worker.id, name: worker.name, email: worker.email, login_id: worker.login_id, department: worker.department },
        message: 'Login successful',
      });
    }

    const userByEmail = isEmail ? await getUserByEmail(identifier) : null;
    const userByName = !isEmail ? await getUserByName(identifier) : null;
    const userRow = userByEmail || userByName;
    if (userRow) {
      if (userRow.is_active === false) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }
      if (userRow.role !== 'accounts' && userRow.role !== 'super_admin') {
        return res.status(403).json({ message: 'Access denied. Only the Accounts department or Super Admin can log in.' });
      }
      const isMatch = await bcrypt.compare(password, userRow.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      const role = userRow.role;
      const token = jwt.sign(
        { id: userRow.id, ngo_id: userRow.ngo_id, email: userRow.email, role, name: userRow.name },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );
      const { password_hash, ...safeUser } = userRow;
      return res.json({ token, role, user: safeUser, message: 'Login successful' });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed' });
  }
};

export const unifiedLogin = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    console.log('[LOGIN] identifier:', JSON.stringify(identifier), 'endsWith @ufs:', identifier?.endsWith('@ufs'));
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required' });
    }

    const isUfsLogin = identifier.endsWith('@ufs');
    const isEmail = !isUfsLogin && identifier.includes('@');
    const expiry = TOKEN_EXPIRY;

    if (isUfsLogin) {
      const worker = await getWorkerByLoginId(identifier);
      if (!worker) {
        return res.status(401).json({ message: 'Invalid login ID' });
      }
      if (worker.is_active === false || worker.employment_status === 'terminated') {
        return res.status(403).json({ message: 'Account is deactivated' });
      }
      const isMatch = await bcrypt.compare(password, worker.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      const dept = (worker.department || '').toLowerCase().trim();
      let role;
      if (dept === 'hr') role = 'hr';
      else if (dept.includes('recruit')) role = 'recruiter';
      else if (dept === 'admin') role = 'accounts';
      else if (dept === 'fro') role = 'fro';
      else if (dept === 'ngo admin') role = 'admin';
      else if (dept === 'digital' || dept.includes('develop')) role = 'digital';
      else role = 'worker';
      const token = jwt.sign(
        { id: worker.id, login_id: worker.login_id, ngo_id: worker.ngo_id, name: worker.name, role, department: worker.department },
        process.env.JWT_SECRET,
        { expiresIn: expiry }
      );
      return res.json({
        token,
        role,
        user: { id: worker.id, name: worker.name, email: worker.email, login_id: worker.login_id, ngo_id: worker.ngo_id, gender: worker.gender, dob: worker.dob, department: worker.department },
        message: 'Login successful',
      });
    }

    if (isEmail) {
      if (
        identifier === process.env.ADMIN_EMAIL &&
        password === process.env.ADMIN_PASSWORD
      ) {
        const token = jwt.sign(
          { id: 0, email: identifier, role: 'super_admin', name: 'Super Admin' },
          process.env.JWT_SECRET,
          { expiresIn: expiry }
        );
        return res.json({ token, role: 'super_admin', user: { name: 'Super Admin', email: identifier, role: 'super_admin' }, message: 'Login successful' });
      }

      if (
        identifier === process.env.USER_EMAIL &&
        password === process.env.USER_PASSWORD
      ) {
        const token = jwt.sign(
          { id: -1, email: identifier, role: 'user', name: 'User' },
          process.env.JWT_SECRET,
          { expiresIn: expiry }
        );
        return res.json({ token, role: 'user', user: { name: 'User', email: identifier, role: 'user' }, message: 'Login successful' });
      }

      const user = await getUserByEmail(identifier);
      if (user) {
        if (user.is_active === false) {
          return res.status(403).json({ message: 'Account is deactivated' });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid password' });
        }
        const token = jwt.sign(
          { id: user.id, ngo_id: user.ngo_id, email: user.email, role: user.role, name: user.name },
          process.env.JWT_SECRET,
          { expiresIn: expiry }
        );
        const { password_hash, ...safeUser } = user;
        return res.json({ token, role: user.role, user: safeUser, message: 'Login successful' });
      }

      const hr = await getHRByEmail(identifier);
      if (hr) {
        if (hr.is_active === false) {
          return res.status(403).json({ message: 'Account is deactivated' });
        }
        const isMatch = await bcrypt.compare(password, hr.password_hash);
        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid password' });
        }
        const token = jwt.sign(
          { id: hr.id, ngo_id: hr.ngo_id, email: hr.email, role: 'hr', name: hr.name },
          process.env.JWT_SECRET,
          { expiresIn: expiry }
        );
        const { password_hash, ...safeHR } = hr;
        return res.json({ token, role: 'hr', user: safeHR, message: 'Login successful' });
      }

      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const userFromName = await getUserByName(identifier);
    if (userFromName) {
      if (userFromName.is_active === false) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }
      const isMatch = await bcrypt.compare(password, userFromName.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      const token = jwt.sign(
        { id: userFromName.id, ngo_id: userFromName.ngo_id, email: userFromName.email, role: userFromName.role, name: userFromName.name },
        process.env.JWT_SECRET,
        { expiresIn: expiry }
      );
      const { password_hash, ...safeUser } = userFromName;
      return res.json({ token, role: userFromName.role, user: safeUser, message: 'Login successful' });
    }

    const worker = await getWorkerByLoginId(identifier);
    if (!worker) {
      return res.status(401).json({ message: 'Invalid login ID' });
    }
    if (worker.is_active === false || worker.employment_status === 'terminated') {
      return res.status(403).json({ message: 'Account is deactivated' });
    }
    const isMatch = await bcrypt.compare(password, worker.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    const dept = (worker.department || '').toLowerCase().trim();
    let role;
    if (dept === 'hr') role = 'hr';
    else if (dept.includes('recruit')) role = 'recruiter';
    else if (dept === 'admin') role = 'accounts';
    else if (dept === 'fro') role = 'fro';
    else if (dept === 'ngo admin') role = 'admin';
    else if (dept === 'digital' || dept.includes('develop')) role = 'digital';
    else role = 'worker';
    const token = jwt.sign(
      { id: worker.id, login_id: worker.login_id, ngo_id: worker.ngo_id, role, department: worker.department },
      process.env.JWT_SECRET,
      { expiresIn: expiry }
    );
    return res.json({
      token,
      role,
      user: { id: worker.id, name: worker.name, email: worker.email, login_id: worker.login_id, ngo_id: worker.ngo_id, gender: worker.gender, dob: worker.dob, department: worker.department },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    return res.status(500).json({ message: 'Login failed', detail: error.message });
  }
};

// Super admin, NGO admin, or FRO may "work as" an FRO. The impersonated token
// keeps the operator's identity (imposter_id) so collection credit, accounts
// verification, and notifications follow the operator, while donor/assignment
// ownership follows the impersonated FRO (token id).
export const impersonateFRO = async (req, res) => {
  try {
    const { worker_id } = req.body;
    if (!worker_id) return res.status(400).json({ message: 'worker_id is required' });

    // workers.id is a UUID — never parseInt it (that would truncate ids like
    // "108a3f4e-..." to 108 and fail the uuid comparison in Postgres).
    const target = await getWorkerById(String(worker_id).trim());
    if (!target) return res.status(404).json({ message: 'Worker not found' });
    if (target.is_active === false || target.employment_status === 'terminated') {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const targetDept = String(target.department || '').toLowerCase().trim();
    if (targetDept !== 'fro') {
      return res.status(400).json({ message: 'Only FRO workers can be impersonated' });
    }

    const operatorRole = req.user.role;
    const operatorDept = String(req.user.department || '').toLowerCase().trim();
    const isSuper = operatorRole === 'super_admin' || operatorRole === 'master';
    const isNgoAdmin = operatorRole === 'admin' || operatorDept === 'ngo admin';
    const isOperatorFro = operatorRole === 'fro' || operatorDept === 'fro';

    if (!isSuper && !isNgoAdmin && !isOperatorFro) {
      return res.status(403).json({ message: 'Not allowed to impersonate an FRO' });
    }

    if (!isSuper && req.user.ngo_id && target.ngo_id && req.user.ngo_id !== target.ngo_id) {
      return res.status(403).json({ message: 'Can only impersonate FROs of your own NGO' });
    }

    // Work-as FRO requires a valid admin-generated 4-digit code (single use, 5-min expiry).
    const { code } = req.body;
    const codeStr = String(code || '').trim();
    if (!/^\d{4}$/.test(codeStr)) {
      return res.status(400).json({ message: 'A 4-digit code is required to impersonate an FRO' });
    }

    const codeRow = await findValidImpersonationCode(codeStr, req.user.ngo_id || null);
    if (!codeRow) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const used = await markImpersonationCodeUsed(codeRow.id, req.user.id || null);
    if (!used) {
      return res.status(409).json({ message: 'Code was already used. Generate a new one.' });
    }

    // Resolve the operator's display name. New worker tokens carry it, but older
    // sessions / admin accounts may not — fall back to a DB lookup.
    let imposterName = req.user.name || '';
    if (!imposterName && req.user.id != null) {
      const opWorker = await getWorkerById(String(req.user.id));
      if (opWorker?.name) imposterName = opWorker.name;
      else {
        const opUser = await getUserById(req.user.id);
        if (opUser?.name) imposterName = opUser.name;
      }
    }

    const token = jwt.sign(
      {
        id: target.id,
        login_id: target.login_id,
        ngo_id: target.ngo_id,
        role: 'fro',
        department: target.department || 'fro',
        name: target.name,
        impersonation: true,
        imposter_id: req.user.id,
        imposter_name: imposterName,
      },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    return res.json({
      token,
      role: 'fro',
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        login_id: target.login_id,
        ngo_id: target.ngo_id,
        role: 'fro',
        department: target.department,
        impersonation: true,
        imposter_id: req.user.id,
        imposter_name: imposterName,
      },
      message: `Working as ${target.name}`,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// FROs the current user is allowed to impersonate (for the "Work as" picker).
export const getFroWorkersForImpersonation = async (req, res) => {
  try {
    const operatorRole = req.user.role;
    const operatorDept = String(req.user.department || '').toLowerCase().trim();
    const isSuper = operatorRole === 'super_admin' || operatorRole === 'master';

    let query = db
      .from('workers')
      .select('id, name, login_id, ngo_id, department')
      .ilike('department', 'fro');

    if (!isSuper && !['super_admin','master','accounts'].includes(operatorRole) && req.user.ngo_id) {
      query = query.eq('ngo_id', req.user.ngo_id);
    }

    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;

    return res.json({ workers: (data || []).filter((w) => w.id !== req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
