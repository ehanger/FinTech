const healthUsername = process.env.MONGO_INITDB_ROOT_USERNAME;
const healthPassword = process.env.MONGO_INITDB_ROOT_PASSWORD;
if (!healthUsername || !healthPassword) quit(1);
const admin = db.getSiblingDB('admin');
admin.auth(healthUsername, healthPassword);
quit(admin.runCommand({ ping: 1 }).ok === 1 ? 0 : 1);