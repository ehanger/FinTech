// Compiled to JavaScript only for execution by the official MongoDB entrypoint.
const appUsername = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;
if (!appUsername || !appPassword) throw new Error('Missing MongoDB app credentials');
const fintech = db.getSiblingDB('fintech');
fintech.createUser({ user: appUsername, pwd: appPassword, roles: [{ role: 'readWrite', db: 'fintech' }] });
// Reserved for future authenticated tools; the mortgage calculator never writes here.
fintech.createCollection('userSettings', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'updatedAt'],
      properties: {
        userId: { bsonType: 'string' },
        updatedAt: { bsonType: 'date' },
        preferences: { bsonType: 'object' },
      },
    },
  },
});
fintech.getCollection('userSettings').createIndex({ userId: 1 }, { unique: true });