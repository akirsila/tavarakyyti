{
  "name": "tavarakyyti",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
 "express": "^4.18.2",
  "mongoose": "^8.0.0",
  "cors": "^2.8.5",
  "dotenv": "^16.0.3",
   "stripe": "^14.0.0",
  "passport": "^0.6.0",
  "passport-google-oauth20": "^2.0.0",
  "express-session": "^1.17.3"
      "@aws-sdk/client-s3": "^3.637.0",
    "@aws-sdk/s3-request-presigner": "^3.637.0",
   
   
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "helmet": "^7.0.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.3.2",
    "multer": "^1.4.5-lts.1",
    "socket.io": "^4.7.5"
  }
}
{
  "name": "tavarakyyti-chat",
  "version": "1.0.0",
  "description": "Tavarakyyti chat module (REST + Socket.IO + S3 + Admin)",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.637.0",
    "@aws-sdk/s3-request-presigner": "^3.637.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "helmet": "^7.0.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.3.2",
    "multer": "^1.4.5-lts.1",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
