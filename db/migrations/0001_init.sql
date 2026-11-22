-- Skema produksi (PostgreSQL). Runtime demo memakai padanan SQLite di
-- apps/web/src/lib/server/db/schema.ts; uang selalu bigint mikro-IDR.
CREATE TABLE users (
	id uuid PRIMARY KEY,
	email citext UNIQUE NOT NULL,
	name text NOT NULL,
	password_hash text,
	email_verified_at timestamptz,
	totp_secret text,
	role text NOT NULL DEFAULT 'customer',
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
	id text PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orgs (
	id uuid PRIMARY KEY,
	name text NOT NULL,
	slug text UNIQUE NOT NULL,
	balance_micros bigint NOT NULL DEFAULT 0 CHECK (balance_micros >= 0),
	currency text NOT NULL DEFAULT 'IDR',
	zdr boolean NOT NULL DEFAULT false,
	logging_enabled boolean NOT NULL DEFAULT false,
	retention_days int NOT NULL DEFAULT 30,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
	org_id uuid REFERENCES orgs(id) ON DELETE CASCADE,
	user_id uuid REFERENCES users(id) ON DELETE CASCADE,
	role text NOT NULL,
	PRIMARY KEY (org_id, user_id)
);

CREATE TABLE projects (
	id uuid PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
	name text NOT NULL,
	logging_enabled boolean NOT NULL DEFAULT false,
	retention_days int NOT NULL DEFAULT 30,
	zdr boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	name text NOT NULL,
	prefix text NOT NULL,
	hash text NOT NULL,
	status text NOT NULL DEFAULT 'active',
	scopes text[] NOT NULL DEFAULT '{}',
	rpm int,
	daily_budget_micros bigint,
	monthly_budget_micros bigint,
	expires_at timestamptz,
	last_used_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE models (
	id text PRIMARY KEY,               -- 'provider/model'
	provider text NOT NULL,
	label text NOT NULL,
	context int NOT NULL,
	input_micros bigint NOT NULL,      -- per 1M token
	output_micros bigint NOT NULL,
	cached_micros bigint NOT NULL DEFAULT 0,
	markup_pct numeric(6,2) NOT NULL DEFAULT 12,
	enabled boolean NOT NULL DEFAULT true,
	visible boolean NOT NULL DEFAULT true,
	sort int NOT NULL DEFAULT 100,
	replaces text REFERENCES models(id),
	verified_at date,
	source text NOT NULL DEFAULT 'demo'
);

-- Partisi bulanan: usage_2026_11, dst. Retensi mengikuti kebijakan per paket.
CREATE TABLE usage (
	id bigint GENERATED ALWAYS AS IDENTITY,
	request_id text NOT NULL,
	org_id uuid NOT NULL REFERENCES orgs(id),
	project_id uuid REFERENCES projects(id),
	api_key_id uuid REFERENCES api_keys(id),
	tag text,
	model text NOT NULL,
	provider text NOT NULL,
	prompt_tokens int NOT NULL,
	completion_tokens int NOT NULL,
	cached_tokens int NOT NULL DEFAULT 0,
	cost_micros bigint NOT NULL,
	billed_micros bigint NOT NULL,
	latency_ms int NOT NULL,
	status text NOT NULL,
	stream boolean NOT NULL DEFAULT false,
	estimated boolean NOT NULL DEFAULT false,
	simulated boolean NOT NULL DEFAULT false,
	truncated boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE ledger (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id),
	kind text NOT NULL,                -- topup | charge | refund | grant | adjust
	amount_micros bigint NOT NULL,     -- positif masuk, negatif keluar
	balance_after bigint NOT NULL,
	memo text NOT NULL,
	ref text,
	actor text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_org_time ON ledger (org_id, created_at DESC);

CREATE TABLE holds (
	request_id text PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id),
	amount_micros bigint NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency-Key per API key per endpoint. Respons sukses disimpan selama TTL
-- (24 jam); baris in_progress memakai lease 60 detik agar proses mati tidak mengunci key.
CREATE TABLE idempotency_keys (
	api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
	endpoint text NOT NULL,
	idem_key text NOT NULL,
	request_hash text NOT NULL,
	status text NOT NULL DEFAULT 'in_progress',
	response_status int,
	response_content_type text,
	response_body text,
	response_headers jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL,
	PRIMARY KEY (api_key_id, endpoint, idem_key)
);
CREATE INDEX idempotency_expiry ON idempotency_keys (expires_at);

CREATE TABLE prompt_logs (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	request_id text NOT NULL,
	tag text,
	model text NOT NULL,
	payload_enc text NOT NULL,
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routing_rules (
	id uuid PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
	tag text NOT NULL,
	target_model text NOT NULL,
	fallback_model text NOT NULL,
	version int NOT NULL DEFAULT 1,
	status text NOT NULL DEFAULT 'active',
	source text NOT NULL DEFAULT 'manual',
	note text,
	created_by text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE presets (
	id uuid PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
	slug text NOT NULL,
	version int NOT NULL,
	config jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE replay_runs (
	id uuid PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
	tag text NOT NULL,
	sample_size int NOT NULL,
	candidates jsonb NOT NULL,
	budget_micros bigint NOT NULL,
	spent_micros bigint NOT NULL DEFAULT 0,
	status text NOT NULL,
	result jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	finished_at timestamptz
);

CREATE TABLE tickets (
	id uuid PRIMARY KEY,
	org_id uuid REFERENCES orgs(id),
	subject text NOT NULL,
	status text NOT NULL DEFAULT 'open',
	priority text NOT NULL DEFAULT 'normal',
	assignee text,
	sla_due timestamptz,
	request_id text,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_messages (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
	author text NOT NULL,
	body text NOT NULL,
	internal boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promos (
	code text PRIMARY KEY,
	type text NOT NULL,                -- credit | percent | amount
	value bigint NOT NULL,
	min_topup_micros bigint NOT NULL DEFAULT 0,
	max_redemptions int NOT NULL DEFAULT 100,
	redeemed int NOT NULL DEFAULT 0,
	expires_at timestamptz,
	active boolean NOT NULL DEFAULT true
);

CREATE TABLE promo_redemptions (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	code text NOT NULL REFERENCES promos(code),
	org_id uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (code, org_id)
);

CREATE TABLE audit_log (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	actor_email text NOT NULL,
	role text NOT NULL,
	action text NOT NULL,
	target text NOT NULL,
	reason text NOT NULL,
	meta jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;

CREATE TABLE price_history (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	model text NOT NULL,
	field text NOT NULL,
	old_value bigint,
	new_value bigint,
	actor text NOT NULL,
	reason text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
	id uuid PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id),
	provider text NOT NULL,
	provider_ref text,
	amount_micros bigint NOT NULL,
	fee_micros bigint NOT NULL DEFAULT 0,
	status text NOT NULL DEFAULT 'pending',
	idempotency_key text UNIQUE,
	paid_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhooks (
	id uuid PRIMARY KEY,
	org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
	url text NOT NULL,
	secret text NOT NULL,
	events text NOT NULL,
	active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	org_id uuid NOT NULL,
	kind text NOT NULL,
	body text NOT NULL,
	read boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE announcements (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	body text NOT NULL,
	level text NOT NULL DEFAULT 'info',
	active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provider_keys (
	id uuid PRIMARY KEY,
	provider text NOT NULL,
	label text NOT NULL,
	status text NOT NULL DEFAULT 'active',
	balance_note text,
	verified_at date,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE data_policies (
	provider text NOT NULL,
	retention text NOT NULL,
	trains_on_data boolean NOT NULL DEFAULT false,
	zdr_available boolean NOT NULL DEFAULT false,
	verified_at date,
	PRIMARY KEY (provider)
);
