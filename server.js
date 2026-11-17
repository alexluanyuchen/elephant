import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import OpenAI, { toFile } from 'openai';
import { fileTypeFromBuffer } from 'file-type';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '请求太频繁了，请稍后再试。' }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('只支持 JPG、PNG 或 WEBP 图片。'));
  }
});

const SCENES = {
  forest: 'a lush tropical forest with soft sunbeams, natural greenery and a calm atmosphere',
  savanna: 'a beautiful African savanna at golden hour, warm sunlight and distant acacia trees',
  flowers: 'a dreamy meadow filled with delicate wildflowers, soft pastel colors and gentle daylight',
  sanctuary: 'a peaceful ethical elephant sanctuary with a natural green landscape; the elephant is calm and treated respectfully',
  studio: 'an elegant professional photography studio with a warm neutral seamless background and softbox lighting'
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY) });
});

app.post('/api/generate', generateLimiter, upload.single('photo'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: '服务器尚未配置 AI API 密钥。请先在服务器 .env 文件中设置 OPENAI_API_KEY。' });
    }
    if (!req.file) return res.status(400).json({ error: '请先上传一张照片。' });

    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      return res.status(400).json({ error: '图片文件格式无法验证，请重新选择 JPG、PNG 或 WEBP。' });
    }

    const sceneKey = String(req.body.scene || 'forest');
    const scene = SCENES[sceneKey] || SCENES.forest;
    const extra = String(req.body.extra || '').trim().slice(0, 300);
    const prompt = `Edit the uploaded photograph into a beautiful, photorealistic keepsake portrait featuring the same person naturally posing beside one friendly Asian elephant. Preserve the person's recognizable facial identity, age, skin tone, hairstyle, expression and clothing as faithfully as possible. Do not add extra people. The person and elephant should be close together but not touching in a way that looks unsafe. The elephant must look calm, healthy and respectfully portrayed; no riding, chains, hooks, distress or forced performance. Scene: ${scene}. Make the lighting, perspective, shadows, scale and color grading coherent so the result looks like one professionally photographed moment. Keep the person's face clear and natural, with realistic anatomy and hands. ${extra ? `Additional creative direction: ${extra}.` : ''} Create a polished, high-resolution photographic image. Do not add text, logos or watermarks.`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const imageFile = await toFile(req.file.buffer, req.file.originalname || 'portrait.jpg', {
      type: detected.mime
    });

    const result = await client.images.edit({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
      image: imageFile,
      prompt,
      size: '1024x1024',
      quality: 'high',
      output_format: 'png'
    });

    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) throw new Error('AI 服务没有返回图片，请稍后重试。');
    res.json({ image: `data:image/png;base64,${b64}` });
  } catch (error) {
    console.error('Image generation failed:', error?.message || error);
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    let message = '生成失败，请稍后重试。';
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      message = '图片不能超过 12 MB。';
    } else if (error?.message?.includes('只支持')) {
      message = error.message;
    } else if (status === 401) {
      message = '服务器 API 密钥无效，请检查服务端配置。';
    } else if (status === 429) {
      message = 'AI 服务暂时繁忙或额度不足，请稍后再试。';
    } else if (error?.message?.includes('API key')) {
      message = '服务器尚未正确配置 AI API 密钥。';
    }
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 12 MB。' : '上传失败，请重新选择图片。';
    return res.status(400).json({ error: message });
  }
  if (err) return res.status(400).json({ error: err.message || '请求无效。' });
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Elephant Dream AI is running at http://localhost:${PORT}`);
});
