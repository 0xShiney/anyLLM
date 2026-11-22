export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT UNIQUE NOT NULL,
	name TEXT NOT NULL,
	password_hash TEXT,
	role TEXT NOT NULL DEFAULT 'customer',
	totp_enabled INTEGER NOT NULL DEFAULT 0,
	email_verified INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orgs (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	slug TEXT UNIQUE NOT NULL,
	balance_micros INTEGER NOT NULL DEFAULT 0 CHECK (balance_micros >= 0),
	zdr INTEGER NOT NULL DEFAULT 0,
	logging_enabled INTEGER NOT NULL DEFAULT 0,
	retention_days INTEGER NOT NULL DEFAULT 30,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
	org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role TEXT NOT NULL,
	PRIMARY KEY (org_id, user_id)
);
CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	logging_enabled INTEGER NOT NULL DEFAULT 0,
	retention_days INTEGER NOT NULL DEFAULT 30,
	zdr INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	prefix TEXT NOT NULL,
	hash TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'active',
	scopes TEXT NOT NULL DEFAULT '',
	rpm INTEGER,
	daily_budget_micros INTEGER,
	monthly_budget_micros INTEGER,
	expires_at TEXT,
	last_used_at TEXT,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS models (
	id TEXT PRIMARY KEY,
	provider TEXT NOT NULL,
	label TEXT NOT NULL,
	context INTEGER NOT NULL,
	input_micros INTEGER NOT NULL,
	output_micros INTEGER NOT NULL,
	cached_micros INTEGER NOT NULL DEFAULT 0,
	markup_pct REAL NOT NULL DEFAULT 15,
	enabled INTEGER NOT NULL DEFAULT 1,
	visible INTEGER NOT NULL DEFAULT 1,
	sort INTEGER NOT NULL DEFAULT 100,
	replaces TEXT,
	verified_at TEXT,
	source TEXT NOT NULL DEFAULT 'demo'
);
CREATE TABLE IF NOT EXISTS usage (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	request_id TEXT NOT NULL,
	org_id TEXT NOT NULL,
	project_id TEXT,
	api_key_id TEXT,
	tag TEXT,
	model TEXT NOT NULL,
	provider TEXT NOT NULL,
	prompt_tokens INTEGER NOT NULL,
	completion_tokens INTEGER NOT NULL,
	cached_tokens INTEGER NOT NULL DEFAULT 0,
	cost_micros INTEGER NOT NULL,
	billed_micros INTEGER NOT NULL,
	latency_ms INTEGER NOT NULL,
	status TEXT NOT NULL,
	stream INTEGER NOT NULL DEFAULT 0,
	estimated INTEGER NOT NULL DEFAULT 0,
	simulated INTEGER NOT NULL DEFAULT 0,
	truncated INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_org_time ON usage (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_tag ON usage (tag);
CREATE TABLE IF NOT EXISTS ledger (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	org_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	amount_micros INTEGER NOT NULL,
	balance_after INTEGER NOT NULL,
	memo TEXT NOT NULL,
	ref TEXT,
	actor TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS holds (
	request_id TEXT PRIMARY KEY,
	org_id TEXT NOT NULL,
	amount_micros INTEGER NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
	api_key_id TEXT NOT NULL,
	endpoint TEXT NOT NULL,
	idem_key TEXT NOT NULL,
	request_hash TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'in_progress',
	response_status INTEGER,
	response_content_type TEXT,
	response_body TEXT,
	response_headers TEXT,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	PRIMARY KEY (api_key_id, endpoint, idem_key)
);
CREATE INDEX IF NOT EXISTS idempotency_expiry ON idempotency_keys (expires_at);
CREATE TABLE IF NOT EXISTS prompt_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id TEXT NOT NULL,
	request_id TEXT NOT NULL,
	tag TEXT,
	model TEXT NOT NULL,
	payload_enc TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS routing_rules (
	id TEXT PRIMARY KEY,
	org_id TEXT NOT NULL,
	tag TEXT NOT NULL,
	target_model TEXT NOT NULL,
	fallback_model TEXT NOT NULL,
	version INTEGER NOT NULL DEFAULT 1,
	status TEXT NOT NULL DEFAULT 'active',
	source TEXT NOT NULL DEFAULT 'manual',
	note TEXT,
	created_by TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS presets (
	id TEXT PRIMARY KEY,
	org_id TEXT NOT NULL,
	slug TEXT NOT NULL,
	version INTEGER NOT NULL,
	config TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS replay_runs (
	id TEXT PRIMARY KEY,
	org_id TEXT NOT NULL,
	tag TEXT NOT NULL,
	sample_size INTEGER NOT NULL,
	candidates TEXT NOT NULL,
	budget_micros INTEGER NOT NULL,
	spent_micros INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL,
	result TEXT,
	created_at TEXT NOT NULL,
	finished_at TEXT
);
CREATE TABLE IF NOT EXISTS tickets (
	id TEXT PRIMARY KEY,
	org_id TEXT,
	subject TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'open',
	priority TEXT NOT NULL DEFAULT 'normal',
	assignee TEXT,
	sla_due TEXT,
	request_id TEXT,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ticket_id TEXT NOT NULL,
	author TEXT NOT NULL,
	body TEXT NOT NULL,
	internal INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promos (
	code TEXT PRIMARY KEY,
	type TEXT NOT NULL,
	value INTEGER NOT NULL,
	min_topup_micros INTEGER NOT NULL DEFAULT 0,
	max_redemptions INTEGER NOT NULL DEFAULT 100,
	redeemed INTEGER NOT NULL DEFAULT 0,
	expires_at TEXT,
	active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS promo_redemptions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	code TEXT NOT NULL,
	org_id TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (code, org_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	actor_email TEXT NOT NULL,
	role TEXT NOT NULL,
	action TEXT NOT NULL,
	target TEXT NOT NULL,
	reason TEXT NOT NULL,
	meta TEXT,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS price_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	model TEXT NOT NULL,
	field TEXT NOT NULL,
	old_value INTEGER,
	new_value INTEGER,
	actor TEXT NOT NULL,
	reason TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
	id TEXT PRIMARY KEY,
	org_id TEXT NOT NULL,
	provider TEXT NOT NULL,
	provider_ref TEXT,
	amount_micros INTEGER NOT NULL,
	fee_micros INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'pending',
	idempotency_key TEXT UNIQUE,
	paid_at TEXT,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhooks (
	id TEXT PRIMARY KEY,
	org_id TEXT NOT NULL,
	url TEXT NOT NULL,
	secret TEXT NOT NULL,
	events TEXT NOT NULL,
	active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	org_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	body TEXT NOT NULL,
	read INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	body TEXT NOT NULL,
	level TEXT NOT NULL DEFAULT 'info',
	active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_keys (
	id TEXT PRIMARY KEY,
	provider TEXT NOT NULL,
	label TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'active',
	balance_note TEXT,
	verified_at TEXT,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS data_policies (
	provider TEXT PRIMARY KEY,
	retention TEXT NOT NULL,
	trains_on_data INTEGER NOT NULL DEFAULT 0,
	zdr_available INTEGER NOT NULL DEFAULT 0,
	verified_at TEXT
);
`;
