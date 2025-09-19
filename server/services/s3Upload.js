const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");


const client = new S3Client({
region: process.env.S3_REGION,
endpoint: process.env.S3_ENDPOINT || undefined,
forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
credentials: {
accessKeyId: process.env.S3_ACCESS_KEY_ID,
secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
}
});


function randomKey(name) {
const ext = name?.split(".").pop() || "bin";
return `chat/${new Date().toISOString().slice(0,10)}/${crypto.randomBytes(16).toString("hex")}.${ext}`;
}


async function uploadBuffer({ buffer, mime, name }) {
const Key = randomKey(name);
await client.send(new PutObjectCommand({
Bucket: process.env.S3_BUCKET,
Key,
Body: buffer,
ContentType: mime
}));
const url = await getSignedUrl(client, new PutObjectCommand({
Bucket: process.env.S3_BUCKET,
Key
}), { expiresIn: 60 }); // presigner to verify put, but we already uploaded
// Palautetaan julkinen URL jos bucket julkinen; muutoin rakenna oma signer
const publicUrl = process.env.S3_ENDPOINT
? `${process.env.S3_ENDPOINT.replace(/\/$/, "")}/${process.env.S3_BUCKET}/${Key}`
: `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${Key}`;
return { url: publicUrl, mime, size: buffer.length, name };
}


module.exports = { uploadBuffer };
