import { pool } from "../config/db.js";

async function findByEmail(email) {
  const result = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
  return result.rows[0] ?? null;
}

async function findById(id) {
  const result = await pool.query('SELECT * FROM "user" WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

async function create({ email, passwordHash, name, role }) {
  const result = await pool.query(
    'INSERT INTO "user" (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [email, passwordHash, name, role]
  );
  return result.rows[0];
}

async function updateName(id, name) {
  const result = await pool.query('UPDATE "user" SET name = $1 WHERE id = $2 RETURNING *', [
    name,
    id,
  ]);
  return result.rows[0] ?? null;
}

async function updatePasswordHash(id, passwordHash) {
  const result = await pool.query(
    'UPDATE "user" SET password_hash = $1 WHERE id = $2 RETURNING *',
    [passwordHash, id]
  );
  return result.rows[0] ?? null;
}

export const userRepository = { findByEmail, findById, create, updateName, updatePasswordHash };
