// Must be the FIRST import in every test file: sets test env before
// src/config reads process.env.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://hostel:hostel_dev_pw@127.0.0.1:5432/hostel_management_test";
process.env.SESSION_SECRET ??= "test_secret_0f9e8d7c6b5a4321_test_only";
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.CHAT_PROVIDER = "local";
process.env.CHAT_PROVIDER_API_KEY = "";
process.env.ALLOW_SELF_REGISTRATION = "true";
