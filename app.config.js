// Merges with app.json. Expo reads app.json first and passes it in as `config`;
// here we only override where Android's google-services.json comes from.
//
// On EAS Build the file is provided by the `GOOGLE_SERVICES_JSON` env var (an EAS
// "file" secret), so it never has to live in git. Locally (and if the env var is
// unset) it falls back to the google-services.json on disk.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
