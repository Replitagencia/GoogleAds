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

CREATE TABLE IF NOT EXISTS client_checklist (
 client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 item_key text NOT NULL, title text NOT NULL, position integer NOT NULL,
 completed boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(client_id,item_key)
);
CREATE OR REPLACE FUNCTION seed_client_checklist() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO client_checklist(client_id,item_key,title,position)
 SELECT NEW.id, item_key, title, position FROM (VALUES
 ('contacto','Registrar contacto y responsable',1),
 ('objetivos','Definir objetivos de la campaña',2),
 ('accesos','Crear y comprobar accesos del cliente',3),
 ('google_ads','Conectar y validar Google Ads',4),
 ('presupuesto','Definir presupuesto y período',5),
 ('seguimiento','Revisar conversiones y medición',6),
 ('revision','Revisar resultados con el cliente',7)
 ) AS defaults(item_key,title,position) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS client_checklist_seed ON clients;
CREATE TRIGGER client_checklist_seed AFTER INSERT ON clients FOR EACH ROW EXECUTE FUNCTION seed_client_checklist();
INSERT INTO client_checklist(client_id,item_key,title,position)
 SELECT c.id,d.item_key,d.title,d.position FROM clients c CROSS JOIN (VALUES
 ('contacto','Registrar contacto y responsable',1),('objetivos','Definir objetivos de la campaña',2),
 ('accesos','Crear y comprobar accesos del cliente',3),('google_ads','Conectar y validar Google Ads',4),
 ('presupuesto','Definir presupuesto y período',5),('seguimiento','Revisar conversiones y medición',6),
 ('revision','Revisar resultados con el cliente',7)
 ) AS d(item_key,title,position) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS client_profiles (
 client_id text PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
 contact_name text NOT NULL DEFAULT '', contact_email text NOT NULL DEFAULT '',
 contact_phone text NOT NULL DEFAULT '', responsible text NOT NULL DEFAULT '',
 internal_notes text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
