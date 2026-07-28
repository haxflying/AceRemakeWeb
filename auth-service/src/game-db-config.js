export function getGameDbConfig() {
  return {
    provider: process.env.ACE_AUTH_DB_PROVIDER || "SQLOLEDB.1",
    userId: process.env.ACE_AUTH_DB_USER || "",
    password: process.env.ACE_AUTH_DB_PASSWORD || "",
    database: process.env.ACE_AUTH_DB_NAME || "atum2_db_account",
    dataSource: process.env.ACE_AUTH_DB_HOST || "localhost",
    networkAddress: process.env.ACE_AUTH_DB_NETWORK_ADDRESS || "localhost,1433",
    networkLibrary: process.env.ACE_AUTH_DB_NETWORK_LIBRARY || "dbmssocn",
    trustedConnection: (process.env.ACE_AUTH_DB_TRUSTED_CONNECTION || "true").toLowerCase() === "true"
  };
}

export function createOleDbConnectionString(config = getGameDbConfig()) {
  const parts = [
    `Provider=${config.provider}`,
    "Persist Security Info=False",
    `Initial Catalog=${config.database}`,
    `Data Source=${config.dataSource}`,
    `Network Address=${config.networkAddress}`,
    `Network Library=${config.networkLibrary}`
  ];

  if (config.trustedConnection) {
    parts.push("Integrated Security=SSPI");
  } else {
    parts.push(`User ID=${config.userId}`);
    parts.push(`pwd=${config.password}`);
  }

  return parts.join(";");
}
