// Load .env so EXPO_PUBLIC_* are available when Expo evaluates this config
require("dotenv").config({ path: ".env" });

export default ({ config }) => ({
  ...config,
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:8212/api",
  },
});
