const { success } = require('../utils/api-response');
const {
  registerCandidate,
  loginCandidate,
  logoutCandidate,
  getActiveJobPostsForCandidate,
  uploadCandidateResume,
  submitCandidateApplication,
  scoreCandidateResume,
  chatCandidate
} = require('../services/candidate.service');

function parseBooleanLike(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return fallback;
}

function normalizeRegistrationPayload(body = {}) {
  const normalizedPhone = typeof body.phone === 'string' ? body.phone.trim() : '';

  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    phone: normalizedPhone || undefined,
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    password: typeof body.password === 'string' ? body.password : '',
    is_confirmed: parseBooleanLike(body.is_confirmed, false)
  };
}

function normalizeCandidateContext(body = {}) {
  const normalizedEmail = typeof body.candidate_email === 'string'
    ? body.candidate_email.trim().toLowerCase()
    : undefined;

  return {
    candidateId: typeof body.candidate_id === 'string' ? body.candidate_id.trim() : undefined,
    candidateName: typeof body.candidate_name === 'string' ? body.candidate_name.trim() : undefined,
    candidateEmail: normalizedEmail,
    candidateIsConfirmed: parseBooleanLike(body.candidate_is_confirmed, true)
  };
}

function validateRegistrationPayload(payload) {
  if (!payload.name) {
    return 'name is required.';
  }

  if (!payload.email) {
    return 'email is required.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return 'email format is invalid.';
  }

  if (!payload.password || payload.password.length < 8) {
    return 'password must be at least 8 characters.';
  }

  return null;
}

async function registration(req, res, next) {
  try {
    const payload = normalizeRegistrationPayload(req.body);
    const validationError = validateRegistrationPayload(payload);

    if (validationError) {
      const error = new Error(validationError);
      error.statusCode = 400;
      throw error;
    }

    const candidate = await registerCandidate(payload);
    return res.status(201).json(success(candidate, 'Candidate registered successfully'));
  } catch (error) {
    return next(error);
  }
}

function normalizeLoginPayload(body = {}) {
  return {
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    password: typeof body.password === 'string' ? body.password : ''
  };
}

function validateLoginPayload(payload) {
  if (!payload.email) {
    return 'email is required.';
  }

  if (!payload.password) {
    return 'password is required.';
  }

  return null;
}

async function login(req, res, next) {
  try {
    const payload = normalizeLoginPayload(req.body);
    const validationError = validateLoginPayload(payload);

    if (validationError) {
      const error = new Error(validationError);
      error.statusCode = 400;
      throw error;
    }

    const session = await loginCandidate(payload);

    res.cookie('access_tokens', session.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    });

    res.cookie('refresh_tokens', session.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    });

    return res.status(200).json(success(session.candidate, session.message));
  } catch (error) {
    return next(error);
  }
}

function getCookieToken(req, pluralName, singularName) {
  return req.cookies?.[pluralName] || req.cookies?.[singularName] || null;
}

async function logout(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('no active sessions');
      error.statusCode = 400;
      throw error;
    }

    await logoutCandidate({ accessToken, refreshToken });

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    };

    res.clearCookie('access_tokens', cookieOptions);
    res.clearCookie('refresh_tokens', cookieOptions);
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);

    return res.status(200).json(success(null, 'successfully logged out'));
  } catch (error) {
    return next(error);
  }
}

async function getPosts(req, res, next) {
  try {
    const posts = await getActiveJobPostsForCandidate();
    return res.status(200).json(success(posts, 'active job posts retrieved successfully'));
  } catch (error) {
    return res.status(200).json(success([], 'active job posts retrieved successfully'));
  }
}

async function uploadResume(req, res, next) {
  try {
    await uploadCandidateResume({
      file: req.file,
      candidateContext: normalizeCandidateContext(req.body)
    });

    return res.status(200).json(success(null, 'we received the cv successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json({
        success: false,
        message: 'something wrong happened, please try again'
      });
    }

    return next(error);
  }
}

async function submitApplication(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('unauth');
      error.statusCode = 401;
      throw error;
    }

    await submitCandidateApplication({
      accessToken,
      refreshToken,
      postId: req.body?.post_id,
      body: req.body,
      file: req.file
    });

    return res.status(200).json(success(null, 'we received your application'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json({
        success: false,
        message: 'something wrong happened, please try again'
      });
    }

    return next(error);
  }
}

async function scoreResume(req, res, next) {
  try {
    const scored = await scoreCandidateResume({
      fileId: req.body?.file_id,
      jobId: req.body?.job_id,
      file: req.file,
      candidateContext: normalizeCandidateContext(req.body)
    });

    return res.status(200).json(success(scored, 'resume scored successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json({
        success: false,
        message: 'something wrong happened, please try again'
      });
    }

    return next(error);
  }
}

async function chat(req, res, next) {
  try {
    const result = await chatCandidate({
      jobId: req.body?.job_id,
      question: req.body?.question
    });

    return res.status(200).json(success(result, 'chat response returned successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json({
        success: false,
        message: 'something wrong happened, please try again'
      });
    }

    return next(error);
  }
}

module.exports = {
  registration,
  login,
  logout,
  getPosts,
  uploadResume,
  submitApplication,
  scoreResume,
  chat
};
