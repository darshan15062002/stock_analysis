const fs = require("fs");
const path = require("path");
const axios = require("axios");

const audioDir = path.join(process.cwd(), "public", "audio");
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

async function generateElevenAudio(text) {
    const voiceId = "EXAVITQu4vr4xnSDxMaL"; // Rachel

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await axios.post(
        url,
        {
            text: text,
            voice_settings: {
                stability: 0.25,
                similarity_boost: 0.8
            }
        },
        {
            headers: {
                "xi-api-key": process.env.ELEVEN_API_KEY || "sk_f62be4131d09368a48d7e017d1a9f01b63b978b8364336c7",
                "Content-Type": "application/json"
            },
            responseType: "arraybuffer" // CRITICAL
        }
    );

    const buffer = Buffer.from(response.data);

    const fileName = `story-${Date.now()}.mp3`;
    const filePath = path.join(audioDir, fileName);

    fs.writeFileSync(filePath, buffer);

    return `/audio/${fileName}`;
}

module.exports = { generateElevenAudio };
