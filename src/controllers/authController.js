import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prismaClient.js";

const DEFAULT_ROLE = "Staff";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"; // fallback keeps dev login working
const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || "1d";
const toTitle = (role) => {
  if (!role) return DEFAULT_ROLE;
  const r = String(role).trim();
  if (!r) return DEFAULT_ROLE;
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
};

function expiryFromToken(token) {
  const decoded = jwt.decode(token);
  return decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin || admin.is_active === false) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const roleOut =
    admin.admin_id === 1
      ? "Admin"
      : toTitle(admin.role || DEFAULT_ROLE);
  const token = jwt.sign({ sub: admin.admin_id, role: roleOut }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

  const expiryDate = expiryFromToken(token);

  const session = await prisma.session_token.create({
    data: {
      admin_id: admin.admin_id,
      role_type: roleOut,
      token_value: token,
      expiry_at: expiryDate,
      created_by: "system-login",
    },
  });

  await prisma.token_log.create({ data: { token_id: session.token_id, action: "login" } });

  return res.json({
    token,
    expires_at: expiryDate,
    admin: {
      id: admin.admin_id,
      name: admin.name,
      email: admin.email,
      role: roleOut,
    },
  });
}

export async function logout(req, res) {
  const tokenRow = req.tokenRow;
  if (tokenRow) {
    await prisma.session_token.update({
      where: { token_id: tokenRow.token_id },
      data: { is_revoked: true, last_used_at: new Date() },
    });
    await prisma.token_log.create({ data: { token_id: tokenRow.token_id, action: "logout" } });
  }
  return res.json({ success: true });
}
