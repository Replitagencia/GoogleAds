CREATE TABLE IF NOT EXISTS portal_users (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 is_admin boolean NOT NULL DEFAULT false,disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS clients (
 id text PRIMARY KEY, name text NOT NULL,status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,PRIMARY KEY(user_id,client_id)
);
CREATE TABLE IF NOT EXISTS invitations (
 id text PRIMARY KEY,token_hash text NOT NULL UNIQUE,email text NOT NULL,client_id text REFERENCES clients(id),is_admin boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,used_at timestamptz,created_by text REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK (client_id IS NOT NULL OR is_admin)
);
CREATE TABLE IF NOT EXISTS google_connections (
 client_id text PRIMARY KEY REFERENCES clients(id),refresh_token text NOT NULL,customer_id text,account_name text,currency text,time_zone text,updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
 state text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id),client_id text NOT NULL REFERENCES clients(id),expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS account_budgets (
 id text PRIMARY KEY,client_id text NOT NULL REFERENCES clients(id),customer_id text NOT NULL,month text NOT NULL,amount bigint NOT NULL CHECK(amount>0),updated_at bigint NOT NULL,UNIQUE(client_id,customer_id,month)
);
CREATE TABLE IF NOT EXISTS agency_activities (
 id text PRIMARY KEY,client_id text NOT NULL REFERENCES clients(id),customer_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('done','next','note')),title text NOT NULL,body text NOT NULL,created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_client_idx ON agency_activities(client_id,customer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS report_cache (id text PRIMARY KEY,payload text NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id bigserial PRIMARY KEY,actor_id text REFERENCES "user"(id),action text NOT NULL,client_id text REFERENCES clients(id),details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
