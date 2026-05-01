const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

const nodeEnv = process.env.NODE_ENV || 'development';

const fallbackMongoUri = process.env.MONGODB_URI || '';
const mongoUriDev = process.env.MONGODB_URI_DEV || fallbackMongoUri;
const mongoUriProd = process.env.MONGO_URL_PROD || process.env.MONGODB_URI_PROD || fallbackMongoUri;

function parsePort(value, fallback = 3000) {
	const port = Number.parseInt(value, 10);

	if (Number.isNaN(port) || port < 1 || port > 65535) {
		return fallback;
	}

	return port;
}

const config = {
	nodeEnv,
	port: parsePort(process.env.PORT, 3000),
	mongoUri: nodeEnv === 'production' ? mongoUriProd : mongoUriDev,
	mongoUriSource: nodeEnv === 'production' ? 'PROD' : 'DEV',
	mongoDbName: process.env.MONGODB_DB_NAME || 'smartHire',
	jwtSecret: process.env.JWT_SECRET || 'change-this-jwt-secret-in-production',
	jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret-in-production',
	n8nApplyWebhookUrl: process.env.N8N_APPLY_WEBHOOK_URL || '',
	n8nApplyWebhookUrl2: process.env.N8N_APPLY_WEBHOOK_URL_2 || '',
	n8nApplyWebhookUrl3: process.env.N8N_APPLY_WEBHOOK_URL_3 || '',
	resendApiKey: process.env.RESEND_API_KEY || '',
	resendFrom: process.env.RESEND_FROM || process.env.SMTP_FROM || 'onboarding@resend.dev',
	smtpHost: process.env.SMTP_HOST || '',
	smtpPort: parsePort(process.env.SMTP_PORT, 587),
	smtpUser: process.env.SMTP_USER || '',
	smtpPass: process.env.SMTP_PASS || '',
	smtpFrom: process.env.SMTP_FROM || '',
	smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
	agentApiBaseUrl: process.env.AGENT_API_BASE_URL || 'http://localhost:8000',
	agentApiKey: process.env.SMARTHIRE_API_KEY || process.env.AGENT_API_KEY || ''
};

module.exports = config;
