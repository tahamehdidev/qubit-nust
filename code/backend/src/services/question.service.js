import { questionRepository } from "../repositories/question.repository.js";
import { NotFoundError } from "../errors/index.js";

// 02-api-contract.md §4.4 / 03-security-architecture.md §1.5 -- the answer/scoring fields per
// question type. Kept private to this module: nothing outside toPublicQuestion needs to know
// which specific fields count as "the answer" for a given type.
function stripAnswerFields(type, content) {
  switch (type) {
    case "mcq":
      return { options: content?.options };
    case "drag_drop":
      return { items: content?.items };
    case "numeric":
    default:
      // Numeric questions have nothing safe to reveal pre-attempt -- no options/items to show.
      return {};
  }
}

// Question.content must never include the correct answer/scoring for a learner caller, but must
// include it in full for admin/instructor callers authoring content (§1.5). This is a role check,
// not an ownership check -- any instructor/admin sees full content regardless of whether they
// created or can edit this specific question. Exported so screen.service.js/practiceSet.service.js
// can shape embedded Question data identically, rather than reimplementing this per resource.
//
// hint/explanation follow the same role split as content, but for different reasons each:
// hint is safe pre-attempt for anyone (it's never the answer), so it's always included when
// present -- there's no learner-specific stripping to do, unlike content. explanation is the
// opposite: it's excluded entirely for a learner caller, not just here but everywhere this
// function is reused (GET /questions, /screens/:id, /practice-sets/:id) -- a learner only ever
// receives it via attempt.service.js's submitAttempt response, after their answer is graded.
function toPublicQuestion(question, callerRole) {
  const isLearner = callerRole === "learner";
  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    createdById: question.created_by_id,
    content: isLearner ? stripAnswerFields(question.type, question.content) : question.content,
    hint: question.hint ?? null,
    ...(isLearner ? {} : { explanation: question.explanation ?? null }),
  };
}

async function list({ search, type, page = 1, limit = 20 }, callerRole) {
  const { questions, total } = await questionRepository.findAll({ search, type, page, limit });
  return {
    questions: questions.map((q) => toPublicQuestion(q, callerRole)),
    pagination: { page, limit, total },
  };
}

async function getById(id, callerRole) {
  const question = await questionRepository.findById(id);
  if (!question) throw new NotFoundError("Question not found.");
  return toPublicQuestion(question, callerRole);
}

async function create({ prompt, type, content, createdById, hint, explanation }) {
  const question = await questionRepository.create({
    prompt,
    type,
    content,
    createdById,
    hint,
    explanation,
  });
  return toPublicQuestion(question, "instructor"); // the creator always sees what they just authored in full
}

async function update(id, { prompt, type, content, hint, explanation }) {
  const question = await questionRepository.update(id, {
    prompt,
    type,
    content,
    hint,
    explanation,
  });
  if (!question) throw new NotFoundError("Question not found.");
  return toPublicQuestion(question, "instructor");
}

// Cascades to ScreenQuestion/PracticeSetQuestion with no pre-check -- a deliberately accepted
// risk (06-threat-model.md, Instructor actor, Tampering), not a bug.
async function remove(id) {
  const question = await questionRepository.findById(id);
  if (!question) throw new NotFoundError("Question not found.");
  await questionRepository.deleteById(id);
}

// 03-security-architecture.md §3.4 Variant D -- creator OR attached-to-an-owned-course via
// either junction path. Deliberately broader than simple ownership (06-threat-model.md,
// Instructor actor).
async function checkEditAccess(instructorId, questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question) throw new NotFoundError("Question not found.");
  if (question.created_by_id === instructorId) return true;
  if (await questionRepository.isAttachedViaScreenToOwnedCourse(questionId, instructorId)) {
    return true;
  }
  return questionRepository.isAttachedViaPracticeSetToOwnedCourse(questionId, instructorId);
}

export const questionService = {
  list,
  getById,
  create,
  update,
  remove,
  checkEditAccess,
  toPublicQuestion,
};
