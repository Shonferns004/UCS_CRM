import dotenv from 'dotenv';

dotenv.config();

// Who may assign Social Monthly Planner tasks. Every Social team member logs in
// with the derived 'digital' role, so no role can name the head — she is named
// here instead (by name to survive id changes and by id to survive renames).
// Both lists can be overridden via env so the rule needs no code edit elsewhere.
const readList = (env) =>
  String(process.env[env] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const envHeads = readList('SOCIAL_TASK_HEADS');
const envHeadIds = readList('SOCIAL_TASK_HEAD_IDS');
const TASK_ASSIGN_HEADS = envHeads.length ? envHeads : ['Shital Parmar'];
const TASK_ASSIGN_HEAD_IDS = envHeadIds.length ? envHeadIds : ['a4ea5150-d793-4a98-b849-4a116e17e7f4'];

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Only the named head may assign — deliberately no role fallback, so no other
// account (not even super_admin) can hand out tasks without being named here.
export const isTaskHead = (user) => {
  if (!user) return false;
  const id = String(user.id ?? user.worker_id ?? '');
  return (
    TASK_ASSIGN_HEADS.some((name) => norm(name) === norm(user.name)) ||
    TASK_ASSIGN_HEAD_IDS.some((headId) => String(headId) === id)
  );
};

export const TASK_ASSIGN_HEADS_LIST = TASK_ASSIGN_HEADS;
export const TASK_ASSIGN_HEAD_IDS_LIST = TASK_ASSIGN_HEAD_IDS;