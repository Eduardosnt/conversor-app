const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
const convertedDir = path.join(__dirname, 'converted');

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(convertedDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, message: 'Servidor funcionando' });
});

const removeIfExists = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

app.post('/convert-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const inputPath = req.file.path;
    const format = (req.body.format || 'png').toLowerCase();
    const width = req.body.width ? Number(req.body.width) : undefined;
    const height = req.body.height ? Number(req.body.height) : undefined;
    const quality = req.body.quality ? Number(req.body.quality) : 80;

    const outputFile = `${Date.now()}-converted.${format}`;
    const outputPath = path.join(convertedDir, outputFile);

    let transformer = sharp(inputPath);

    if (width || height) {
      transformer = transformer.resize({
        width: width || undefined,
        height: height || undefined,
        fit: 'cover',
      });
    }

    if (format === 'jpeg' || format === 'jpg') {
      transformer = transformer.jpeg({ quality });
    } else if (format === 'png') {
      transformer = transformer.png({ quality });
    } else if (format === 'webp') {
      transformer = transformer.webp({ quality });
    } else if (format === 'avif') {
      transformer = transformer.avif({ quality });
    }

    await transformer.toFile(outputPath);

    res.download(outputPath, outputFile, () => {
      removeIfExists(inputPath);
      removeIfExists(outputPath);
    });
  } catch (error) {
    if (req.file && req.file.path) {
      removeIfExists(req.file.path);
    }

    console.error('Erro na conversão de imagem:', error);
    res.status(500).json({
      error: 'Erro ao converter a imagem.',
      details: error.message,
    });
  }
});

app.post('/convert-video', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const inputPath = req.file.path;
    const format = (req.body.format || 'mp4').toLowerCase();
    const outputFile = `${Date.now()}-converted.${format}`;
    const outputPath = path.join(convertedDir, outputFile);

    ffmpeg(inputPath)
      .outputFormat(format)
      .on('end', () => {
        res.download(outputPath, outputFile, () => {
          removeIfExists(inputPath);
          removeIfExists(outputPath);
        });
      })
      .on('error', (error) => {
        removeIfExists(inputPath);
        removeIfExists(outputPath);
        console.error('Erro na conversão de vídeo:', error);
        res.status(500).json({
          error: 'Erro ao converter o vídeo.',
          details: error.message,
        });
      })
      .save(outputPath);
  } catch (error) {
    if (req.file && req.file.path) {
      removeIfExists(req.file.path);
    }

    console.error('Erro geral de vídeo:', error);
    res.status(500).json({ error: 'Erro ao processar o vídeo.', details: error.message });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload inválido: ${err.message}` });
  }

  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
