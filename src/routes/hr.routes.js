const { Router } = require('express');
const express = require('express');
const multer = require('multer');
const {
	registration,
	login,
	logout,
	addPost,
	getPosts,
	updatePost,
	deletePost,
	rankCandidates,
	acceptRejectCandidateStatus
} = require('../controllers/hr.controller');

const hrRouter = Router();
const formDataParser = multer();

function requireFormContentType(req, res, next) {
	if (req.is('multipart/form-data') || req.is('application/x-www-form-urlencoded')) {
		return next();
	}

	const error = new Error('Content-Type must be multipart/form-data or application/x-www-form-urlencoded.');
	error.statusCode = 415;
	return next(error);
}

function requireJsonContentType(req, res, next) {
	if (req.is('application/json')) {
		return next();
	}

	const error = new Error('Content-Type must be application/json.');
	error.statusCode = 415;
	return next(error);
}

hrRouter.post('/registration', requireFormContentType, formDataParser.none(), registration);
hrRouter.post('/login', requireJsonContentType, express.json({ limit: '32kb' }), login);
hrRouter.post('/logout', logout);
hrRouter.post('/add-post', requireFormContentType, formDataParser.none(), addPost);
hrRouter.get('/get-posts', getPosts);
hrRouter.get('/rank-candidates', rankCandidates);
hrRouter.put('/update-post', requireFormContentType, formDataParser.none(), updatePost);
hrRouter.put('/accept-reject-candidate', requireFormContentType, formDataParser.none(), acceptRejectCandidateStatus);
hrRouter.delete('/delete-post', requireFormContentType, formDataParser.none(), deletePost);

module.exports = hrRouter;
