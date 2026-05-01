const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const HrModel = require('../models/hr.model');
const UploadedResumeModel = require('../models/uploaded-resume.model');
const JobPostModel = require('../models/job-post.model');
const SubmittedApplicationModel = require('../models/submitted-application.model');
const config = require('../config/env');
const { mongoose } = require('../config/database');
const { sendConfirmationCodeEmail } = require('./email.service');

function createClientError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateSixDigitCode() {
  const code = crypto.randomInt(0, 1000000);
  return String(code).padStart(6, '0');
}

function isCodeExpired(expiresAt) {
  if (!expiresAt) {
    return true;
  }

  return new Date(expiresAt).getTime() < Date.now();
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function findActivePrincipal(accessToken, refreshToken) {
  const hr = await HrModel.findOne({
    access_tokens: accessToken,
    refresh_tokens: refreshToken
  });

  if (hr) {
    return {
      type: 'hr',
      record: hr
    };
  }

  const candidatesCollection = mongoose.connection.db.collection('candidates');
  const candidate = await candidatesCollection.findOne({
    access_tokens: accessToken,
    refresh_tokens: refreshToken
  });

  if (candidate) {
    return {
      type: 'candidate',
      record: candidate
    };
  }

  return null;
}

async function setConfirmationCode(principal, codeHash, expiresAt) {
  if (principal.type === 'hr') {
    principal.record.email_confirmation_code_hash = codeHash;
    principal.record.email_confirmation_expires_at = expiresAt;
    await principal.record.save();
    return;
  }

  await mongoose.connection.db.collection('candidates').updateOne(
    { _id: principal.record._id },
    {
      $set: {
        email_confirmation_code_hash: codeHash,
        email_confirmation_expires_at: expiresAt
      }
    }
  );
}

async function confirmPrincipalEmail(principal) {
  if (principal.type === 'hr') {
    principal.record.is_confirmed = true;
    principal.record.email_confirmation_code_hash = null;
    principal.record.email_confirmation_expires_at = null;
    await principal.record.save();
    return;
  }

  await mongoose.connection.db.collection('candidates').updateOne(
    { _id: principal.record._id },
    {
      $set: {
        is_confirmed: true,
        email_confirmation_code_hash: null,
        email_confirmation_expires_at: null
      }
    }
  );
}

async function registerHr({ name, phone, email, password, is_confirmed }) {
  const existing = await HrModel.findOne({ email: email.toLowerCase() }).lean();

  if (existing) {
    throw createClientError('Email is already registered.', 409);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const created = await HrModel.create({
    name,
    phone,
    email,
    password: hashedPassword,
    is_confirmed
  });

  return {
    _id: created._id,
    name: created.name,
    phone: created.phone,
    email: created.email,
    is_confirmed: created.is_confirmed
  };
}

function buildTokenPayload(hr, tokenType) {
  return {
    sub: String(hr._id),
    email: hr.email,
    tokenType,
    jti: crypto.randomUUID()
  };
}

async function loginHr({ email, password }) {
  const hr = await HrModel.findOne({ email: email.toLowerCase() });

  if (!hr) {
    throw createClientError('wrong email or password', 404);
  }

  const isPasswordMatch = await bcrypt.compare(password, hr.password);

  if (!isPasswordMatch) {
    throw createClientError('wrong email or password', 404);
  }

  const accessToken = jwt.sign(buildTokenPayload(hr, 'access'), config.jwtSecret);
  const refreshToken = jwt.sign(buildTokenPayload(hr, 'refresh'), config.jwtRefreshSecret);

  if (!Array.isArray(hr.access_tokens)) {
    hr.access_tokens = [];
  }

  if (!Array.isArray(hr.refresh_tokens)) {
    hr.refresh_tokens = [];
  }

  hr.access_tokens.push(accessToken);
  hr.refresh_tokens.push(refreshToken);
  await hr.save();

  return {
    message: 'successfully logged in',
    accessToken,
    refreshToken,
    hr: {
      _id: hr._id,
      name: hr.name,
      email: hr.email,
      is_confirmed: hr.is_confirmed
    }
  };
}

async function logoutHr({ accessToken, refreshToken }) {
  await HrModel.updateOne(
    {
      access_tokens: accessToken,
      refresh_tokens: refreshToken
    },
    {
      $pull: {
        access_tokens: accessToken,
        refresh_tokens: refreshToken
      }
    }
  );
}

async function getActiveConfirmedHr({ accessToken, refreshToken }) {
  const hr = await HrModel.findOne({
    access_tokens: accessToken,
    refresh_tokens: refreshToken
  });

  if (!hr) {
    throw createClientError('unauth', 401);
  }

  if (hr.is_confirmed !== true) {
    throw createClientError('confirmation required', 400);
  }

  return hr;
}

function normalizeRankedResume(resume, rank) {
  return {
    rank,
    resume_id: String(resume._id),
    post_id: resume.post_id || null,
    resume_rate: Number.isFinite(resume.resume_rate) ? resume.resume_rate : null,
    candidate: {
      candidate_id: resume.candidate_id || null,
      name: resume.candidate_name || null,
      email: resume.candidate_email || null,
      is_confirmed: resume.candidate_is_confirmed === true
    }
  };
}

async function rankCandidatesByResumeRate({ accessToken, refreshToken, postId }) {
  await getActiveConfirmedHr({ accessToken, refreshToken });

  const normalizedPostId = typeof postId === 'string' ? postId.trim() : '';

  if (!normalizedPostId) {
    throw createClientError('post_id is required.', 400);
  }

  const resumes = await UploadedResumeModel.find({
    post_id: normalizedPostId
  }).lean();

  if (!Array.isArray(resumes) || resumes.length === 0) {
    return [];
  }

  resumes.sort((a, b) => {
    const aRate = Number.isFinite(a.resume_rate) ? a.resume_rate : Number.NEGATIVE_INFINITY;
    const bRate = Number.isFinite(b.resume_rate) ? b.resume_rate : Number.NEGATIVE_INFINITY;

    if (bRate !== aRate) {
      return bRate - aRate;
    }

    return String(a._id).localeCompare(String(b._id));
  });

  return resumes.map((resume, index) => normalizeRankedResume(resume, index + 1));
}

function buildAcceptRejectWebhookEndpoint(webhookUrl) {
  return String(webhookUrl || '').trim();
}

async function callAcceptRejectCandidateWebhook({ candidateName, candidateEmail, status, jobTitle }) {
  const webhookUrl = buildAcceptRejectWebhookEndpoint(config.n8nApplyWebhookUrl3);

  if (!webhookUrl) {
    throw createClientError('accept/reject candidate webhook is not configured.', 503);
  }

  if (!candidateName || !candidateEmail || !status || !jobTitle) {
    throw createClientError('accept/reject candidate webhook payload is incomplete.', 400);
  }

  const controller = new AbortController();
  const timeoutMs = 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: candidateName,
        email: candidateEmail,
        status,
        jobTitle
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      let responseDetails = '';

      try {
        responseDetails = await response.text();
      } catch (_error) {
        responseDetails = '';
      }

      const error = createClientError('failed to deliver candidate status email workflow', 502);
      error.details = responseDetails ? responseDetails.slice(0, 500) : undefined;
      throw error;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = createClientError('candidate status email workflow timed out', 504);
      timeoutError.details = `Request exceeded ${timeoutMs}ms.`;
      throw timeoutError;
    }

    if (error?.statusCode) {
      throw error;
    }

    const webhookError = createClientError('failed to deliver candidate status email workflow', 502);
    webhookError.details = error?.message ? String(error.message).slice(0, 500) : undefined;
    throw webhookError;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeAcceptRejectCandidatePayload(rawPayload = {}) {
  const candidateId = toTrimmedString(rawPayload.candidate_id);
  const statue = toTrimmedString(rawPayload.statue).toLowerCase();

  if (!candidateId) {
    throw createClientError('candidate_id is required.', 400);
  }

  if (!statue) {
    throw createClientError('statue is required.', 400);
  }

  if (!['accepted', 'rejected'].includes(statue)) {
    throw createClientError('statue must be accepted or rejected.', 400);
  }

  return {
    candidateId,
    statue
  };
}

async function acceptRejectCandidate({ accessToken, refreshToken, rawPayload = {} }) {
  await getActiveConfirmedHr({ accessToken, refreshToken });

  const payload = normalizeAcceptRejectCandidatePayload(rawPayload);
  const submittedApplication = await SubmittedApplicationModel.findOne({
    candidate_id: payload.candidateId
  }).sort({ updatedAt: -1, createdAt: -1 });

  if (!submittedApplication) {
    throw createClientError('submitted application not found', 404);
  }

  if (!mongoose.isValidObjectId(submittedApplication.post_id)) {
    throw createClientError('there is no post with that id', 404);
  }

  const jobPost = await JobPostModel.findById(submittedApplication.post_id).select('title').lean();

  if (!jobPost) {
    throw createClientError('there is no post with that id', 404);
  }

  submittedApplication.statue = payload.statue;
  await submittedApplication.save();

  await callAcceptRejectCandidateWebhook({
    candidateName: submittedApplication.candidate_name,
    candidateEmail: submittedApplication.candidate_email,
    status: submittedApplication.statue,
    jobTitle: jobPost.title
  });

  return {
    _id: submittedApplication._id,
    post_id: submittedApplication.post_id,
    candidate_id: submittedApplication.candidate_id,
    candidate_name: submittedApplication.candidate_name,
    candidate_email: submittedApplication.candidate_email,
    resume_id: submittedApplication.resume_id,
    statue: submittedApplication.statue,
    jobTitle: jobPost.title
  };
}

async function sendEmailConfirmationCode({ accessToken, refreshToken }) {
  const principal = await findActivePrincipal(accessToken, refreshToken);

  if (!principal) {
    throw createClientError('no active sessions', 400);
  }

  if (principal.record.is_confirmed === true) {
    throw createClientError('already confirmed', 400);
  }

  if (!principal.record.email || typeof principal.record.email !== 'string') {
    throw createClientError('email is not available for active session', 400);
  }

  const code = generateSixDigitCode();
  const codeHash = hashVerificationCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await setConfirmationCode(principal, codeHash, expiresAt);
  await sendConfirmationCodeEmail({ to: principal.record.email, code });
}

async function verifyEmailConfirmationCode({ accessToken, refreshToken, code }) {
  const principal = await findActivePrincipal(accessToken, refreshToken);

  if (!principal) {
    throw createClientError('no active sessions', 400);
  }

  if (principal.record.is_confirmed === true) {
    throw createClientError('already confirmed', 400);
  }

  const incomingCodeHash = hashVerificationCode(code);
  const savedCodeHash = principal.record.email_confirmation_code_hash;
  const expiresAt = principal.record.email_confirmation_expires_at;

  if (!savedCodeHash || savedCodeHash !== incomingCodeHash || isCodeExpired(expiresAt)) {
    throw createClientError('wrong code', 400);
  }

  await confirmPrincipalEmail(principal);
}

module.exports = {
  registerHr,
  loginHr,
  logoutHr,
  rankCandidatesByResumeRate,
  acceptRejectCandidate,
  sendEmailConfirmationCode,
  verifyEmailConfirmationCode
};
