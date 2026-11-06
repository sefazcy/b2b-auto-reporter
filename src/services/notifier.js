import { Api, TelegramApiError } from 'node-telegram-bot-api';

let api = null;

function getApi() {
  if (!api) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token === 'your_bot_token_here') {
      throw new Error('TELEGRAM_BOT_TOKEN is not set (check your .env file)');
    }
    // We only send messages, so a lightweight Api client is enough (no polling Bot)
    api = new Api(token);
  }
  return api;
}

/**
 * Sends a report message to Telegram.
 * The message must be HTML formatted (<b>, <i>, <code>, ...).
 * @param {string} message
 * @returns {Promise<boolean>} whether the message was sent
 */
export async function sendTelegramReport(message) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  try {
    if (!chatId || chatId === 'your_chat_id_here') {
      throw new Error('TELEGRAM_CHAT_ID is not set (check your .env file)');
    }
    await getApi().sendMessage({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    console.log('[notifier] Message sent to Telegram.');
    return true;
  } catch (err) {
    if (err instanceof TelegramApiError) {
      console.error(`[notifier] Telegram API error (${err.errorCode}): ${err.description}`);
    } else {
      console.error(`[notifier] Failed to send Telegram message: ${err.message}`);
    }
    return false;
  }
}
