declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    INQUIRY_INTAKE_ENABLED?: string;
    INQUIRY_LOCAL_TEST_MODE?: string;
    INQUIRY_PRIVACY_VERSION?: string;
    INQUIRY_RETENTION_NOTICE?: string;
    INQUIRY_PRIVACY_CONTACT?: string;
    INQUIRY_RATE_LIMIT_SECRET?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_HOSTNAME?: string;
    ADMIN_ENABLED?: string;
    ADMIN_ACCESS_TEAM_DOMAIN?: string;
    ADMIN_ACCESS_AUDIENCE?: string;
    ADMIN_ACCESS_EMAILS?: string;
    ADMIN_LOCAL_ENABLED?: string;
    ADMIN_LOCAL_SECRET?: string;
    INQUIRY_NOTIFICATION_MODE?: string;
    INQUIRY_NOTIFICATION_TO?: string;
    INQUIRY_NOTIFICATION_ADMIN_ORIGIN?: string;
    KAKAO_ALIMTALK_PROVIDER?: string;
    KAKAO_ALIMTALK_SENDER_PROFILE_ID?: string;
    KAKAO_ALIMTALK_TEMPLATE_CODE?: string;
    KAKAO_ALIMTALK_RECIPIENT_PHONE?: string;
    KAKAO_ALIMTALK_API_AUTH?: string;
    KAKAO_ALIMTALK_ADMIN_URL?: string;
    SMS_PROVIDER?: string;
    SMS_RECIPIENT_PHONE?: string;
    SMS_SENDER_PHONE?: string;
    SMS_SEND_ENABLED?: string;
    SOLAPI_API_KEY?: string;
    SOLAPI_API_SECRET?: string;
  }
}
