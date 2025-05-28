const { Telegraf } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const http = require('http');

const Token = "7444390857:AAFkFJF6kfZbjhwK_i5P4tZMshya0vBHR9w";
const ApiKey = "a7278af78beb6ae9d931f3ae9f0230d7";
const RequestURL = "https://api.imgbb.com/1/upload";
const BOT_OWNER_ID = 7641491740; // <-- Replace with your Telegram user ID
const bot = new Telegraf(Token);

const DATABASE_CHANNEL = '-1002537575674'; // <-- Replace with your channel username or ID
const LOG_CHANNEL_ID = '-1002683262330'; // <-- Replace with your log channel ID

// Replace with your MongoDB connection string
const MONGODB_URI = 'mongodb+srv://devonic143:rskDynSIS47OCpkJ@cluster0.q8orvya.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // or your MongoDB Atlas URI

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  dateTime: String
});

const imageSchema = new mongoose.Schema({
  userId: Number,
  fileId: String,
  dateTime: String
});

const User = mongoose.model('User', userSchema);
const Image = mongoose.model('Image', imageSchema);

bot.start(async (ctx) => {
  // 1. Send sticker immediately
  let stickerMsg;
  try {
    stickerMsg = await ctx.replyWithSticker('CAACAgUAAxkBAAECEEBlLA-nYcsWmsNWgE8-xqIkriCWAgACJwEAAsiUZBTiPWKAkUSmmh4E');
  } catch (e) {
    console.error('Failed to send sticker:', e);
  }

  // 2. Wait a short time before deleting the sticker (e.g., 700ms)
  if (stickerMsg && stickerMsg.message_id) {
    await new Promise(res => setTimeout(res, 700));
    try {
      await ctx.deleteMessage(stickerMsg.message_id);
    } catch (e) {
      // Ignore if already deleted or can't delete
    }
  }

  // 3. Prepare and send welcome message with button
  const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
  const botUsername = ctx.me || 'YourBotUsername'; // fallback if ctx.me is not set

  const caption = `Hai ${fullName}👋
I am <a href="https://t.me/${botUsername}">Image Host Bot</a>

Send Any Below 32MB Photo To Get Online Link

<blockquote>𝑩𝒚 : @Vishnu_vigil 🗿</blockquote>`;

  await ctx.replyWithPhoto(
    { url: 'https://i.ibb.co/Vcjty0dm/file-11.jpg' },
    {
      caption: caption,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✨ ​ᴜᴘᴅᴀᴛᴇꜱ ᴄʜᴀɴɴᴇʟ​',
              url: 'https://t.me/vishnu_vigil'
            }
          ]
        ]
      }
    }
  );

  const username = ctx.from.username ? `@${ctx.from.username}` : 'No username';
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';
  const dateTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

  // Check if user already exists
  const existingUser = await User.findOne({ userId });
  if (!existingUser) {
    // Save new user to MongoDB
    try {
      await User.create({ userId, username, firstName, lastName, dateTime });
      console.log('User saved to MongoDB:', userId);
    } catch (err) {
      console.error('Failed to save user to MongoDB:', err);
    }

    // Send log to log channel
    const logMsg = `👤 New User Started Bot\nUsername: ${username}\nUser ID: ${userId}\nFirst Name: ${firstName}\nLast Name: ${lastName}\nDate-Time: ${dateTime}`;
    try {
      await ctx.telegram.sendMessage(LOG_CHANNEL_ID, logMsg);
    } catch (err) {
      console.error('Failed to send log to channel:', err);
    }
  }
});

const processImageUpload = async (ctx, fileUrl, downloadingMsgId) => {
  try {
    const response = await axios.get(fileUrl.href, { responseType: 'stream' });
    const tempPath = path.join(__dirname, path.basename(fileUrl.pathname));
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);

    writer.on('finish', async () => {
      const formData = new FormData();
      formData.append('image', fs.createReadStream(tempPath));
      formData.append('key', ApiKey);

      try {
        const uploadResponse = await axios.post(RequestURL, formData, {
          headers: formData.getHeaders(),
        });

        if (uploadResponse.data && uploadResponse.data.data && uploadResponse.data.data.url) {
          const fileUrl = uploadResponse.data.data.url;
          try { await ctx.deleteMessage(downloadingMsgId); } catch (e) {}

          const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.id;
          const safeUrl = escapeMarkdownV2(fileUrl);
          const safeUsername = escapeMarkdownV2(username);

          const message = `𝑳𝒊𝒏𝒌 : <a href="${fileUrl}">${fileUrl}</a>

𝑪𝒍𝒊𝒄𝒌 𝑪𝒐𝒑𝒚 : <code>${fileUrl}</code>

<blockquote>𝑩𝒚 : @Vishnu_vigil 🗿</blockquote>`;

          await ctx.reply(message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_to_message_id: ctx.message.message_id
          });
        } else {
          try { await ctx.deleteMessage(downloadingMsgId); } catch (e) {}
          ctx.reply('An unexpected error occured during uploading your image. Kindly Wait a Moment. If the issue still persist, Please contact Developer!');
        }
      } catch (err) {
        try { await ctx.deleteMessage(downloadingMsgId); } catch (e) {}
        // Log the actual error for debugging
        if (err.response && err.response.data) {
          console.error('imgbb upload error:', err.response.data);
        } else {
          console.error('imgbb upload error:', err);
        }
        ctx.reply('There was an error uploading your image to imgbb. Please try again later.');
      } finally {
        fs.unlinkSync(tempPath);
      }
    });
  } catch (error) {
    try { await ctx.deleteMessage(downloadingMsgId); } catch (e) {}
    ctx.reply('There was an error during uploading your image. Please try again. If the issue still persist, Please contact Developer!');
  }
};

bot.on('photo', async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;
  const fileUrl = await ctx.telegram.getFileLink(fileId);

  // Save image info to MongoDB
  await Image.create({
    userId: ctx.from.id,
    fileId,
    dateTime: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  });

  // Forward the photo to your channel
  await ctx.telegram.sendPhoto(DATABASE_CHANNEL, fileId, {
    caption:
      `🖼️ New Image Uploaded!\n` +
      `👤 User: @${ctx.from.username || ctx.from.id}\n` +
      `🆔 User ID: ${ctx.from.id}\n` +
      `🕒 Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}\n` +
      `📁 File ID: ${fileId}`,
  });

  // Send "Downloading..." message and keep its message id
  const downloadingMsg = await ctx.reply("𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙𝙞𝙣𝙜 𝙏𝙤 𝙈𝙮 𝙎𝙚𝙧𝙗𝙚𝙧 ...");

  // Process image upload and send link
  await processImageUpload(ctx, fileUrl, downloadingMsg.message_id);
});

bot.on('document', async (ctx) => {
  const file = ctx.message.document;
  const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg'];
  if (supportedFormats.includes(file.mime_type)) {
    const fileUrl = await ctx.telegram.getFileLink(file.file_id);

    // Save image info to MongoDB
    await Image.create({
      userId: ctx.from.id,
      fileId: file.file_id,
      dateTime: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    });

    // Forward the document to your channel
    await ctx.telegram.sendDocument(DATABASE_CHANNEL, file.file_id, {
      caption:
        `🖼️ New Image Uploaded!\n` +
        `👤 User: @${ctx.from.username || ctx.from.id}\n` +
        `🆔 User ID: ${ctx.from.id}\n` +
        `🕒 Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}\n` +
        `📁 File ID: ${file.file_id}`,
    });

    // Send "Downloading..." message and keep its message id
    const downloadingMsg = await ctx.reply("𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙𝙞𝙣𝙜 𝙏𝙤 𝙈𝙮 𝙎𝙚𝙧𝙗𝙚𝙧 ...");

    // Process image upload and send link
    await processImageUpload(ctx, fileUrl, downloadingMsg.message_id);
  } else {
    ctx.reply("Apologies, but I can only upload images in PNG and JPG/JPEG formats.");
  }
});

bot.on('video', (ctx) => {
  ctx.reply("Apologies, but I am unable to upload video-type format.");
});

bot.command('stats', async (ctx) => {
  if (ctx.from.id !== BOT_OWNER_ID) {
    return ctx.reply("❌ You are not authorized to use this command.");
  }
  const userCount = await User.countDocuments();
  const imageCount = await Image.countDocuments();
  ctx.reply(`📊 Bot Statistics:\n\n👤 Total Users: ${userCount}\n🖼️ Total Uploaded Images: ${imageCount}`);
});

bot.command('broadcast', async (ctx) => {
  // Only allow the owner
  if (ctx.from.id !== BOT_OWNER_ID) {
    return ctx.reply("❌ You are not authorized to use this command.");
  }

  // Get the message to broadcast (everything after "/broadcast ")
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) {
    return ctx.reply("Please provide a message to broadcast. Example:\n/broadcast Hello users!");
  }

  const users = await User.find({});
  let sent = 0, failed = 0;

  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(user.userId, text);
      sent++;
    } catch (e) {
      failed++;
    }
  }

  ctx.reply(`✅ Broadcast finished!\nSent: ${sent}\nFailed: ${failed}`);
});

(async () => {
  try {
    await bot.launch();
    console.log("Bot is Ready!");

    // Owner ko message bhejein (ab bot ready hai)
    await bot.telegram.sendMessage(BOT_OWNER_ID, "Bot is Ready!");
    // Agar chaho to log channel me bhi bhej sakte ho:
    // await bot.telegram.sendMessage(LOG_CHANNEL_ID, "Bot is Ready!");

  } catch (e) {
    console.error("Bot failed to start or send ready message:", e);
  }
})();

// Add this function anywhere in your file (top or above processImageUpload)
function escapeMarkdownV2(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.end("Bot is running!");
}).listen(PORT);
