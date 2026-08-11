import groq from '../config/groq.js';
import db from '../config/db.js';
import { QUIZ_BANK, GENERIC_BANK } from '../services/quizBank.js';

const QUIZ_MODEL = 'llama-3.3-70b-versatile';
const PASS_PERCENT = 70;

const ROLE_MAP = {
  accounts: 'Accounts',
  telecalling: 'Telecalling',
  'graphic designer': 'Graphic Designer',
  'web app developer': 'Web App Developer',
  hr: 'HR',
};

function normalizeRole(role) {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_MAP[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function extractJson(text) {
  if (!text) return null;
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function fallbackQuestions(role) {
  return QUIZ_BANK[role.toLowerCase()] || GENERIC_BANK;
}

// Generate 10 role-based questions: 7 MCQ + 3 short answer.
export const generateQuiz = async (req, res) => {
  try {
    const role = String(req.body?.role || '').trim();
    if (!role) return res.status(400).json({ message: 'Role is required' });

    const prompt = `You are an interview coach. Generate a short skill quiz for a candidate applying for the role of "${normalizeRole(role)}" at a non-profit organisation.

Return ONLY valid JSON, an array of exactly 10 question objects:
- The first 7 must have "type": "mcq", each with "question", "options" (exactly 4 strings), and "answer" (the correct option text).
- The last 3 must have "type": "short", each with only "question" and "answer": "".

Rules:
- Questions must be simple, practical and relevant to the "${role}" role.
- Keep options short and unambiguous.
- Do not include any text outside the JSON array.`;

    let questions = null;
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You generate strict JSON only. No markdown, no commentary.' },
          { role: 'user', content: prompt },
        ],
        model: QUIZ_MODEL,
        max_tokens: 1500,
        temperature: 0.6,
      });
      const text = completion.choices?.[0]?.message?.content?.trim() || '';
      const parsed = extractJson(text);
      if (Array.isArray(parsed) && parsed.length === 10) {
        questions = parsed.map((q) => ({
          type: q.type === 'short' ? 'short' : 'mcq',
          question: String(q.question || '').trim(),
          options: q.type !== 'short' ? (Array.isArray(q.options) ? q.options.map(String) : []) : undefined,
          answer: q.type !== 'short' ? String(q.answer || '') : '',
        }));
        const valid = questions.every((q) =>
          q.question &&
          (q.type === 'short' || (q.options.length === 4 && q.answer && q.options.includes(q.answer)))
        );
        if (!valid) questions = null;
      }
    } catch (err) {
      console.error('Quiz generation error:', err.message);
    }

    if (!questions) questions = fallbackQuestions(role);

    return res.json({ role: normalizeRole(role), questions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Grade a submitted quiz: MCQ exactly, short answers via AI. Persist the result.
export const submitQuiz = async (req, res) => {
  try {
    const { candidate, role, other_role, role_label, questions, answers } = req.body || {};
    if (!candidate || !Array.isArray(questions) || !answers) {
      return res.status(400).json({ message: 'Candidate, questions and answers are required' });
    }
    if (!Array.isArray(questions) || questions.length !== 10) {
      return res.status(400).json({ message: 'A complete 10-question quiz is required' });
    }

    const firstName = String(candidate.name || '').trim();
    const surname = String(candidate.surname || '').trim();
    if (!firstName || !surname) {
      return res.status(400).json({ message: 'Candidate name is required' });
    }

    let mcqCorrect = 0;
    let shortAnswers = [];
    questions.forEach((q, i) => {
      const userAnswer = String(answers[i] ?? '').trim();
      if (q.type === 'short') {
        shortAnswers.push({ question: q.question, answer: userAnswer });
      } else if (userAnswer && userAnswer === String(q.answer ?? '').trim()) {
        mcqCorrect += 1;
      }
    });

    const shortMarks = await gradeShortAnswers(shortAnswers, role);

    const marks = mcqCorrect + shortMarks;
    const maxMarks = questions.length;
    const percentage = Math.round((marks / maxMarks) * 100);
    const verdict = percentage >= PASS_PERCENT ? 'eligible' : 'not-eligible';

    let feedback = await buildFeedback(questions, answers, shortMarks, role, percentage);
    if (!feedback) {
      feedback = `Scored ${marks}/${maxMarks} (${percentage}%). ` +
        (verdict === 'eligible'
          ? 'Candidate cleared the quiz threshold and is eligible for an interview.'
          : 'Candidate did not reach the 70% threshold. Review the answers before scheduling an interview.');
    }

    const { data: row, error } = await db
      .from('quiz_results')
      .insert({
        first_name: firstName,
        surname,
        age: candidate.age ? Number(candidate.age) : null,
        dob: candidate.dob || null,
        role: normalizeRole(role),
        other_role: other_role ? String(other_role).trim() : null,
        role_label: role_label || normalizeRole(role),
        questions,
        answers,
        marks,
        max_marks: maxMarks,
        percentage,
        verdict,
        ai_feedback: feedback,
      })
      .select()
      .single();

    if (error) console.error('Failed to save quiz result:', error.message);

    return res.json({
      id: row?.id || null,
      name: `${firstName} ${surname}`,
      role: role_label || normalizeRole(role),
      marks,
      max_marks: maxMarks,
      percentage,
      verdict,
      feedback,
      mcq_correct: mcqCorrect,
      short_marks: shortMarks,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

async function gradeShortAnswers(shortAnswers, role) {
  if (shortAnswers.length === 0) return 0;
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a strict interview evaluator for the "${normalizeRole(role)}" role. Grade each short answer 0 or 1 (0 = wrong/off-topic/empty, 1 = reasonable and relevant). Return ONLY JSON: {"marks": [array of 0 or 1], "feedback": "one short line"}. No commentary outside the JSON.`,
        },
        { role: 'user', content: JSON.stringify(shortAnswers) },
      ],
      model: QUIZ_MODEL,
      max_tokens: 300,
      temperature: 0.2,
    });
    const parsed = extractJson(completion.choices?.[0]?.message?.content?.trim() || '');
    const arr = parsed?.marks;
    if (Array.isArray(arr) && arr.length === shortAnswers.length) {
      return arr.filter((m) => Number(m) === 1).length;
    }
  } catch (err) {
    console.error('Short answer grading error:', err.message);
  }
  // Fallback: partial credit for a genuine attempt.
  return shortAnswers.filter((s) => String(s.answer || '').trim().length >= 10).length * 0.5;
}

async function buildFeedback(questions, answers, shortMarks, role, percentage) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an interview coach. Write 2-3 sentences of helpful feedback for a "${normalizeRole(role)}" quiz candidate who scored ${percentage}%. Mention strengths and areas to improve. Be encouraging and specific.`,
        },
        { role: 'user', content: JSON.stringify({ questions, answers, short_marks: shortMarks }) },
      ],
      model: QUIZ_MODEL,
      max_tokens: 250,
      temperature: 0.5,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error('Feedback error:', err.message);
    return null;
  }
}

// HR / recruiter view of every candidate result.
export const listResults = async (req, res) => {
  try {
    const { role, verdict } = req.query;
    let query = db.from('quiz_results').select('*').order('created_at', { ascending: false });
    if (role) query = query.eq('role', normalizeRole(role));
    if (verdict) query = query.eq('verdict', verdict);
    const { data, error } = await query;
    if (error) return res.status(500).json({ message: error.message });
    return res.json(data || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getResult = async (req, res) => {
  try {
    const { data, error } = await db
      .from('quiz_results')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ message: error.message });
    if (!data) return res.status(404).json({ message: 'Result not found' });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
