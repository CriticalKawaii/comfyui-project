const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const COMFYUI_URL = process.env.COMFYUI_URL;

const activeGenerations = new Map();

function createWorkflow(prompt, setting ={}){
    const defaultSettings = {
        width: 1024,
        height: 1024,
        steps: 20,
        cfg: 1,
        sampler: 'euler',
        scheduler: 'simple',
        seed: -1,
        model: 'FLUX1\\flux1-dev-fp8.safetensors',
        guidance: 3.5
    };

    const finalSettings = { ...defaultSettings, ...setting };

    return {
        "8": {
            "inputs": {
                "samples": ["31", 0],
                "vae": ["30", 2]
            },
            "class_type": "VAEDecode",
            "_meta": { "title": "VAE Decode" }
        },
        "9": {
            "inputs": {
                "filename_prefix": "telegram_bot",
                "images": ["8", 0]
            },
            "class_type": "SaveImage",
            "_meta": { "title": "Save Image" }
        },
        "27": {
            "inputs": {
                "width": finalSettings.width,
                "height": finalSettings.height,
                "batch_size": 1
            },
            "class_type": "EmptySD3LatentImage",
            "_meta": { "title": "EmptySD3LatentImage" }
        },
        "30": {
            "inputs": {
                "ckpt_name": finalSettings.model
            },
            "class_type": "CheckpointLoaderSimple",
            "_meta": { "title": "Load Checkpoint" }
        },
        "31": {
            "inputs": {
                "seed": finalSettings.seed === -1 ? Math.floor(Math.random() * 1000000000000000) : finalSettings.seed,
                "steps": finalSettings.steps,
                "cfg": finalSettings.cfg,
                "sampler_name": finalSettings.sampler,
                "scheduler": finalSettings.scheduler,
                "denoise": 1,
                "model": ["30", 0],
                "positive": ["35", 0],
                "negative": ["33", 0],
                "latent_image": ["27", 0]
            },
            "class_type": "KSampler",
            "_meta": { "title": "KSampler" }
        },
        "33": {
            "inputs": {
                "text": "",
                "clip": ["30", 1]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
        },
        "35": {
            "inputs": {
                "guidance": finalSettings.guidance,
                "conditioning": ["38", 0]
            },
            "class_type": "FluxGuidance",
            "_meta": { "title": "FluxGuidance" }
        },
        "38": {
            "inputs": {
                "from_translate": "auto",
                "to_translate": "en",
                "manual_translate": false,
                "Manual Trasnlate": "Manual Trasnlate",
                "text": prompt,
                "clip": ["30", 1]
            },
            "class_type": "GoogleTranslateCLIPTextEncodeNode",
            "_meta": { "title": "Google Translate CLIP Text Encode Node" }
        }
    };
}

function generateClientId() {
    return Math.random().toString(36).substring(2, 15);
}

function connectWebSocket(clientId) {
    return new Promise((resolve, reject) => {
        const WebSocket = require('ws');
        const ws = new WebSocket(`${COMFYUI_URL.replace('http', 'ws')}/ws?clientId=${clientId}`);
        
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

async function generateImage(prompt, chatId, messageId) {
    const clientId = generateClientId();
    
    try {
        
        const ws = await connectWebSocket(clientId);
        
        ws.on('message', async (data) => {
            const message = JSON.parse(data);
            
            if (message.type === 'executed' && message.data.node === '9') {
                const images = message.data.output.images;
                if (images && images.length > 0) {
                    try {
                        const imageUrl = `${COMFYUI_URL}/view?filename=${images[0].filename}&subfolder=${images[0].subfolder}&type=${images[0].type}`;
                        
                        const response = await axios.get(imageUrl, { responseType: 'stream' });
                        const imagePath = path.join(__dirname, 'temp', `${Date.now()}.png`);
                        
                        if (!fs.existsSync(path.join(__dirname, 'temp'))) {
                            fs.mkdirSync(path.join(__dirname, 'temp'));
                        }
                        
                        const writer = fs.createWriteStream(imagePath);
                        response.data.pipe(writer);
                        
                        writer.on('finish', async () => {
                            await bot.sendPhoto(chatId, imagePath, {
                                caption: `✨ Сгенерировано из: "${prompt}"`
                            });
                            
                            fs.unlinkSync(imagePath);
                            activeGenerations.delete(chatId);
                            
                            await bot.editMessageText('Изображение сгенерировано успешно!', {
                                chat_id: chatId,
                                message_id: messageId
                            });
                        });
                        
                    } catch (error) {
                        console.error('Ошибка обработки изображения:', error);
                        await bot.editMessageText('Ошибка обработки сгенерированного изображения', {
                            chat_id: chatId,
                            message_id: messageId
                        });
                        activeGenerations.delete(chatId);
                    }
                }
            }
        });
        
        const userCustomSettings = getUserSettings(chatId);

        const workflow = createWorkflow(prompt, userCustomSettings);
        
        const response = await axios.post(`${COMFYUI_URL}/prompt`, {
            prompt: workflow,
            client_id: clientId
        });
        
        if (response.data.error) {
            throw new Error(response.data.error);
        }
        
    } catch (error) {
        console.error('Ошибка генерации:', error);
        await bot.editMessageText(`Ошибка: ${error.message}`, {
            chat_id: chatId,
            message_id: messageId
        });
        activeGenerations.delete(chatId);
    }
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🎨 **Бот ComfyUI**

Напишите любой текст для генерации изображения

**Команды:**
/help - Показать справку
/settings - Настройки
/queue - Статус очереди

**Пример:**
\`/красивый закат над горами\`
\`/generate красивый закат над горами\`

Просто напишите любой текст, и я сгенерирую для вас изображение! 🚀
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
🎨 **Как использовать:**

1. Напишите любое текстовое сообщение
2. Или напишите \`/generate [ваш промпт]\` 
3. Дождитесь генерации изображения

**Пример:**
- \`футуристический город ночью\`
- \`/generate футуристический город ночью\`

**Команды:**
/help - Показать справку
/settings - Настройки
/queue - Статус очереди
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/generate (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const prompt = match[1];
    
    if (activeGenerations.has(chatId)) {
        bot.sendMessage(chatId, '⏳ Пожалуйста, дождитесь генерации изображения!');
        return;
    }
    
    activeGenerations.set(chatId, true);
    
    const statusMessage = await bot.sendMessage(chatId, `Создание изображения: "${prompt}"\n⏳ Пожалуйста, подождите...`);
    
    await generateImage(prompt, chatId, statusMessage.message_id);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text.startsWith('/')) return;
    
    if (activeGenerations.has(chatId)) {
        bot.sendMessage(chatId, '⏳ Пожалуйста, дождитесь генерации изображения!');
        return;
    }
    
    activeGenerations.set(chatId, true);
    
    const statusMessage = await bot.sendMessage(chatId, `Создание изображения: "${text}"\n⏳ Пожалуйста, подождите...`);
    
    await generateImage(text, chatId, statusMessage.message_id);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

console.log('telegram bot started');
console.log('ComfyUI URL:', COMFYUI_URL);

const userSettings = new Map();

function getUserSettings(chatId) {
    const defaultSettings = {
        width: 1024,
        height: 1024,
        steps: 20,
        guidance: 3.5
    };
    
    return { ...defaultSettings, ...userSettings.get(chatId) };
}

bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id;
    const current = getUserSettings(chatId);
    
    const keyboard = {
        inline_keyboard: [
            [{ text: `📐 Размер: ${current.width}x${current.height}`, callback_data: 'setting_size' }],
            [{ text: `🎯 Шаги: ${current.steps}`, callback_data: 'setting_steps' }],
            [{ text: `💡 Guidance: ${current.guidance}`, callback_data: 'setting_guidance' }],
            [{ text: '🔄 Установить настройки по умолчанию', callback_data: 'setting_reset' }],
            [{ text: '❌ Закрыть', callback_data: 'setting_close' }]
        ]
    };
    
    bot.sendMessage(chatId, '⚙️ **Настройки:**\n\nНажмите для изменения:', {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    });
});

bot.on('callback_query' , async(callbackQuery)=>{
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const data = callbackQuery.data;

    try{
        await bot.answerCallbackQuery(callbackQuery.id);

        if(data.startsWith('setting_')){
            const current = getUserSettings(chatId);

            switch(data){
                case 'setting_size':
                    const sizeKeyboard = {
                        inline_keyboard:[
                            [{ text: '512x512', callback_data: 'size_512' }],
                            [{ text: '1024x1024', callback_data: 'size_1024' }],
                            [{ text: '1024x1344', callback_data: 'size_portrait' }],
                            [{ text: '1344x1024', callback_data: 'size_landscape' }],
                            [{ text: '⬅️ Назад', callback_data: 'setting_back' }]
                        ]
                    };

                    await bot.editMessageText('📐 **Выберите размер изображения:**', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: sizeKeyboard,
                        parse_mode: 'Markdown'
                    });
                    break;

                case 'setting_steps':
                    const stepsKeyboard = {
                        inline_keyboard: [
                            [{ text: '10 шаги (fast)', callback_data: 'steps_10' }],
                            [{ text: '20 шаги (balanced)', callback_data: 'steps_20' }],
                            [{ text: '30 шаги (quality)', callback_data: 'steps_30' }],
                            [{ text: '50 шаги (max)', callback_data: 'steps_50' }],
                            [{ text: '⬅️ Назад', callback_data: 'setting_back' }]
                        ]
                    };

                    await bot.editMessageText('🎯 **Установите количество шагов:**', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: stepsKeyboard,
                        parse_mode: 'Markdown'
                    });
                    break;

                case 'setting_guidance':
                    const guidanceKeyboard = {
                        inline_keyboard: [
                            [{ text: '2.0 (creative)', callback_data: 'guidance_2' }],
                            [{ text: '3.5 (balanced)', callback_data: 'guidance_3.5' }],
                            [{ text: '5.0 (precise)', callback_data: 'guidance_5' }],
                            [{ text: '7.0 (strict)', callback_data: 'guidance_7' }],
                            [{ text: '⬅️ Back', callback_data: 'setting_back' }]
                        ]
                    };
                    
                    await bot.editMessageText('💡 **Установите Guidance Scale:**', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: guidanceKeyboard,
                        parse_mode: 'Markdown'
                    });
                    break;
                    
                case 'setting_reset':
                    userSettings.delete(chatId);
                    await bot.editMessageText('🔄 **Настройки восстановлены!**\n\nВсе настройки установлены по умолчанию.', {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    });
                    break;
                    
                case 'setting_close':
                    await bot.deleteMessage(chatId, messageId);
                    break;
                    
                case 'setting_back':
                    const updated = getUserSettings(chatId);
                    const backKeyboard = {
                        inline_keyboard: [
                            [{ text: `📐 Размер: ${updated.width}x${updated.height}`, callback_data: 'setting_size' }],
                            [{ text: `🎯 Шаги: ${updated.steps}`, callback_data: 'setting_steps' }],
                            [{ text: `💡 Guidance: ${updated.guidance}`, callback_data: 'setting_guidance' }],
                            [{ text: '🔄 Установить по умолчанию', callback_data: 'setting_reset' }],
                            [{ text: '❌ Закрыть', callback_data: 'setting_close' }]
                        ]
                    };
                    
                    await bot.editMessageText('⚙️ **Настройки:**\n\nНажмите для изменения:', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: backKeyboard,
                        parse_mode: 'Markdown'
                    });
                    break;
            }
        }

        else if (data.startsWith('size_')) {
            const currentSettings = getUserSettings(chatId);
            
            switch (data) {
                case 'size_512':
                    currentSettings.width = 512;
                    currentSettings.height = 512;
                    break;
                case 'size_1024':
                    currentSettings.width = 1024;
                    currentSettings.height = 1024;
                    break;
                case 'size_portrait':
                    currentSettings.width = 1024;
                    currentSettings.height = 1344;
                    break;
                case 'size_landscape':
                    currentSettings.width = 1344;
                    currentSettings.height = 1024;
                    break;
            }
            
            userSettings.set(chatId, currentSettings);
            
            await bot.editMessageText(`✅ **Размер изменен**: ${currentSettings.width}x${currentSettings.height}`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        }
        
        else if (data.startsWith('steps_')) {
            const currentSettings = getUserSettings(chatId);
            const steps = parseInt(data.split('_')[1]);
            currentSettings.steps = steps;
            
            userSettings.set(chatId, currentSettings);
            
            await bot.editMessageText(`✅ **Шаги установлены**: ${steps}`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        }
        
        else if (data.startsWith('guidance_')) {
            const currentSettings = getUserSettings(chatId);
            const guidance = parseFloat(data.split('_')[1]);
            currentSettings.guidance = guidance;
            
            userSettings.set(chatId, currentSettings);
            
            await bot.editMessageText(`✅ **Guidance установлено**: ${guidance}`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        }

    } catch (error) {
        console.error('Callback error:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Произошла ошибка',
            show_alert: true
        });
    }
});

bot.onText(/\/queue/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const response = await axios.get(`${COMFYUI_URL}/queue`);
        const queue = response.data;
        
        const queueSize = queue.queue_running.length + queue.queue_pending.length;
        
        bot.sendMessage(chatId, `📊 **Статус очереди:**\n\n🔄 Запущено: ${queue.queue_running.length}\n⏳ Ожидает: ${queue.queue_pending.length}\n📝 Всего: ${queueSize}`, {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        bot.sendMessage(chatId, 'Не удалось получить статус очереди');
    }
});