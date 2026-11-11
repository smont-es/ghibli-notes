const APP_CONFIG = {
  cognito: {
    domain: "",
    clientId: "",
    redirectUri: "http://localhost:5500/",
    logoutUri: "http://localhost:5500/",
    scopes: ["openid", "email", "profile"]
  },

  api: {
    baseUrl: ""
  }
};