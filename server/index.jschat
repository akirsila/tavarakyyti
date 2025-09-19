const http = require("http");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const chatRouter = require("./routes/chatRouter");
const attachChatSocket = require("./sockets/chatSocket");


require("dotenv").config();


async function main(){
await mongoose.connect(process.env.MONGODB_URI);


const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 600 }));


// Public assets (admin & widget demo)
app.use(express.static(require("path").join(__dirname, "public")));


// Chat REST
app.use("/api/chat", chatRouter);


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.WEB_ORIGIN, credentials: true } });
app.set("io", io); // REST-puoli voi emittoida


attachChatSocket(io);


const port = process.env.PORT || 3001;
server.listen(port, () => console.log(`Chat server listening on :${port}`));
}


main().catch(err => { console.error(err); process.exit(1); });
