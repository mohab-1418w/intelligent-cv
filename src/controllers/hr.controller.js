const { success, error: errorResponse } = require('../utils/api-response');
const {
  registerHr,
  loginHr,
  logoutHr,
  rankCandidatesByResumeRate,
  acceptRejectCandidate
} = require('../services/hr.service');
const {
  addJobPost,
  getJobPosts,
  updateJobPost,
  deleteJobPost
} = require('../services/job-post.service');

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
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    password: typeof body.password === 'string' ? body.password : '',
    is_confirmed: parseBooleanLike(body.is_confirmed, false)
  };
}

function validateRegistrationPayload(payload) {
  if (!payload.name) {
    return 'name is required.';
  }

  if (!payload.phone) {
    return 'phone is required.';
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

    const hr = await registerHr(payload);
    return res.status(201).json(success(hr, 'HR registered successfully'));
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

    const session = await loginHr(payload);

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

    return res.status(200).json(success(session.hr, session.message));
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

    await logoutHr({ accessToken, refreshToken });

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

async function addPost(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('unauth');
      error.statusCode = 401;
      throw error;
    }

    const createdPost = await addJobPost({
      accessToken,
      refreshToken,
      rawPayload: req.body
    });

    return res.status(200).json(success(createdPost, 'job post added successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json(errorResponse('something wrong happened while adding'));
    }

    return next(error);
  }
}

async function getPosts(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('unauth');
      error.statusCode = 401;
      throw error;
    }

    const posts = await getJobPosts({ accessToken, refreshToken });
    return res.status(200).json(success(posts, 'job posts retrieved successfully'));
  } catch (error) {
    return next(error);
  }
}

async function updatePost(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('unauth');
      error.statusCode = 401;
      throw error;
    }

    const updatedPost = await updateJobPost({
      accessToken,
      refreshToken,
      rawPayload: req.body
    });

    return res.status(200).json(success(updatedPost, 'job post updated successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json(errorResponse('something wrong happened while updating'));
    }

    return next(error);
  }
}

async function deletePost(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('unauth');
      error.statusCode = 401;
      throw error;
    }

    await deleteJobPost({
      accessToken,
      refreshToken,
      rawPayload: req.body
    });

    return res.status(200).json(success(null, 'post deleted successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json(errorResponse('something went wrong while deleteing please try again later'));
    }

    return next(error);
  }
}

async function rankCandidates(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('unauth');
      error.statusCode = 401;
      throw error;
    }

    const rankedCandidates = await rankCandidatesByResumeRate({
      accessToken,
      refreshToken,
      postId: req.query?.post_id || req.body?.post_id
    });

    return res.status(200).json(success(rankedCandidates, 'ranked candidates retrieved successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json(errorResponse('something wrong happened while ranking candidates'));
    }

    return next(error);
  }
}

async function acceptRejectCandidateStatus(req, res, next) {
  try {
    const accessToken = getCookieToken(req, 'access_tokens', 'access_token');
    const refreshToken = getCookieToken(req, 'refresh_tokens', 'refresh_token');

    if (!accessToken || !refreshToken) {
      const error = new Error('unauth');
      error.statusCode = 401;
      throw error;
    }

    const updatedApplication = await acceptRejectCandidate({
      accessToken,
      refreshToken,
      rawPayload: req.body
    });

    return res.status(200).json(success(updatedApplication, 'candidate status updated successfully'));
  } catch (error) {
    if (!error.statusCode) {
      return res.status(500).json(errorResponse('something wrong happened while updating candidate status'));
    }

    if (error.statusCode >= 500) {
      return res.status(error.statusCode).json(errorResponse(error.message));
    }

    return next(error);
  }
}

module.exports = {
  registration,
  login,
  logout,
  addPost,
  getPosts,
  updatePost,
  deletePost,
  rankCandidates,
  acceptRejectCandidateStatus
};
