const request = require('supertest');
const app = require('../src/app');

describe('Health API', () => {
	it('returns health details', async () => {
		const response = await request(app).get('/health');

		expect(response.statusCode).toBe(200);
		expect(response.body).toMatchObject({
			success: true,
			message: 'Service healthy'
		});
		expect(response.body.data).toHaveProperty('status', 'ok');
		expect(response.body.data).toHaveProperty('database.requiredCollections');
	});

	it('returns 404 for unknown route', async () => {
		const response = await request(app).get('/unknown');

		expect(response.statusCode).toBe(404);
		expect(response.body.success).toBe(false);
	});

	it('validates required payload for HR registration', async () => {
		const response = await request(app)
			.post('/hr/registration')
			.type('form')
			.send({});

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
	});

	it('rejects raw JSON payload for HR registration', async () => {
		const response = await request(app)
			.post('/hr/registration')
			.set('Content-Type', 'application/json')
			.send({
				name: 'Test HR',
				phone: '01000000000',
				email: 'test@example.com',
				password: 'StrongPass123',
				is_confirmed: false
			});

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('validates required payload for HR login', async () => {
		const response = await request(app)
			.post('/hr/login')
			.set('Content-Type', 'application/json')
			.send({});

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
	});

	it('rejects non-json payload for HR login', async () => {
		const response = await request(app)
			.post('/hr/login')
			.type('form')
			.send({ email: 'hr@example.com', password: 'password123' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('returns no active sessions when logout cookies are missing', async () => {
		const response = await request(app).post('/hr/logout');

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('no active sessions');
	});

	it('rejects raw JSON payload for add-post endpoint', async () => {
		const response = await request(app)
			.post('/hr/add-post')
			.set('Content-Type', 'application/json')
			.send({ title: 'Backend Engineer' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('returns unauth when add-post cookies are missing', async () => {
		const response = await request(app)
			.post('/hr/add-post')
			.type('form')
			.send({ title: 'Backend Engineer' });

		expect(response.statusCode).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('unauth');
	});

	it('returns unauth when get-posts cookies are missing', async () => {
		const response = await request(app).get('/hr/get-posts');

		expect(response.statusCode).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('unauth');
	});

	it('returns unauth when rank-candidates cookies are missing', async () => {
		const response = await request(app)
			.get('/hr/rank-candidates')
			.query({ post_id: '680000000000000000000000' });

		expect(response.statusCode).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('unauth');
	});

	it('rejects raw JSON payload for update-post endpoint', async () => {
		const response = await request(app)
			.put('/hr/update-post')
			.set('Content-Type', 'application/json')
			.send({ _id: '680000000000000000000000' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('returns unauth when update-post cookies are missing', async () => {
		const response = await request(app)
			.put('/hr/update-post')
			.type('form')
			.send({ _id: '680000000000000000000000' });

		expect(response.statusCode).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('unauth');
	});

	it('rejects raw JSON payload for delete-post endpoint', async () => {
		const response = await request(app)
			.delete('/hr/delete-post')
			.set('Content-Type', 'application/json')
			.send({ _id: '680000000000000000000000' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('returns unauth when delete-post cookies are missing', async () => {
		const response = await request(app)
			.delete('/hr/delete-post')
			.type('form')
			.send({ _id: '680000000000000000000000' });

		expect(response.statusCode).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('unauth');
	});

	it('returns no active sessions when email-confirmation has no session cookies', async () => {
		const response = await request(app)
			.put('/user/email-confirmation')
			.type('form')
			.send({});

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('no active sessions');
	});

	it('rejects raw json payload for email-confirmation endpoint', async () => {
		const response = await request(app)
			.put('/user/email-confirmation')
			.set('Content-Type', 'application/json')
			.send({ code: '123456' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('returns no active sessions when send-confirmation-code has no session cookies', async () => {
		const response = await request(app)
			.post('/user/send-confirmation-code')
			.type('form')
			.send({});

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('no active sessions');
	});

	it('returns no active sessions for send-confirmation-code even with json payload', async () => {
		const response = await request(app)
			.post('/user/send-confirmation-code')
			.set('Content-Type', 'application/json')
			.send({});

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('no active sessions');
	});

	it('validates required payload for candidate registration with optional phone', async () => {
		const response = await request(app)
			.post('/candidate/registration')
			.type('form')
			.send({});

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
	});

	it('rejects raw JSON payload for candidate registration', async () => {
		const response = await request(app)
			.post('/candidate/registration')
			.set('Content-Type', 'application/json')
			.send({
				name: 'Test Candidate',
				email: 'candidate@example.com',
				password: 'StrongPass123'
			});

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('validates required payload for candidate login', async () => {
		const response = await request(app)
			.post('/candidate/login')
			.set('Content-Type', 'application/json')
			.send({});

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
	});

	it('rejects non-json payload for candidate login', async () => {
		const response = await request(app)
			.post('/candidate/login')
			.type('form')
			.send({ email: 'candidate@example.com', password: 'password123' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('returns no active sessions when candidate logout cookies are missing', async () => {
		const response = await request(app).post('/candidate/logout');

		expect(response.statusCode).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('no active sessions');
	});

	it('returns candidate get-posts without requiring cookies', async () => {
		const response = await request(app).get('/candidate/get-posts');

		expect(response.statusCode).toBe(200);
		expect(response.body.success).toBe(true);
		expect(Array.isArray(response.body.data)).toBe(true);
	});

	it('rejects raw JSON payload for candidate upload-resume endpoint', async () => {
		const response = await request(app)
			.post('/candidate/upload-resume')
			.set('Content-Type', 'application/json')
			.send({});

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('does not require cookies for candidate upload-resume endpoint', async () => {
		const response = await request(app)
			.post('/candidate/upload-resume')
			.type('form')
			.attach('file', Buffer.from('sample resume'), 'resume.txt');

		expect(response.statusCode).toBe(503);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('Internal Server Error');
	});

	it('returns 404 when file does not exist in GridFS', async () => {
		const response = await request(app).get('/files/680000000000000000000000');

		expect(response.statusCode).toBe(404);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('no file with that id');
	});

	it('rejects raw JSON payload for candidate submit-application endpoint', async () => {
		const response = await request(app)
			.post('/candidate/submit-application')
			.set('Content-Type', 'application/json')
			.send({ post_id: '680000000000000000000000' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('returns unauth when candidate submit-application cookies are missing', async () => {
		const response = await request(app)
			.post('/candidate/submit-application')
			.type('form')
			.field('post_id', '680000000000000000000000')
			.attach('file', Buffer.from('sample resume'), 'resume.txt');

		expect(response.statusCode).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('unauth');
	});

	it('rejects raw JSON payload for candidate score-resume endpoint', async () => {
		const response = await request(app)
			.post('/candidate/score-resume')
			.set('Content-Type', 'application/json')
			.send({ file_id: '680000000000000000000000', job_id: '680000000000000000000001' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('does not require cookies for candidate score-resume endpoint', async () => {
		const response = await request(app)
			.post('/candidate/score-resume')
			.type('form')
			.send({ file_id: '680000000000000000000000', job_id: '680000000000000000000001' });

		expect(response.statusCode).toBe(503);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('Internal Server Error');
	});

	it('rejects raw JSON payload for candidate chat endpoint', async () => {
		const response = await request(app)
			.post('/candidate/chat')
			.set('Content-Type', 'application/json')
			.send({ question: 'What are the key requirements?', job_id: '680000000000000000000001' });

		expect(response.statusCode).toBe(415);
		expect(response.body.success).toBe(false);
	});

	it('does not require cookies for candidate chat endpoint', async () => {
		const response = await request(app)
			.post('/candidate/chat')
			.type('form')
			.send({ question: 'What are the key requirements?', job_id: '680000000000000000000001' });

		expect(response.statusCode).toBe(503);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe('Internal Server Error');
	});
});
