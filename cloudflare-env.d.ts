declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_ADS_DEVELOPER_TOKEN?: string;
    TOKEN_ENCRYPTION_KEY?: string;
    SITE_URL?: string;
  }
}
