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

// GET /admin/users -- same conditions-array + count-query pattern as auditLogRepository.findAll().
// `search` matches name OR email, case-insensitively, as a substring (ILIKE) -- a real search box,
// not an exact-match filter.
async function findAll({ search, role, page = 1, limit = 20 }) {
  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rowsParams = [...params, limit, (page - 1) * limit];
  const result = await pool.query(
    `SELECT * FROM "user" ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    rowsParams
  );
  const countResult = await pool.query(`SELECT COUNT(*) FROM "user" ${whereClause}`, params);

  return { users: result.rows, total: Number(countResult.rows[0].count) };
}

// COALESCE keeps the original deactivation timestamp on a repeat call, rather than bumping it --
// makes the endpoint safely idempotent. Returns null only when the id doesn't exist at all.
async function deactivate(id) {
  const result = await pool.query(
    'UPDATE "user" SET deactivated_at = COALESCE(deactivated_at, now()) WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0] ?? null;
}

export const userRepository = {
  findByEmail,
  findById,
  create,
  updateName,
  updatePasswordHash,
  findAll,
  deactivate,
};
