const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');
const CandidateModel = require('../models/candidate.model');
const JobPostModel = require('../models/job-post.model');
const UploadedResumeModel = require('../models/uploaded-resume.model');
const SubmittedApplicationModel = require('../models/submitted-application.model');
const ScoreModel = require('../models/score.model');
const config = require('../config/env');
const { mongoose } = require('../config/database');

const ALLOWED_RESUME_EXTENSIONS = new Set(['.txt', '.docx', '.pdf']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANONYMOUS_CANDIDATE_CONTEXT = {
  candidateId: 'anonymous',
  candidateName: 'Anonymous Candidate',
  candidateEmail: 'anonymous@local.invalid',
  candidateIsConfirmed: true
};

function createClientError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildTokenPayload(candidate, tokenType) {
  return {
    sub: String(candidate._id),
    email: candidate.email,
    tokenType,
    jti: crypto.randomUUID()
  };
}

async function registerCandidate({ name, phone, email, password, is_confirmed }) {
  const existing = await CandidateModel.findOne({ email: email.toLowerCase() }).lean();

  if (existing) {
    throw createClientError('Email is already registered.', 409);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const created = await CandidateModel.create({
    name,
    phone,
    email,
    password: hashedPassword,
    is_confirmed
  });

  return {
    _id: created._id,
    name: created.name,
    phone: created.phone || null,
    email: created.email,
    is_confirmed: created.is_confirmed
  };
}

async function loginCandidate({ email, password }) {
  const candidate = await CandidateModel.findOne({ email: email.toLowerCase() });

  if (!candidate) {
    throw createClientError('wrong email or password', 404);
  }

  const isPasswordMatch = await bcrypt.compare(password, candidate.password);

  if (!isPasswordMatch) {
    throw createClientError('wrong email or password', 404);
  }

  const accessToken = jwt.sign(buildTokenPayload(candidate, 'access'), config.jwtSecret);
  const refreshToken = jwt.sign(buildTokenPayload(candidate, 'refresh'), config.jwtRefreshSecret);

  if (!Array.isArray(candidate.access_tokens)) {
    candidate.access_tokens = [];
  }

  if (!Array.isArray(candidate.refresh_tokens)) {
    candidate.refresh_tokens = [];
  }

  candidate.access_tokens.push(accessToken);
  candidate.refresh_tokens.push(refreshToken);
  await candidate.save();

  return {
    message: 'successfully logged in',
    accessToken,
    refreshToken,
    candidate: {
      _id: candidate._id,
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone || null,
      is_confirmed: candidate.is_confirmed
    }
  };
}

async function logoutCandidate({ accessToken, refreshToken }) {
  await CandidateModel.updateOne(
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

async function getActiveCandidateSession({ accessToken, refreshToken }) {
  const candidate = await CandidateModel.findOne({
    access_tokens: accessToken,
    refresh_tokens: refreshToken
  });

  if (!candidate) {
    throw createClientError('unauth', 401);
  }

  return candidate;
}

function ensureCandidateConfirmed(candidate) {
  if (candidate.is_confirmed !== true) {
    throw createClientError('confirmation required', 400);
  }
}

function ensureDatabaseReady() {
  if (!mongoose.connection?.db || mongoose.connection.readyState !== 1) {
    throw createClientError('service unavailable', 503);
  }
}

async function getActiveJobPostsForCandidate() {
  if (!mongoose.connection?.db || mongoose.connection.readyState !== 1) {
    return [];
  }

  const posts = await JobPostModel.find({ is_active: true }).sort({ posted_at: -1 }).lean();
  return Array.isArray(posts) ? posts : [];
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeCandidateContext(candidateContext = {}) {
  const candidateId = normalizeOptionalString(candidateContext.candidateId) || ANONYMOUS_CANDIDATE_CONTEXT.candidateId;
  const candidateName = normalizeOptionalString(candidateContext.candidateName) || ANONYMOUS_CANDIDATE_CONTEXT.candidateName;
  const candidateEmail = (normalizeOptionalString(candidateContext.candidateEmail)
    || ANONYMOUS_CANDIDATE_CONTEXT.candidateEmail).toLowerCase();

  if (!EMAIL_REGEX.test(candidateEmail)) {
    throw createClientError('candidate_email format is invalid.', 400);
  }

  const candidateIsConfirmed = typeof candidateContext.candidateIsConfirmed === 'boolean'
    ? candidateContext.candidateIsConfirmed
    : ANONYMOUS_CANDIDATE_CONTEXT.candidateIsConfirmed;

  return {
    candidateId,
    candidateName,
    candidateEmail,
    candidateIsConfirmed
  };
}

function validateResumeFile(file) {
  if (!file) {
    throw createClientError('file is required.', 400);
  }

  const extension = path.extname(file.originalname || '').toLowerCase();

  if (!ALLOWED_RESUME_EXTENSIONS.has(extension)) {
    throw createClientError('file type is not allowed.', 400);
  }

  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createClientError('file is required.', 400);
  }
}

function uploadBufferToGridFs({ fileBuffer, filename, contentType, metadata }) {
  return new Promise((resolve, reject) => {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'fs'
    });

    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata
    });

    uploadStream.once('error', reject);
    uploadStream.once('finish', () => resolve(String(uploadStream.id)));

    Readable.from(fileBuffer).pipe(uploadStream);
  });
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

async function getGridFsFileById(fileId) {
  if (!mongoose.isValidObjectId(fileId)) {
    throw createClientError('no file with that id', 404);
  }

  const objectId = new mongoose.Types.ObjectId(fileId);
  const fileDoc = await mongoose.connection.db.collection('fs.files').findOne({ _id: objectId });

  if (!fileDoc) {
    throw createClientError('no file with that id', 404);
  }

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'fs'
  });

  const readyFile = await streamToBuffer(bucket.openDownloadStream(objectId));

  return {
    fileDoc,
    readyFile
  };
}

function buildFullInfo(job) {
  const requirements = Array.isArray(job.requirements) ? job.requirements.join('|') : '';
  const skills = Array.isArray(job.skills) ? job.skills.join('|') : '';

  return `title:${job.title || ''},description:${job.description || ''},requirements:${requirements},employment_type:${job.employment_type || ''},work_mode:${job.work_mode || ''},skills:${skills}`;
}

function buildScoreResumeEndpoint(baseUrl) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  return `${normalizedBase}/score-resume`;
}

function buildChatEndpoint(baseUrl) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  return `${normalizedBase}/chat`;
}

function extractNumericScoreValue(result) {
  const candidateKeys = new Set([
    'score',
    'resume_score',
    'total_score',
    'match_score',
    'rating'
  ]);

  function normalizeNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.trim());

      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }

    return null;
  }

  function walk(node) {
    const direct = normalizeNumber(node);

    if (direct !== null) {
      return direct;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const fromItem = walk(item);

        if (fromItem !== null) {
          return fromItem;
        }
      }

      return null;
    }

    if (!node || typeof node !== 'object') {
      return null;
    }

    for (const [key, value] of Object.entries(node)) {
      if (candidateKeys.has(String(key).toLowerCase())) {
        const fromKnownKey = normalizeNumber(value);

        if (fromKnownKey !== null) {
          return fromKnownKey;
        }
      }
    }

    for (const value of Object.values(node)) {
      const nested = walk(value);

      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  return walk(result);
}

async function updateUploadedResumeRateFromScore({ candidateId, postId, fileGridFsId, scoreValue }) {
  let updatedResume = null;

  const submittedApplication = await SubmittedApplicationModel.findOne({
    candidate_id: candidateId,
    post_id: postId
  })
    .sort({ createdAt: -1 })
    .select('resume_id')
    .lean();

  if (submittedApplication?.resume_id && mongoose.isValidObjectId(submittedApplication.resume_id)) {
    updatedResume = await UploadedResumeModel.findOneAndUpdate(
      {
        _id: submittedApplication.resume_id,
        candidate_id: candidateId
      },
      {
        $set: {
          resume_rate: scoreValue
        }
      },
      {
        new: true
      }
    );
  }

  if (!updatedResume && typeof fileGridFsId === 'string' && fileGridFsId.trim()) {
    updatedResume = await UploadedResumeModel.findOneAndUpdate(
      {
        candidate_id: candidateId,
        resume_gridfs_id: fileGridFsId.trim()
      },
      {
        $set: {
          resume_rate: scoreValue
        }
      },
      {
        new: true,
        sort: { createdAt: -1 }
      }
    );
  }

  return updatedResume;
}

async function callScoreResumeApi({ fullInfo, readyFile, filename, contentType }) {
  const formData = new FormData();
  formData.append('job_description', fullInfo);
  formData.append(
    'file',
    new Blob([readyFile], { type: contentType || 'application/octet-stream' }),
    filename || 'resume.bin'
  );

  const headers = {};

  if (config.agentApiKey) {
    headers['x-api-key'] = config.agentApiKey;
    headers['api-key'] = config.agentApiKey;
    headers.Authorization = `Bearer ${config.agentApiKey}`;
  }

  const response = await fetch(buildScoreResumeEndpoint(config.agentApiBaseUrl), {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    let responseDetails = '';

    try {
      responseDetails = await response.text();
    } catch {
      responseDetails = '';
    }

    const error = createClientError('failed to score resume from upstream service', 502);
    error.details = responseDetails ? responseDetails.slice(0, 500) : undefined;
    throw error;
  }

  const contentTypeHeader = response.headers.get('content-type') || '';

  if (contentTypeHeader.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function callChatApi({ fullInfo, question }) {
  const formData = new FormData();
  formData.append('job_description', fullInfo);
  formData.append('question', question);

  const headers = {};

  if (config.agentApiKey) {
    headers['x-api-key'] = config.agentApiKey;
    headers['api-key'] = config.agentApiKey;
    headers.Authorization = `Bearer ${config.agentApiKey}`;
  }

  const response = await fetch(buildChatEndpoint(config.agentApiBaseUrl), {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    throw createClientError('failed to get chat response from upstream service', 502);
  }

  const contentTypeHeader = response.headers.get('content-type') || '';

  if (contentTypeHeader.includes('application/json')) {
    return response.json();
  }

  const textResponse = await response.text();
  return {
    response: textResponse
  };
}

async function resolveResumeForScoring({ fileId, file, candidateContext }) {
  if (file) {
    validateResumeFile(file);

    const gridFsId = await uploadBufferToGridFs({
      fileBuffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
      metadata: {
        candidate_id: candidateContext.candidateId
      }
    });

    return {
      fileDoc: {
        _id: new mongoose.Types.ObjectId(gridFsId),
        filename: file.originalname,
        contentType: file.mimetype
      },
      readyFile: file.buffer
    };
  }

  if (typeof fileId !== 'string' || !fileId.trim()) {
    throw createClientError('either file or file_id is required.', 400);
  }

  return getGridFsFileById(fileId.trim());
}

async function uploadCandidateResume({ file, postId = null, candidateContext = {} }) {
  validateResumeFile(file);
  ensureDatabaseReady();
  const normalizedCandidateContext = normalizeCandidateContext(candidateContext);

  const gridFsId = await uploadBufferToGridFs({
    fileBuffer: file.buffer,
    filename: file.originalname,
    contentType: file.mimetype,
    metadata: {
      candidate_id: normalizedCandidateContext.candidateId
    }
  });

  const uploadedResume = await UploadedResumeModel.create({
    post_id: typeof postId === 'string' && postId.trim() ? postId.trim() : null,
    candidate_id: normalizedCandidateContext.candidateId,
    candidate_name: normalizedCandidateContext.candidateName,
    candidate_email: normalizedCandidateContext.candidateEmail,
    candidate_is_confirmed: normalizedCandidateContext.candidateIsConfirmed,
    resume_rate: null,
    resume_gridfs_id: gridFsId
  });

  return uploadedResume;
}

async function submitCandidateApplication({ accessToken, refreshToken, postId, file }) {
  if (typeof postId !== 'string' || !postId.trim()) {
    throw createClientError('post_id is required.', 400);
  }

  validateResumeFile(file);
  const candidate = await getActiveCandidateSession({ accessToken, refreshToken });
  ensureCandidateConfirmed(candidate);

  const candidateId = String(candidate._id);
  const normalizedPostId = postId.trim();

  const existingApplication = await SubmittedApplicationModel.findOne({
    candidate_id: candidateId,
    post_id: normalizedPostId
  }).select('_id');

  if (existingApplication) {
    throw createClientError('you already submitted an application for this post, try to submit in another post.', 400);
  }

  const uploadedResume = await uploadCandidateResume({
    accessToken,
    refreshToken,
    file,
    postId: normalizedPostId
  });

  await SubmittedApplicationModel.create({
    post_id: normalizedPostId,
    candidate_id: candidateId,
    candidate_name: candidate.name,
    candidate_email: candidate.email,
    candidate_is_confirmed: candidate.is_confirmed,
    resume_id: String(uploadedResume._id),
    statue: 'pending'
  });
}

async function scoreCandidateResume({ fileId, jobId, file, candidateContext = {} }) {
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw createClientError('job_id is required.', 400);
  }

  ensureDatabaseReady();
  const normalizedCandidateContext = normalizeCandidateContext(candidateContext);

  const post = await JobPostModel.findById(jobId.trim()).lean();

  if (!post) {
    throw createClientError('there is no post with that id', 404);
  }

  const fullInfo = buildFullInfo(post);
  const { fileDoc, readyFile } = await resolveResumeForScoring({
    fileId,
    file,
    candidateContext: normalizedCandidateContext
  });
  const result = await callScoreResumeApi({
    fullInfo,
    readyFile,
    filename: fileDoc.filename,
    contentType: fileDoc.contentType
  });

  const scoreValue = extractNumericScoreValue(result);

  if (scoreValue === null) {
    throw createClientError('score value is missing in scoring response', 502);
  }

  await updateUploadedResumeRateFromScore({
    candidateId: normalizedCandidateContext.candidateId,
    postId: String(post._id),
    fileGridFsId: String(fileDoc._id),
    scoreValue
  });

  const scoreDoc = await ScoreModel.create({
    post_id: String(post._id),
    candidate_id: normalizedCandidateContext.candidateId,
    candidate_name: normalizedCandidateContext.candidateName,
    candidate_email: normalizedCandidateContext.candidateEmail,
    candidate_is_confirmed: normalizedCandidateContext.candidateIsConfirmed,
    file_id: String(fileDoc._id),
    result
  });

  return {
    _id: scoreDoc._id,
    result: scoreDoc.result
  };
}

async function chatCandidate({ jobId, question }) {
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw createClientError('job_id is required.', 400);
  }

  if (typeof question !== 'string' || !question.trim()) {
    throw createClientError('question is required.', 400);
  }

  ensureDatabaseReady();
  const post = await JobPostModel.findById(jobId.trim()).lean();

  if (!post) {
    throw createClientError('there is no post with that id', 404);
  }

  const fullInfo = buildFullInfo(post);
  const chatResult = await callChatApi({
    fullInfo,
    question: question.trim()
  });

  return chatResult;
}

module.exports = {
  registerCandidate,
  loginCandidate,
  logoutCandidate,
  getActiveJobPostsForCandidate,
  uploadCandidateResume,
  submitCandidateApplication,
  scoreCandidateResume,
  chatCandidate
};
