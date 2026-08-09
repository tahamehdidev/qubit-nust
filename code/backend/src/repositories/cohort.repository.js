import { pool } from "../config/db.js";

async function findById(id) {
  const result = await pool.query("SELECT * FROM cohort WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

async function findByJoinCode(joinCode) {
  const result = await pool.query("SELECT * FROM cohort WHERE join_code = $1", [joinCode]);
  return result.rows[0] ?? null;
}

async function findAllForInstructor(instructorId) {
  const result = await pool.query(
    "SELECT * FROM cohort WHERE instructor_id = $1 ORDER BY created_at",
    [instructorId]
  );
  return result.rows;
}

// Returns null on a join_code collision (23505) rather than throwing, same pattern as
// cohortEnrollmentRepository.create's unique-violation handling -- the service layer retries with
// a freshly generated code (utils/joinCode.js) rather than treating this as a real error.
async function create({ name, instructorId, joinCode }) {
  try {
    const result = await pool.query(
      "INSERT INTO cohort (name, instructor_id, join_code) VALUES ($1, $2, $3) RETURNING *",
      [name, instructorId, joinCode]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "23505") return null; // unique_violation (cohort_join_code_unique)
    throw err;
  }
}

async function update(id, { name, instructorId }) {
  const result = await pool.query(
    "UPDATE cohort SET name = COALESCE($1, name), instructor_id = COALESCE($2, instructor_id) WHERE id = $3 RETURNING *",
    [name ?? null, instructorId ?? null, id]
  );
  return result.rows[0] ?? null;
}

// Same collision-returns-null pattern as create() -- regenerating a leaked code is rare enough
// that a fresh retry from the service layer is simpler than a database-side uniqueness loop.
async function updateJoinCode(id, joinCode) {
  try {
    const result = await pool.query("UPDATE cohort SET join_code = $1 WHERE id = $2 RETURNING *", [
      joinCode,
      id,
    ]);
    return result.rows[0] ?? null;
  } catch (err) {
    if (err.code === "23505") return null; // unique_violation (cohort_join_code_unique)
    throw err;
  }
}

async function deleteById(id) {
  await pool.query("DELETE FROM cohort WHERE id = $1", [id]);
}

export const cohortRepository = {
  findById,
  findByJoinCode,
  findAllForInstructor,
  create,
  update,
  updateJoinCode,
  deleteById,
};
